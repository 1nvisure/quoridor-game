/**
 * Quoridor game engine.
 *
 * Board: 9x9 cells. Walls live on an 8x8 lattice of "slots".
 *  - A horizontal wall at slot (r, c) spans the two vertical edges between
 *    rows r and r+1, at columns c and c+1.
 *  - A vertical wall at slot (r, c) spans the two horizontal edges between
 *    columns c and c+1, at rows r and r+1.
 *
 * Player 0 ("you", green) starts at the bottom centre (row 8) and races to row 0.
 * Player 1 ("red") starts at the top centre (row 0) and races to row 8.
 */

export const SIZE = 9;
export const SLOTS = SIZE - 1;
export const START_WALLS = 10;
export const FILE_LETTERS = 'abcdefghi';

export type Player = 0 | 1;
export type Orientation = 'h' | 'v';

export interface Pos {
  r: number;
  c: number;
}

export interface Wall {
  r: number;
  c: number;
  o: Orientation;
}

export interface GameState {
  /** Pawn positions indexed by player. */
  pawns: [Pos, Pos];
  /** Horizontal wall occupancy, 81 entries (only r,c < 8 used). */
  h: boolean[];
  /** Vertical wall occupancy, 81 entries (only r,c < 8 used). */
  v: boolean[];
  /** Remaining wall inventory per player. */
  left: [number, number];
  /** Whose turn it is. */
  turn: Player;
  /** Number of half-moves played. */
  ply: number;
  /** Set once a pawn reaches its target baseline. */
  winner: Player | null;
}

export type Move = { type: 'pawn'; to: Pos } | { type: 'wall'; wall: Wall };

export const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** Row each player must reach to win. */
export const GOAL_ROW: [number, number] = [0, SIZE - 1];

export const START_POS: [Pos, Pos] = [
  { r: SIZE - 1, c: 4 }, // green / bottom
  { r: 0, c: 4 }, // red / top
];

const idx = (r: number, c: number) => r * SIZE + c;
const inBounds = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const slotInBounds = (r: number, c: number) => r >= 0 && r < SLOTS && c >= 0 && c < SLOTS;

export const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
export const sameWall = (a: Wall, b: Wall) => a.r === b.r && a.c === b.c && a.o === b.o;

const emptyGrid = () => new Array<boolean>(SIZE * SIZE).fill(false);

export function createInitialState(firstTurn: Player = 0): GameState {
  return {
    pawns: [{ ...START_POS[0] }, { ...START_POS[1] }],
    h: emptyGrid(),
    v: emptyGrid(),
    left: [START_WALLS, START_WALLS],
    turn: firstTurn,
    ply: 0,
    winner: null,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    pawns: [{ ...s.pawns[0] }, { ...s.pawns[1] }],
    h: s.h.slice(),
    v: s.v.slice(),
    left: [s.left[0], s.left[1]],
    turn: s.turn,
    ply: s.ply,
    winner: s.winner,
  };
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** True when the edge between two orthogonally adjacent cells is blocked. */
export function isEdgeBlocked(s: GameState, a: Pos, b: Pos): boolean {
  if (a.r === b.r) {
    const row = a.r;
    const col = Math.min(a.c, b.c); // vertical wall line between col & col+1
    if (col < 0 || col >= SLOTS) return false;
    // The vertical line at row `row` can be covered by wall slots row or row-1.
    if (row - 1 >= 0 && row - 1 < SLOTS && s.v[idx(row - 1, col)]) return true;
    if (row >= 0 && row < SLOTS && s.v[idx(row, col)]) return true;
    return false;
  }

  if (a.c === b.c) {
    const col = a.c;
    const row = Math.min(a.r, b.r); // horizontal wall line between row & row+1
    if (row < 0 || row >= SLOTS) return false;
    // The horizontal line at column `col` can be covered by slots col or col-1.
    if (col - 1 >= 0 && col - 1 < SLOTS && s.h[idx(row, col - 1)]) return true;
    if (col >= 0 && col < SLOTS && s.h[idx(row, col)]) return true;
    return false;
  }

  return true; // not adjacent -> treat as blocked
}

const DIRS: Pos[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
];

/* ------------------------------------------------------------------ */
/* BFS pathfinding                                                     */
/* ------------------------------------------------------------------ */

export interface PathResult {
  /** Number of steps to the goal baseline, Infinity when unreachable. */
  dist: number;
  /** Cell-by-cell route (inclusive of start and goal cell). */
  path: Pos[];
}

/**
 * Breadth-first search from `start` to any cell on `goalRow`.
 * Walls are treated as impassable edges; pawns do not block each other here
 * (standard Quoridor path validation ignores the opposing pawn).
 */
export function bfs(s: GameState, start: Pos, goalRow: number): PathResult {
  if (start.r === goalRow) return { dist: 0, path: [start] };

  const total = SIZE * SIZE;
  const prev = new Int16Array(total).fill(-2); // -2 unvisited, -1 root
  const dist = new Int16Array(total).fill(-1);
  const queue = new Int16Array(total);
  let head = 0;
  let tail = 0;

  const startIdx = idx(start.r, start.c);
  queue[tail++] = startIdx;
  dist[startIdx] = 0;
  prev[startIdx] = -1;

  while (head < tail) {
    const cur = queue[head++];
    const cr = (cur / SIZE) | 0;
    const cc = cur % SIZE;
    const curDist = dist[cur];

    for (let d = 0; d < 4; d++) {
      const nr = cr + DIRS[d].r;
      const nc = cc + DIRS[d].c;
      if (!inBounds(nr, nc)) continue;
      const ni = idx(nr, nc);
      if (dist[ni] !== -1) continue;
      if (isEdgeBlocked(s, { r: cr, c: cc }, { r: nr, c: nc })) continue;

      dist[ni] = curDist + 1;
      prev[ni] = cur;
      if (nr === goalRow) {
        // Reconstruct.
        const path: Pos[] = [];
        let walk = ni;
        while (walk !== -1) {
          path.push({ r: (walk / SIZE) | 0, c: walk % SIZE });
          walk = prev[walk];
        }
        path.reverse();
        return { dist: dist[ni], path };
      }
      queue[tail++] = ni;
    }
  }

  return { dist: Infinity, path: [] };
}

/** Shortest distance for `player` to its goal baseline. */
export const pathLength = (s: GameState, player: Player): number =>
  bfs(s, s.pawns[player], GOAL_ROW[player]).dist;

export const shortestPath = (s: GameState, player: Player): PathResult =>
  bfs(s, s.pawns[player], GOAL_ROW[player]);

/* ------------------------------------------------------------------ */
/* Pawn movement                                                       */
/* ------------------------------------------------------------------ */

/** Legal pawn destinations for `player` (defaults to side to move). */
export function legalPawnMoves(s: GameState, player: Player = s.turn): Pos[] {
  const me = s.pawns[player];
  const opp = s.pawns[other(player)];
  const moves: Pos[] = [];

  for (const d of DIRS) {
    const nr = me.r + d.r;
    const nc = me.c + d.c;
    if (!inBounds(nr, nc)) continue;
    if (isEdgeBlocked(s, me, { r: nr, c: nc })) continue;

    if (!samePos({ r: nr, c: nc }, opp)) {
      moves.push({ r: nr, c: nc });
      continue;
    }

    // Opponent is adjacent: try to jump straight over them.
    const jr = me.r + d.r * 2;
    const jc = me.c + d.c * 2;
    const straightOpen =
      inBounds(jr, jc) && !isEdgeBlocked(s, { r: nr, c: nc }, { r: jr, c: jc });

    if (straightOpen) {
      moves.push({ r: jr, c: jc });
      continue;
    }

    // Otherwise the jump is blocked by a wall or the board edge: allow the two
    // diagonal hops beside the opponent (classic Quoridor rule).
    const perp: Pos[] = d.r === 0
      ? [
          { r: -1, c: 0 },
          { r: 1, c: 0 },
        ]
      : [
          { r: 0, c: -1 },
          { r: 0, c: 1 },
        ];

    for (const pd of perp) {
      const dr = nr + pd.r;
      const dc = nc + pd.c;
      if (!inBounds(dr, dc)) continue;
      if (isEdgeBlocked(s, { r: nr, c: nc }, { r: dr, c: dc })) continue;
      if (samePos({ r: dr, c: dc }, me)) continue;
      if (!moves.some((m) => m.r === dr && m.c === dc)) moves.push({ r: dr, c: dc });
    }
  }

  return moves;
}

/** True when a pawn may legally be placed on `to` (ignores whose turn it is). */
export function isLegalPawnMove(s: GameState, to: Pos, player: Player = s.turn): boolean {
  return legalPawnMoves(s, player).some((m) => samePos(m, to));
}

/* ------------------------------------------------------------------ */
/* Wall legality (overlap + intersection + anti-trap BFS)              */
/* ------------------------------------------------------------------ */

/** Structural legality: bounds, inventory, overlap and perpendicular crossing. */
export function isWallStructurallyLegal(s: GameState, wall: Wall, player: Player = s.turn): boolean {
  if (!slotInBounds(wall.r, wall.c)) return false;
  if (s.left[player] <= 0) return false;

  const grid = wall.o === 'h' ? s.h : s.v;
  const counter = wall.o === 'h' ? s.v : s.h;

  if (grid[idx(wall.r, wall.c)]) return false; // exact overlap
  if (counter[idx(wall.r, wall.c)]) return false; // crosses a perpendicular wall
  return true;
}

/**
 * Full legality check, including the critical anti-trap BFS validation:
 * after the wall is placed BOTH players must still have a path to their goal.
 */
export function isWallLegal(s: GameState, wall: Wall, player: Player = s.turn): boolean {
  if (!isWallStructurallyLegal(s, wall, player)) return false;

  const grid = wall.o === 'h' ? s.h : s.v;
  grid[idx(wall.r, wall.c)] = true;
  const ok =
    pathLength(s, 0) !== Infinity &&
    pathLength(s, 1) !== Infinity;
  grid[idx(wall.r, wall.c)] = false;

  return ok;
}

/** All walls currently placeable by `player`, sorted for stable UI output. */
export function legalWalls(s: GameState, player: Player = s.turn): Wall[] {
  const out: Wall[] = [];
  if (s.left[player] <= 0) return out;
  for (let r = 0; r < SLOTS; r++) {
    for (let c = 0; c < SLOTS; c++) {
      for (const o of ['h', 'v'] as Orientation[]) {
        const w: Wall = { r, c, o };
        if (isWallLegal(s, w, player)) out.push(w);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Applying moves                                                      */
/* ------------------------------------------------------------------ */

export function isMoveLegal(s: GameState, move: Move, player: Player = s.turn): boolean {
  if (s.winner !== null) return false;
  if (move.type === 'pawn') return isLegalPawnMove(s, move.to, player);
  return isWallLegal(s, move.wall, player);
}

export function applyMove(s: GameState, move: Move): GameState {
  const next = cloneState(s);
  const p = s.turn;

  if (move.type === 'pawn') {
    next.pawns[p] = { ...move.to };
    if (move.to.r === GOAL_ROW[p]) next.winner = p;
  } else {
    const grid = move.wall.o === 'h' ? next.h : next.v;
    grid[idx(move.wall.r, move.wall.c)] = true;
    next.left[p] = Math.max(0, next.left[p] - 1);
  }

  next.ply = s.ply + 1;
  if (next.winner === null) next.turn = other(p);
  return next;
}

/** Apply a sequence of moves from an initial state. */
export function applyMoves(initial: GameState, moves: Move[]): GameState {
  let s = initial;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

/* ------------------------------------------------------------------ */
/* Notation                                                            */
/* ------------------------------------------------------------------ */

export const cellName = (p: Pos): string => `${FILE_LETTERS[p.c]}${SIZE - p.r}`;

export function parseCell(name: string): Pos {
  const file = FILE_LETTERS.indexOf(name[0]);
  const rank = parseInt(name.slice(1), 10);
  return { r: SIZE - rank, c: file };
}

/** Compact wall notation, e.g. `e5h` / `e5v` (slot + orientation letter). */
export const wallName = (w: Wall): string => `${cellName({ r: w.r, c: w.c })}${w.o}`;

export function moveNotation(m: Move): string {
  return m.type === 'pawn' ? cellName(m.to) : wallName(m.wall);
}

export function describeMove(m: Move): string {
  return m.type === 'pawn'
    ? `stepped to ${cellName(m.to)}`
    : `placed a wall at ${wallName(m.wall)}`;
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

/** Pieces of static evaluation / heuristics shared by bots and review. */
export function wallCounts(s: GameState): [number, number] {
  return [s.left[0], s.left[1]];
}

export const isTerminal = (s: GameState): boolean => s.winner !== null;

/** Distance from each player's pawn to their own goal row. */
export function pathDiff(s: GameState, player: Player): number {
  const me = pathLength(s, player);
  const them = pathLength(s, other(player));
  if (me === Infinity) return -999;
  if (them === Infinity) return 999;
  return them - me;
}

/** Whether the opponent is in front of me (used for central control / tempo). */
export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}
