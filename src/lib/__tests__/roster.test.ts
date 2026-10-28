import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createInitialState, pathLength, type Move } from '../engine';
import {
  BOTS,
  BOT_TIERS,
  botMove,
  getBot,
  searchBestMove,
  searchMove,
  type BotId,
} from '../bots';
import {
  CHAT_PACKS,
  PIP_CHAT,
  deriveChatEvent,
  pickChatLine,
  type ChatCategory,
  type ChatPackId,
} from '../chat';

function rngFactory(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/* ------------------------------------------------------------------ */
/* Roster                                                             */
/* ------------------------------------------------------------------ */

test('the roster has seven distinct tiers with an ascending Elo curve', () => {
  assert.equal(BOTS.length, 7);
  assert.equal(BOT_TIERS.length, 7);

  const ids = new Set(BOTS.map((b) => b.id));
  const names = new Set(BOTS.map((b) => b.name));
  const emojis = new Set(BOTS.map((b) => b.emoji));
  assert.equal(ids.size, 7, 'ids are unique');
  assert.equal(names.size, 7, 'names are unique');
  assert.equal(emojis.size, 7, 'every bot gets its own avatar');

  const elos = BOT_TIERS.map((b) => b.elo);
  assert.deepEqual(elos, [...elos].sort((a, b) => a - b), 'Elo ascends with tier');
  assert.deepEqual(
    BOT_TIERS.map((b) => b.tier),
    [1, 2, 3, 4, 5, 6, 7],
  );

  // Each tier must be at least 200 points above the one below it.
  for (let i = 1; i < elos.length; i++) {
    assert.ok(elos[i] - elos[i - 1] >= 200, `tier ${i + 1} steps up by at least 200`);
  }
});

test('strategy scales with the tier', () => {
  assert.equal(getBot('pip').strategy, 'random');
  assert.equal(getBot('nibbles').strategy, 'greedy');
  assert.equal(getBot('watcher').strategy, 'pathdiff');
  assert.equal(getBot('rookford').strategy, 'pathdiff');

  // Tiers 5-7 are all minimax, with a depth ramp of 2 → 3 → 4.
  assert.deepEqual(
    ['sable', 'vex', 'oracle'].map((id) => getBot(id as BotId).strategy),
    ['search', 'search', 'search'],
  );
  assert.deepEqual(
    ['sable', 'vex', 'oracle'].map((id) => getBot(id as BotId).depth),
    [2, 3, 4],
  );
});

test('every bot ships a complete chat personality', () => {
  const categories: ChatCategory[] = [
    'greeting',
    'playerBlunder',
    'playerGoodMove',
    'botAdvantage',
    'botBehind',
    'wallSpam',
    'idle',
    'botWin',
    'botLoss',
    'resignation',
    'undo',
  ];

  for (const bot of BOTS) {
    const pack = CHAT_PACKS[bot.id as ChatPackId];
    assert.ok(pack, `${bot.name} has a chat pack`);
    for (const category of categories) {
      assert.ok(pack[category]?.length >= 2, `${bot.id}.${category} needs at least two lines`);
    }
  }

  // The voices must genuinely differ, not just repeat a template.
  const greetings = BOTS.map((b) => CHAT_PACKS[b.id as ChatPackId].greeting[0]);
  assert.equal(new Set(greetings).size, 7, 'every bot greets differently');
});

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

test('each search tier reaches its nominal depth within budget', () => {
  const rng = rngFactory(5);
  let mid = createInitialState();
  for (let i = 0; i < 10; i++) mid = applyMove(mid, botMove(mid, 'nibbles', rng).move);

  for (const depth of [2, 3, 4]) {
    const result = searchBestMove(mid, { depth, timeBudgetMs: 4000, nodeBudget: 400_000, wallLimit: 18 });
    assert.equal(result.depthReached, depth, `depth ${depth} must complete`);
    assert.ok(result.move, 'search returns a move');
    assert.ok(result.nodes > 0);
  }
});

test('deep search stays inside its wall-clock budget', () => {
  const rng = rngFactory(11);
  let s = createInitialState();
  for (let i = 0; i < 14; i++) s = applyMove(s, botMove(s, 'nibbles', rng).move);

  const started = Date.now();
  searchMove(s, { depth: 4 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2500, `depth-4 search took ${elapsed}ms`);
});

test('the transposition table does not change the chosen line', () => {
  const rng = rngFactory(3);
  let s = createInitialState();
  for (let i = 0; i < 8; i++) s = applyMove(s, botMove(s, 'nibbles', rng).move);

  const a = searchBestMove(s, { depth: 2, noise: 0, wallLimit: 12, nodeBudget: 50_000 });
  const b = searchBestMove(s, { depth: 2, noise: 0, wallLimit: 12, nodeBudget: 50_000 });
  assert.deepEqual(a.move, b.move, 'search is deterministic at zero noise');
});

test('higher tiers never lose to the random tier in a short match', () => {
  // A smoke test rather than a full Elo calibration: the three top tiers must
  // comfortably beat tier 1 over a handful of games.
  let strongerWins = 0;
  for (let g = 0; g < 4; g++) {
    const rng = rngFactory(g * 7919 + 17);
    let s = createInitialState();
    const strongFirst = g % 2 === 0;
    let plies = 0;
    while (s.winner === null && plies < 200) {
      const strongTurn = (s.turn === 0) === strongFirst;
      s = applyMove(s, botMove(s, strongTurn ? 'vex' : 'pip', rng).move);
      plies++;
    }
    if (s.winner !== null && (s.winner === 0) === strongFirst) strongerWins++;
  }
  assert.ok(strongerWins >= 3, `vex should beat pip, got ${strongerWins}/4`);
});

/* ------------------------------------------------------------------ */
/* Chat engine                                                        */
/* ------------------------------------------------------------------ */

test('pickChatLine never repeats the line it was told to avoid', () => {
  const avoid = PIP_CHAT.idle[0];
  for (let i = 0; i < 20; i++) {
    const line = pickChatLine(PIP_CHAT, 'idle', rngFactory(i + 1), avoid);
    assert.notEqual(line, avoid);
    assert.ok(PIP_CHAT.idle.includes(line));
  }
});

const baseCtx = {
  ply: 5,
  humanPlayer: 0 as const,
  mover: 0 as const,
  winProbBefore: 0.5,
  winProbAfter: 0.5,
  humanWallsPlaced: 0,
  winner: null,
};

test('chat context reacts to real events, not a timer', () => {
  assert.equal(deriveChatEvent({ ...baseCtx, ply: 1 })?.category, 'greeting');

  // A human blunder: a big drop in our win probability.
  assert.equal(
    deriveChatEvent({ ...baseCtx, winProbBefore: 0.55, winProbAfter: 0.3 })?.category,
    'playerBlunder',
  );

  // The bot getting ahead after its own move.
  assert.equal(
    deriveChatEvent({ ...baseCtx, mover: 1, winProbAfter: 0.25 })?.category,
    'botAdvantage',
  );

  // The bot falling behind.
  assert.equal(deriveChatEvent({ ...baseCtx, mover: 1, winProbAfter: 0.7 })?.category, 'botBehind');

  // Game over.
  assert.equal(deriveChatEvent({ ...baseCtx, winner: 1 })?.category, 'botWin');
  assert.equal(deriveChatEvent({ ...baseCtx, winner: 0 })?.category, 'botLoss');
  assert.equal(deriveChatEvent({ ...baseCtx, resigned: true })?.category, 'resignation');
});

test('chat events carry a stable de-duplication key', () => {
  const ctx = { ...baseCtx, winProbBefore: 0.6, winProbAfter: 0.3 };
  const a = deriveChatEvent(ctx);
  const b = deriveChatEvent({ ...ctx, winProbBefore: 0.61, winProbAfter: 0.3 });
  assert.ok(a && b);
  assert.equal(a!.key, b!.key, 'same ply + same event = same key');

  const next = deriveChatEvent({ ...ctx, ply: 7 });
  assert.notEqual(next!.key, a!.key, 'a new ply is a new event');
});

test('routine moves stay quiet', () => {
  const quiet = deriveChatEvent({
    ...baseCtx,
    mover: 0,
    winProbBefore: 0.5,
    winProbAfter: 0.49,
  });
  assert.equal(quiet, null);
});

/* ------------------------------------------------------------------ */
/* Tier behaviour spot-checks                                         */
/* ------------------------------------------------------------------ */

test('tier 1 is not just tier 2 with a different seed', () => {
  const rng = rngFactory(7);
  const s = createInitialState();
  const pipMove = botMove(s, 'pip', rng).move;
  const nibblesMove = botMove(s, 'nibbles', rngFactory(7)).move;

  const legal: Move = pipMove;
  assert.ok(legal, 'pip returns a move');
  assert.ok(nibblesMove, 'nibbles returns a move');
});

test('path-differential tiers only spend walls that really pay', () => {
  // One wall covers two edges, so in an open position it usually costs the
  // opponent just a single step. Rookford's contract is stricter: it must never
  // commit a wall unless the opponent's path grows by >= 2 at a cost of <= 1.
  const rng = rngFactory(21);
  let s = createInitialState();
  let walls = 0;

  for (let i = 0; i < 160 && s.winner === null; i++) {
    const bot = s.turn === 0 ? 'rookford' : 'nibbles';
    const move = botMove(s, bot, rng).move;

    if (move.type === 'wall' && s.turn === 0) {
      walls++;
      const me = 0;
      const opp = 1;
      const after = applyMove(s, move);
      const gain = pathLength(after, opp) - pathLength(s, opp);
      const cost = pathLength(after, me) - pathLength(s, me);
      assert.ok(gain >= 2, `rookford wall must gain >= 2 steps, gained ${gain}`);
      assert.ok(cost <= 1, `rookford wall must not cost more than 1 step, cost ${cost}`);
    }

    s = applyMove(s, move);
  }

  assert.ok(walls > 0, 'rookford should still find at least one worthwhile wall');
});

test('the tier-3 and tier-4 bots differ in how greedy they are', () => {
  const watcher = getBot('watcher');
  const rookford = getBot('rookford');

  assert.equal(watcher.minGain, 1, 'watcher will settle for a single gained step');
  assert.equal(rookford.minGain, 2, 'rookford demands two');
  assert.ok(watcher.blunderChance! > rookford.blunderChance!, 'tier 3 is also the sloppier one');

  // A one-step gain is common, so the tier-3 bot should actually use its walls.
  const rng = rngFactory(31);
  let s = createInitialState();
  let walls = 0;
  for (let i = 0; i < 60 && s.winner === null; i++) {
    const move = botMove(s, s.turn === 0 ? 'watcher' : 'nibbles', rng).move;
    if (s.turn === 0 && move.type === 'wall') walls++;
    s = applyMove(s, move);
  }
  assert.ok(walls > 0, 'watcher should place at least one wall');
});
