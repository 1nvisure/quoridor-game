import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove,
  createInitialState,
  isMoveLegal,
  legalPawnMoves,
  legalWalls,
  pathLength,
  type GameState,
  type Move,
} from '../engine';
import { botMove, evaluate, firstLegalMove, searchBestMove, type BotId } from '../bots';

function rngFactory(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function playGame(bot0: BotId, bot1: BotId, seed: number, maxPlies = 250) {
  const rng = rngFactory(seed);
  let s = createInitialState();
  let plies = 0;
  const wallPlies: boolean[] = [];

  while (s.winner === null && plies < maxPlies) {
    const bot = s.turn === 0 ? bot0 : bot1;
    const { move } = botMove(s, bot, rng);

    assert.ok(isMoveLegal(s, move), `${bot} produced an illegal move at ply ${plies}: ${JSON.stringify(move)}`);

    const next = applyMove(s, move);
    if (move.type === 'wall') wallPlies.push(true);

    // The anti-trap invariant must hold on every single position.
    assert.notEqual(pathLength(next, 0), Infinity, `player 0 was trapped at ply ${plies}`);
    assert.notEqual(pathLength(next, 1), Infinity, `player 1 was trapped at ply ${plies}`);

    s = next;
    plies++;
  }

  return { state: s, plies };
}

test('all seven bots only ever play legal, non-trapping moves', () => {
  for (const bot of ['pip', 'nibbles', 'watcher', 'rookford', 'sable', 'vex', 'oracle'] as BotId[]) {
    for (let seed = 1; seed <= 3; seed++) {
      // Legality and the anti-trap invariant are asserted inside playGame for
      // every single half-move. Two *random* walkers (tier 1) can wander for a
      // long time by design, so only the tiers that actually plan must finish.
      const { state } = playGame(bot, bot, seed * 9767);
      if (bot !== 'pip') {
        assert.notEqual(state.winner, null, `${bot} seed ${seed} failed to finish`);
      }
    }
  }
});

test('the easiest bot plays fast and sometimes places walls', () => {
  const rng = rngFactory(11);
  let s = createInitialState();
  let walls = 0;
  for (let i = 0; i < 40 && s.winner === null; i++) {
    const t = Date.now();
    const { move } = botMove(s, 'nibbles', rng);
    assert.ok(Date.now() - t < 50, 'the easy tiers must be instant');
    if (move.type === 'wall') walls++;
    s = applyMove(s, move);
  }
  assert.ok(walls > 0, 'the easy tiers should place random walls occasionally');
});

test('advanced search respects its time budget', () => {
  const s = createInitialState();
  const t = Date.now();
  const res = searchBestMove(s, { depth: 3, timeBudgetMs: 1000, nodeBudget: 9000, wallLimit: 18 });
  const elapsed = Date.now() - t;
  assert.ok(elapsed < 1800, `search took ${elapsed}ms`);
  assert.ok(res.move, 'search returns a move');
  assert.ok(res.nodes > 0, 'search visited nodes');
});

test('evaluation is antisymmetric for negamax (tempo goes to the side to move)', () => {
  const s = createInitialState();
  // Distances are identical in the opening, so the only asymmetry is tempo.
  assert.equal(evaluate(s, 0), -evaluate(s, 1));
  assert.equal(evaluate(s, 0), 3, 'side to move gets the tempo bonus');
});

test('firstLegalMove always exists on a fresh board', () => {
  const move = firstLegalMove(createInitialState());
  assert.ok(move);
  assert.equal(move!.type, 'pawn');
});

test('bots never run out of walls out of order', () => {
  let s = createInitialState();
  s.left = [0, 0];
  const rng = rngFactory(3);
  for (let i = 0; i < 20 && s.winner === null; i++) {
    const { move } = botMove(s, 'rookford', rng);
    assert.equal(move.type, 'pawn', 'with no walls left the bot must walk');
    s = applyMove(s, move);
  }
});

test('a bot completes a game against itself in reasonable time', () => {
  const t = Date.now();
  const { state } = playGame('vex', 'rookford', 4242);
  assert.notEqual(state.winner, null);
  assert.ok(Date.now() - t < 60_000, 'game should finish in under a minute');
});

test('legal move lists stay consistent', () => {
  const s: GameState = createInitialState();
  assert.ok(legalPawnMoves(s, 0).length >= 2);
  assert.ok(legalWalls(s, 0).length > 100, 'most of the 128 slots are legal');
  const move: Move = { type: 'wall', wall: { r: 4, c: 4, o: 'h' } };
  assert.ok(isMoveLegal(s, move));
});
