import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove,
  applyMoves,
  bfs,
  cellName,
  createInitialState,
  isEdgeBlocked,
  isWallLegal,
  legalPawnMoves,
  legalWalls,
  parseCell,
  pathLength,
  type Move,
} from '../engine';

const at = (name: string) => parseCell(name);

test('initial set-up matches Quoridor rules', () => {
  const s = createInitialState();
  assert.deepEqual(s.pawns[0], { r: 8, c: 4 });
  assert.deepEqual(s.pawns[1], { r: 0, c: 4 });
  assert.equal(cellName(s.pawns[0]), 'e1');
  assert.equal(cellName(s.pawns[1]), 'e9');
  assert.deepEqual(s.left, [10, 10]);
  assert.equal(pathLength(s, 0), 8);
  assert.equal(pathLength(s, 1), 8);
  assert.equal(legalPawnMoves(s, 0).length, 3); // e2, d1, f1
});

test('straight jump over the opponent', () => {
  const s = createInitialState();
  s.pawns[0] = at('e4');
  s.pawns[1] = at('e5');
  const moves = legalPawnMoves(s, 0).map(cellName);
  assert.ok(moves.includes('e6'), `straight jump missing: ${moves.join(',')}`);
});

test('diagonal jump when the straight jump is walled', () => {
  let s = createInitialState();
  s.pawns[0] = at('e4');
  s.pawns[1] = at('e5');
  // Horizontal wall between rows 5 and 6, columns 4-5: straight jump is blocked.
  s = applyMove(s, { type: 'wall', wall: { r: 5, c: 4, o: 'h' } });
  s.turn = 1;
  // Red is at e5 (player 1) and moves downward, jumping over green at e4.
  const moves = legalPawnMoves(s, 1).map(cellName);
  // Red moves down the board; the diagonals sit beside the opponent at d4 / f4.
  assert.ok(moves.includes('d4') || moves.includes('f4'), `diagonals missing: ${moves.join(',')}`);
  assert.ok(!moves.includes('e3'), 'blocked straight jump must be illegal');
});

test('walls block movement and overlap/crossing is rejected', () => {
  const s = createInitialState();
  const wall: Move = { type: 'wall', wall: { r: 4, c: 4, o: 'h' } };
  const s2 = applyMove(s, wall);
  assert.equal(isEdgeBlocked(s2, at('e4'), at('e5')), true);
  assert.equal(isEdgeBlocked(s2, at('e4'), at('f4')), false);
  assert.equal(isWallLegal(s2, { r: 4, c: 4, o: 'h' }), false, 'overlap must be illegal');
  assert.equal(isWallLegal(s2, { r: 4, c: 4, o: 'v' }), false, 'crossing must be illegal');
});

test('anti-trap BFS validation rejects a fully sealed wall line', () => {
  let s = createInitialState();
  s.pawns[0] = at('e2');
  s.pawns[1] = at('e8');
  const hWalls: Move[] = [];
  for (let c = 0; c < 8; c++) hWalls.push({ type: 'wall', wall: { r: 2, c, o: 'h' } });

  let legal = 0;
  for (const m of hWalls) {
    if (m.type === 'wall' && isWallLegal(s, m.wall)) legal++;
    s = applyMove(s, m);
  }
  assert.ok(legal < 8, 'at least one sealing wall must be rejected');
});

test('every legal wall preserves both paths', () => {
  const base = createInitialState();
  const s = applyMoves(base, [
    { type: 'pawn', to: at('e2') },
    { type: 'pawn', to: at('e8') },
    { type: 'pawn', to: at('d2') },
    { type: 'pawn', to: at('f8') },
  ]);

  const walls = legalWalls(s, 0);
  assert.ok(walls.length > 100, 'plenty of legal walls in the opening');
  for (const w of walls.slice(0, 60)) {
    const after = applyMove(s, { type: 'wall', wall: w });
    assert.notEqual(pathLength(after, 0), Infinity, 'legal wall must preserve own path');
    assert.notEqual(pathLength(after, 1), Infinity, 'legal wall must preserve opponent path');
  }
});

test('a wall may not be placed when the inventory is empty', () => {
  const s = createInitialState();
  s.left = [0, 10];
  assert.equal(isWallLegal(s, { r: 4, c: 0, o: 'h' }), false);
});

test('win detection ends the game', () => {
  let s = createInitialState();
  s.pawns[0] = at('e8');
  s.turn = 0;
  s = applyMove(s, { type: 'pawn', to: at('e9') });
  assert.equal(s.winner, 0);
  assert.equal(s.turn, 0, 'turn does not advance after the game ends');
});

test('sequence keeps inventories and turn in sync', () => {
  let s = createInitialState();
  const seq: Move[] = [
    { type: 'pawn', to: at('e2') },
    { type: 'pawn', to: at('e8') },
    { type: 'wall', wall: { r: 4, c: 3, o: 'h' } },
    { type: 'wall', wall: { r: 3, c: 3, o: 'h' } },
  ];
  s = applyMoves(s, seq);
  assert.equal(s.turn, 0);
  assert.deepEqual(s.left, [9, 9]);
  assert.equal(s.ply, 4);
});

test('BFS returns the shortest route around a detour', () => {
  const s = applyMoves(createInitialState(), [
    { type: 'wall', wall: { r: 7, c: 3, o: 'h' } },
    { type: 'pawn', to: at('e8') },
    { type: 'wall', wall: { r: 7, c: 4, o: 'h' } },
  ]);
  const res = bfs(s, s.pawns[0], 0);
  assert.equal(res.dist, 10);
  assert.equal(res.path.length, 11);
  assert.equal(cellName(res.path[res.path.length - 1]).endsWith('9'), true);
});
