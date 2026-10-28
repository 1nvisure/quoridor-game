/**
 * Bot opponents for Quoridor.
 *
 *  - Beginner  (~600)  greedy BFS walker with random walls.
 *  - Intermediate (~1200) path-differential wall hunter.
 *  - Advanced  (~1800) negamax + alpha-beta with iterative deepening.
 *
 * All bots only ever return moves that the engine considers legal, which means
 * the anti-trap BFS validation applies to every single wall they place.
 */

import {
  type GameState,
  type Move,
  type Player,
  type Pos,
  type Wall,
  SIZE,
  SLOTS,
  GOAL_ROW,
  applyMove,
  isWallLegal,
  legalPawnMoves,
  legalWalls,
  manhattan,
  other,
  pathLength,
  samePos,
  shortestPath,
} from './engine';

export type BotId = 'beginner' | 'intermediate' | 'advanced';

export interface BotProfile {
  id: BotId;
  name: string;
  elo: number;
  tagline: string;
  quote: string;
  style: string[];
  /** Tailwind gradient classes for the avatar plate. */
  gradient: string;
  accent: string;
  emoji: string;
  description: string;
  thinkMs: [number, number];
}

export const BOTS: BotProfile[] = [
  {
    id: 'beginner',
    name: 'Pawnsy',
    elo: 600,
    tagline: 'Learning the ropes',
    quote: 'I only trap myself, like, a third of the time.',
    style: ['Greedy BFS', 'Random walls', 'Occasional side-step'],
    gradient: 'from-emerald-500/80 to-lime-600/60',
    accent: '#81b64c',
    emoji: '🌱',
    description:
      'Walks straight at the finish line and drops walls wherever it feels right. A gentle first opponent.',
    thinkMs: [320, 720],
  },
  {
    id: 'intermediate',
    name: 'Rookford',
    elo: 1200,
    tagline: 'Path-differential tactician',
    quote: 'Two extra steps for you is two free steps for me.',
    style: ['Path differential', 'Wall hunting', 'Safe by construction'],
    gradient: 'from-sky-500/80 to-indigo-600/60',
    accent: '#4a9bea',
    emoji: '♞',
    description:
      'Measures the shortest path for both sides. Only spends a wall when it costs you at least two steps — and never traps itself.',
    thinkMs: [400, 900],
  },
  {
    id: 'advanced',
    name: 'Grandmaster Vex',
    elo: 1800,
    tagline: 'Brutal endgame calculator',
    quote: 'I searched three plies. You searched your feelings.',
    style: ['Minimax depth 3', 'Alpha-beta pruning', 'Central control'],
    gradient: 'from-rose-500/80 to-orange-500/60',
    accent: '#fa412d',
    emoji: '♛',
    description:
      'Negamax with alpha-beta pruning, wall-inventory awareness and a fondness for the centre. Punishes loose walls.',
    thinkMs: [450, 1100],
  },
];

export const getBot = (id: BotId): BotProfile => BOTS.find((b) => b.id === id) ?? BOTS[0];

/* ------------------------------------------------------------------ */
/* Static evaluation                                                   */
/* ------------------------------------------------------------------ */

export const WIN_SCORE = 100_000;

/** Search depths used by the bot tiers and the review engine. */
export const BOT_SEARCH_DEPTH = {
  beginner: 0,
  intermediate: 1,
  advanced: 3,
  review: 1,
} as const;

/**
 * Positional evaluation **from the side-to-move's point of view** (required for
 * negamax sign symmetry). Shortest-path differential dominates; wall inventory,
 * centrality and tempo refine it.
 */
export function evaluate(state: GameState, perspective: Player = state.turn): number {
  const me = perspective;
  if (state.winner !== null) {
    return (state.winner === me ? WIN_SCORE : -WIN_SCORE) - state.ply;
  }

  const myDist = pathLength(state, me);
  const oppDist = pathLength(state, other(me));

  if (myDist === Infinity) return -WIN_SCORE + state.ply;
  if (oppDist === Infinity) return WIN_SCORE - state.ply;

  // Shortest-path differential: the dominant term. A full step is worth 100.
  let score = (oppDist - myDist) * 100;

  // Wall inventory: spare walls are a resource, but a wall in hand is only
  // worth a fraction of a tempo once the race is on.
  const wallsLeft = state.left;
  score += (wallsLeft[me] - wallsLeft[other(me)]) * 6;

  // Central board control keeps the pawn away from the rim where walls are
  // cheapest to place against it.
  const mine = state.pawns[me];
  const theirs = state.pawns[other(me)];
  score -= Math.abs(mine.c - 4) * 2;
  score += Math.abs(theirs.c - 4) * 2;

  // Tempo.
  score += state.turn === me ? 3 : -3;

  return score;
}

/* ------------------------------------------------------------------ */
/* Candidate generation (shared by bots + review)                      */
/* ------------------------------------------------------------------ */

const edgeKey = (a: Pos, b: Pos) => {
  const aKey = a.r * SIZE + a.c;
  const bKey = b.r * SIZE + b.c;
  return aKey < bKey ? `${aKey}-${bKey}` : `${bKey}-${aKey}`;
};

const edgeKeysOfPath = (path: Pos[]): Set<string> => {
  const set = new Set<string>();
  for (let i = 1; i < path.length; i++) set.add(edgeKey(path[i - 1], path[i]));
  return set;
};

/** The two board edges a wall occupies. */
export function wallEdges(w: Wall): Array<[Pos, Pos]> {
  if (w.o === 'h') {
    return [
      [
        { r: w.r, c: w.c },
        { r: w.r + 1, c: w.c },
      ],
      [
        { r: w.r, c: w.c + 1 },
        { r: w.r + 1, c: w.c + 1 },
      ],
    ];
  }
  return [
    [
      { r: w.r, c: w.c },
      { r: w.r, c: w.c + 1 },
    ],
    [
      { r: w.r + 1, c: w.c },
      { r: w.r + 1, c: w.c + 1 },
    ],
  ];
}

export interface CandidateOptions {
  /** How many wall candidates to keep (0 = pawn moves only). */
  wallLimit?: number;
  /** Include walls that merely shuffle the opponent's route. */
  includeNeutral?: boolean;
}

/**
 * Cheap, ordered move list. Walls are pre-scored by whether they cut across a
 * shortest path (O(1) per wall) so the expensive BFS is only spent on the
 * promising handful.
 */
export function generateCandidates(
  state: GameState,
  player: Player = state.turn,
  opts: CandidateOptions = {},
): Move[] {
  const { wallLimit = 24 } = opts;
  const opp = other(player);

  const pawnMoves = legalPawnMoves(state, player);
  const myPath = shortestPath(state, player).path;
  const oppPathResult = shortestPath(state, opp);
  const oppPath = oppPathResult.path;

  // Order pawn moves: towards the goal, and prefer it when it shortens our path.
  const pawnCandidates: Move[] = pawnMoves
    .map((to) => {
      const dist = Math.abs(to.r - GOAL_ROW[player]);
      const after = applyMove({ ...state, turn: player }, { type: 'pawn', to });
      const myAfter = pathLength(after, player);
      return { move: { type: 'pawn', to } as Move, key: myAfter + dist * 0.01 };
    })
    .sort((a, b) => a.key - b.key)
    .map((x) => x.move);

  if (wallLimit <= 0 || state.left[player] <= 0) return pawnCandidates;

  const myEdges = edgeKeysOfPath(myPath);
  const oppEdges = edgeKeysOfPath(oppPath);
  const oppPawn = state.pawns[opp];

  const scored: Array<{ wall: Wall; key: number }> = [];

  for (let r = 0; r < SLOTS; r++) {
    for (let c = 0; c < SLOTS; c++) {
      for (const o of ['h', 'v'] as const) {
        const wall: Wall = { r, c, o };
        if (!isWallLegal(state, wall, player)) continue;

        let key = 0;
        const edges = wallEdges(wall);
        for (const [a, b] of edges) {
          const k = edgeKey(a, b);
          if (oppEdges.has(k)) key += 10; // cuts the opponent's route
          if (myEdges.has(k)) key -= 12; // cuts our own route (bad)
        }

        // Walls near the opponent's pawn are more likely to matter.
        const nearOpp = manhattan({ r: wall.r, c: wall.c }, oppPawn);
        key += Math.max(0, 4 - nearOpp) * 1.5;
        // Mild central preference.
        key -= (Math.abs(c - 3.5) + Math.abs(r - 3.5)) * 0.15;

        if (key > 0 || opts.includeNeutral) scored.push({ wall, key });
      }
    }
  }

  scored.sort((a, b) => b.key - a.key);

  return [...pawnCandidates, ...scored.slice(0, wallLimit).map((x) => ({ type: 'wall', wall: x.wall }) as Move)];
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

export interface SearchOptions {
  depth?: number;
  timeBudgetMs?: number;
  nodeBudget?: number;
  wallLimit?: number;
  /** Random tie-breaking noise applied to root scores (0 = deterministic). */
  noise?: number;
  random?: () => number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  nodes: number;
  depthReached: number;
  timeMs: number;
  scores: Array<{ move: Move; score: number }>;
}

interface Budget {
  nodes: number;
  nodeBudget: number;
  deadline: number;
  aborted: boolean;
}

/** Negamax with alpha-beta pruning. Values are always from `state.turn`'s view. */
function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  budget: Budget,
  wallLimit: number,
): number {
  budget.nodes++;
  if (budget.nodes > budget.nodeBudget) {
    budget.aborted = true;
    return evaluate(state, state.turn);
  }
  if ((budget.nodes & 63) === 0 && Date.now() > budget.deadline) {
    budget.aborted = true;
    return evaluate(state, state.turn);
  }

  if (state.winner !== null) return evaluate(state, state.turn);
  if (depth <= 0) return evaluate(state, state.turn);

  // Branching narrows quickly with depth: breadth at the root, focus deeper in.
  const width = depth >= 2 ? Math.max(4, wallLimit >> 1) : wallLimit;
  const candidates = generateCandidates(state, state.turn, { wallLimit: width });
  if (candidates.length === 0) return evaluate(state, state.turn);

  let value = -Infinity;
  for (const move of candidates) {
    const child = applyMove(state, move);
    const score = -negamax(child, depth - 1, -beta, -alpha, budget, wallLimit);
    if (score > value) value = score;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break; // beta cut-off
    if (budget.aborted) break;
  }

  return value === -Infinity ? evaluate(state, state.turn) : value;
}

/**
 * Iterative-deepening alpha-beta search for the best move for the side to move.
 * Returns the best root move together with per-move root scores.
 */
export function searchBestMove(state: GameState, opts: SearchOptions = {}): SearchResult {
  const started = Date.now();
  const {
    depth = 2,
    timeBudgetMs = 900,
    nodeBudget = 12_000,
    wallLimit = 20,
    noise = 0,
    random = Math.random,
  } = opts;

  const me = state.turn;
  const rootCandidates = generateCandidates(state, me, { wallLimit });
  if (rootCandidates.length === 0) {
    return { move: null, score: evaluate(state, me), nodes: 0, depthReached: 0, timeMs: 0, scores: [] };
  }

  const budget: Budget = {
    nodes: 0,
    nodeBudget,
    deadline: started + timeBudgetMs,
    aborted: false,
  };

  let bestScores: Array<{ move: Move; score: number }> = rootCandidates.map((move) => ({
    move,
    score: -Infinity,
  }));
  let bestMove: Move = rootCandidates[0];
  let bestScore = -Infinity;
  let depthReached = 1;

  for (let d = 1; d <= depth; d++) {
    const scores: Array<{ move: Move; score: number }> = [];
    let alpha = -Infinity;
    let localBest: Move | null = null;
    let localBestScore = -Infinity;

    // Search the previous iteration's best move first (better ordering).
    const ordered = [...rootCandidates].sort((a, b) => {
      const sa = bestScores.find((s) => sameMove(s.move, a))?.score ?? -Infinity;
      const sb = bestScores.find((s) => sameMove(s.move, b))?.score ?? -Infinity;
      return sb - sa;
    });

    for (const move of ordered) {
      // A pawn move onto the goal row is an immediate, unstoppable win.
      const child = applyMove(state, move);
      let score: number;
      if (child.winner === me) {
        score = WIN_SCORE - child.ply;
      } else {
        score = -negamax(child, d - 1, -Infinity, -alpha, budget, wallLimit);
        if (noise > 0) score += (random() - 0.5) * 2 * noise;
      }

      scores.push({ move, score });

      if (score > localBestScore) {
        localBestScore = score;
        localBest = move;
      }
      if (score > alpha) alpha = score;

      if (budget.aborted || Date.now() > budget.deadline) break;
    }

    // Only accept a fully searched iteration, otherwise keep the previous best.
    if (!budget.aborted && scores.length === ordered.length && localBest) {
      bestScores = [...scores].sort((a, b) => b.score - a.score);
      bestMove = localBest;
      bestScore = localBestScore;
      depthReached = d;
    }

    if (budget.aborted || Date.now() > budget.deadline) break;
  }

  return {
    move: bestMove,
    score: bestScore,
    nodes: budget.nodes,
    depthReached,
    timeMs: Date.now() - started,
    scores: bestScores,
  };
}

/**
 * Score a single move from the mover's point of view.
 * `depth` extra plies are searched after the move (default 1 = opponent replies).
 */
export function evaluateMove(state: GameState, move: Move, depth = 1): number {
  const mover = state.turn;
  const child = applyMove(state, move);
  if (child.winner === mover) return WIN_SCORE - child.ply;
  if (depth <= 0) return -evaluate(child, child.turn);

  const budget: Budget = {
    nodes: 0,
    nodeBudget: 6_000,
    deadline: Date.now() + 250,
    aborted: false,
  };
  return -negamax(child, depth, -Infinity, Infinity, budget, 14);
}

export function sameMove(a: Move, b: Move): boolean {
  if (a.type === 'pawn' && b.type === 'pawn') return samePos(a.to, b.to);
  if (a.type === 'wall' && b.type === 'wall') {
    return a.wall.r === b.wall.r && a.wall.c === b.wall.c && a.wall.o === b.wall.o;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Bot personalities                                                  */
/* ------------------------------------------------------------------ */

const pick = <T,>(arr: T[], random: () => number): T => arr[Math.floor(random() * arr.length)];

/** One step along the shortest path (or a random legal sideways shuffle). */
function greedyPawn(state: GameState, player: Player, random: () => number, sideStepChance: number): Move {
  const moves = legalPawnMoves(state, player);
  if (moves.length === 0) return { type: 'pawn', to: state.pawns[player] };

  if (random() < sideStepChance && moves.length > 1) {
    const shuffled = [...moves].sort(() => random() - 0.5);
    return { type: 'pawn', to: shuffled[0] };
  }

  // Best pawn move by resulting path length.
  let best: Pos = moves[0];
  let bestLen = Infinity;
  for (const to of moves) {
    const after = applyMove({ ...state, turn: player, winner: null }, { type: 'pawn', to });
    const len = pathLength(after, player);
    if (len < bestLen) {
      bestLen = len;
      best = to;
    }
  }
  return { type: 'pawn', to: best };
}

function randomWall(state: GameState, player: Player, random: () => number): Move | null {
  if (state.left[player] <= 0) return null;
  const walls = legalWalls(state, player);
  if (walls.length === 0) return null;
  return { type: 'wall', wall: pick(walls, random) };
}

/** Beginner: greedy BFS, random walls, occasional side-step. */
export function beginnerMove(state: GameState, random: () => number = Math.random): Move {
  if (state.left[state.turn] > 0 && random() < 0.22) {
    const wall = randomWall(state, state.turn, random);
    if (wall) return wall;
  }
  return greedyPawn(state, state.turn, random, 0.14);
}

/** Intermediate: spend a wall only when it gains >= 2 steps and stays safe. */
export function intermediateMove(state: GameState, random: () => number = Math.random): Move {
  const me = state.turn;
  const opp = other(me);
  const myDist = pathLength(state, me);
  const oppDist = pathLength(state, opp);

  const candidates = generateCandidates(state, me, { wallLimit: 28 });
  let bestWall: { wall: Wall; gain: number; ownCost: number } | null = null;

  for (const move of candidates) {
    if (move.type !== 'wall') continue;
    if (!isWallLegal(state, move.wall, me)) continue;

    const child = applyMove(state, move);
    const oppAfter = pathLength(child, opp);
    const myAfter = pathLength(child, me);
    if (myAfter === Infinity || oppAfter === Infinity) continue; // anti-trap

    const gain = oppAfter - oppDist;
    const ownCost = myAfter - myDist;

    if (gain >= 2 && ownCost <= 1) {
      const score = gain - ownCost * 2;
      if (!bestWall || score > bestWall.gain - bestWall.ownCost * 2) {
        bestWall = { wall: move.wall, gain, ownCost };
      }
    }
  }

  // Keep some walls in reserve; don't burn them for nothing.
  const shouldWall =
    bestWall !== null &&
    (state.left[me] > 2 || oppDist - myDist < 2) &&
    random() < 0.85;

  if (shouldWall && bestWall) return { type: 'wall', wall: bestWall.wall };

  return greedyPawn(state, me, random, 0.05);
}

/** Advanced: negamax + alpha-beta, depth 2-3 with iterative deepening. */
export function advancedMove(
  state: GameState,
  random: () => number = Math.random,
): { move: Move; result: SearchResult } {
  const wallsEarly = state.ply < 12;

  const result = searchBestMove(state, {
    depth: wallsEarly ? 3 : 2,
    timeBudgetMs: 1_200,
    nodeBudget: 9_000,
    wallLimit: 18,
    noise: 6,
    random,
  });

  const fallback: Move = greedyPawn(state, state.turn, random, 0);
  return { move: result.move ?? fallback, result };
}

export interface BotTurnResult {
  move: Move;
  search?: SearchResult;
}

/** Public entry point used by the UI. */
export function botMove(
  state: GameState,
  botId: BotId,
  random: () => number = Math.random,
): BotTurnResult {
  if (state.winner !== null) return { move: { type: 'pawn', to: state.pawns[state.turn] } };

  switch (botId) {
    case 'beginner':
      return { move: beginnerMove(state, random) };
    case 'intermediate':
      return { move: intermediateMove(state, random) };
    case 'advanced':
      return advancedMove(state, random);
    default:
      return { move: beginnerMove(state, random) };
  }
}

/** First legal move available — a hard guarantee that a turn can always be played. */
export function firstLegalMove(state: GameState): Move | null {
  const pawn = legalPawnMoves(state, state.turn);
  if (pawn.length > 0) return { type: 'pawn', to: pawn[0] };
  const walls = legalWalls(state, state.turn);
  if (walls.length > 0) return { type: 'wall', wall: walls[0] };
  return null;
}
