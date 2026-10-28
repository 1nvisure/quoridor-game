import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, createInitialState, parseCell, type Move } from '../engine';
import { botMove } from '../bots';
import {
  analyzeGame,
  analyzeGameAsync,
  analyzePosition,
  classify,
  moveAccuracy,
  positionAdvantage,
  winProbability,
} from '../review';

function rngFactory(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function makeGame(seed: number, length = 30) {
  const rng = rngFactory(seed);
  let s = createInitialState();
  const moves: Move[] = [];
  while (s.winner === null && moves.length < length) {
    const { move } = botMove(s, moves.length % 3 === 0 ? 'nibbles' : 'rookford', rng);
    moves.push(move);
    s = applyMove(s, move);
  }
  return moves;
}

test('win probability is a sigmoid centred at 50%', () => {
  assert.equal(Math.round(winProbability(0) * 100), 50);
  assert.ok(winProbability(1) > 0.5);
  assert.ok(winProbability(-1) < 0.5);
  assert.ok(winProbability(3) > winProbability(1));
  assert.ok(winProbability(100) === 1);
  assert.ok(winProbability(-100) === 0);
});

test('classifications follow the win-probability drop', () => {
  assert.equal(classify(0, true), 'best');
  assert.equal(classify(1, false), 'excellent');
  assert.equal(classify(4, false), 'good');
  assert.equal(classify(9, false), 'inaccuracy');
  assert.equal(classify(15, false), 'mistake');
  assert.equal(classify(40, false), 'blunder');
});

test('accuracy is monotonic in the loss', () => {
  assert.equal(moveAccuracy(0), 100);
  const ladder = [0, 2, 5, 10, 20, 40].map(moveAccuracy);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i] < ladder[i - 1], `accuracy must decrease: ${ladder}`);
  }
  assert.ok(ladder[ladder.length - 1] >= 0);
});

test('the opening position is balanced', () => {
  const adv = positionAdvantage(createInitialState());
  assert.ok(Math.abs(adv) < 0.01, `expected ~0, got ${adv}`);
});

test('analyzePosition ranks the best pawn advance in the opening', () => {
  const s = createInitialState();
  const result = analyzePosition(s, { depth: 1 });
  assert.ok(result.best);
  assert.ok(result.ranked.length > 5);
  // The engine should be pushing the pawn up the board, not burning a wall.
  assert.equal(result.best!.move.type, 'pawn');
  const advs = result.ranked.map((r) => r.advantage);
  assert.equal(advs[0], Math.max(...advs));
});

test('analyzeGame produces a complete, self-consistent report', async () => {
  const moves = makeGame(77, 24);
  const analysis = analyzeGame(createInitialState(), moves);

  assert.equal(analysis.plies.length, moves.length);
  assert.equal(analysis.graph.length, moves.length + 1);
  assert.equal(analysis.keyMoments.length > 0, true);

  for (const p of analysis.plies) {
    assert.ok(p.winProbAfter >= 0 && p.winProbAfter <= 1);
    assert.ok(p.loss >= 0);
    assert.ok(p.accuracy >= 0 && p.accuracy <= 100);
    // A finished game leaves the winner's distance at 0 — never negative.
    assert.ok(p.paths[0] >= 0 && p.paths[1] >= 0);
  }

  // Any classified blunder must come with a real drop in win probability.
  for (const p of analysis.plies) {
    if (p.classification === 'blunder') assert.ok(p.loss >= 22, `blunder loss ${p.loss}`);
  }

  // Aggregate counts must match the plies.
  const best0 = analysis.plies.filter((p) => p.player === 0 && p.classification === 'best').length;
  assert.equal(analysis.players[0].counts.best, best0);
  assert.ok(analysis.accuracy[0] > 0 && analysis.accuracy[0] <= 100);
  assert.ok(analysis.averageRating >= 400);
});

test('the async analyser matches the synchronous one', async () => {
  const moves = makeGame(31, 12);
  const sync = analyzeGame(createInitialState(), moves);
  let progressCalls = 0;
  const asyncResult = await analyzeGameAsync(createInitialState(), moves, {
    onProgress: () => {
      progressCalls++;
    },
  });

  assert.equal(progressCalls, moves.length);
  assert.deepEqual(asyncResult.accuracy, sync.accuracy);
  assert.equal(asyncResult.plies.length, sync.plies.length);
  assert.equal(asyncResult.keyMoments.length, sync.keyMoments.length);
});

test('a deliberately awful move is flagged as a mistake or worse', () => {
  let s = createInitialState();
  s = applyMove(s, { type: 'pawn', to: parseCell('e2') });
  s = applyMove(s, { type: 'pawn', to: parseCell('e8') });
  s = applyMove(s, { type: 'pawn', to: parseCell('e3') });
  s = applyMove(s, { type: 'pawn', to: parseCell('e7') });

  // Green is at e3 (2 steps in). Sidestepping to d3 is a pure tempo loss.
  const moves: Move[] = [
    { type: 'pawn', to: parseCell('e2') },
    { type: 'pawn', to: parseCell('e8') },
    { type: 'pawn', to: parseCell('e3') },
    { type: 'pawn', to: parseCell('e7') },
    { type: 'pawn', to: parseCell('d3') },
  ];
  const analysis = analyzeGame(createInitialState(), moves);
  const last = analysis.plies[analysis.plies.length - 1];
  assert.ok(
    ['inaccuracy', 'mistake', 'blunder'].includes(last.classification),
    `expected a penalty for the side-step, got ${last.classification}`,
  );
  assert.ok(last.loss > 0, 'a wasted tempo must cost win probability');
});
