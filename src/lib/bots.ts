/**
 * Bot opponents for Quoridor — a seven-tier ladder from 400 to 2200 Elo.
 *
 *   1 Pip        (400)   random legal moves
 *   2 Nibbles    (700)   greedy BFS + random walls
 *   3 Watcher   (1000)   path differential, min gain 1
 *   4 Rookford  (1300)   path differential, min gain 2
 *   5 Sable     (1600)   negamax + alpha-beta, depth 2
 *   6 Vex       (1900)   negamax + alpha-beta, depth 3
 *   7 Oracle    (2200)   negamax + alpha-beta, depth 4
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
  isWallStructurallyLegal,
  legalPawnMoves,
  legalWalls,
  manhattan,
  other,
  pathLength,
  samePos,
  shortestPath,
} from './engine';

export type BotId = 'pip' | 'nibbles' | 'watcher' | 'rookford' | 'sable' | 'vex' | 'oracle';

/**
 * How an opponent picks its move. The tier ladder maps onto these:
 *   1-2   random / greedy BFS
 *   3-4   shortest-path differential
 *   5-7   negamax with alpha-beta pruning (depth 2, 3, 4)
 */
export type BotStrategy = 'random' | 'greedy' | 'pathdiff' | 'search';

export interface BotProfile {
  id: BotId;
  /** 1 (easiest) … 7 (hardest). */
  tier: number;
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
  strategy: BotStrategy;
  /** Search depth for `search` bots. */
  depth?: number;
  /**
   * Centi-step jitter applied to root scores. Higher = less precise, which is
   * how the top tiers are separated: same algorithm, different discipline.
   */
  searchNoise?: number;
  /** Minimum opponent-path gain worth spending a wall on (`pathdiff` bots). */
  minGain?: number;
  /** Probability of actually committing to the best wall found (`pathdiff`). */
  wallChance?: number;
  /** Chance of an outright careless move — the flaw that keeps a tier beatable. */
  blunderChance?: number;
}

export const BOTS: BotProfile[] = [
  {
    id: 'pip',
    tier: 1,
    name: 'Pip',
    elo: 400,
    tagline: 'Absolute beginner',
    quote: 'I only trap myself, like, a third of the time.',
    style: ['Random moves', 'No plan', 'Very earnest'],
    gradient: 'from-emerald-500/80 to-lime-600/60',
    accent: '#81b64c',
    emoji: '🌱',
    description:
      'Just learned the rules. Picks legal moves more or less at random and apologises for winning.',
    thinkMs: [240, 560],
    strategy: 'random',
  },
  {
    id: 'nibbles',
    tier: 2,
    name: 'Nibbles',
    elo: 700,
    tagline: 'Greedy but distracted',
    quote: 'I walk forward! Then I get hungry and forget why.',
    style: ['Greedy BFS', 'Random walls', 'Side-steps'],
    gradient: 'from-amber-500/80 to-orange-600/60',
    accent: '#f7c631',
    emoji: '🐿️',
    description:
      'Always takes a step that shortens its own path — but wastes the occasional wall and wanders off course.',
    thinkMs: [280, 640],
    strategy: 'greedy',
  },
  {
    id: 'watcher',
    tier: 3,
    name: 'The Watcher',
    elo: 1000,
    tagline: 'Patient observer',
    quote: 'The shortest path is rarely the obvious one.',
    style: ['Path differential', 'Defensive walls', 'Calm'],
    gradient: 'from-teal-500/80 to-cyan-600/60',
    accent: '#2dd4bf',
    emoji: '🦉',
    description:
      'Counts both routes and places a wall whenever it gains even a single step. Cautious, but easily out-tempoed.',
    thinkMs: [320, 700],
    strategy: 'pathdiff',
    minGain: 1,
    wallChance: 0.55,
    blunderChance: 0.2,
  },
  {
    id: 'rookford',
    tier: 4,
    name: 'Rookford',
    elo: 1300,
    tagline: 'Path-differential tactician',
    quote: 'Two extra steps for you is two free steps for me.',
    style: ['Path differential', 'Wall hunting', 'Safe by construction'],
    gradient: 'from-sky-500/80 to-indigo-600/60',
    accent: '#4a9bea',
    emoji: '♞',
    description:
      'Measures the shortest path for both sides. Only spends a wall when it costs you at least two steps — and never traps itself.',
    thinkMs: [380, 820],
    strategy: 'pathdiff',
    minGain: 2,
    wallChance: 0.85,
    blunderChance: 0.04,
  },
  {
    id: 'sable',
    tier: 5,
    name: 'Sable',
    elo: 1600,
    tagline: 'Alpha-beta hunter',
    quote: 'I will see your walls before you place them.',
    style: ['Minimax depth 2', 'Alpha-beta pruning', 'Relentless'],
    gradient: 'from-slate-500/80 to-zinc-700/60',
    accent: '#a1a1aa',
    emoji: '🐺',
    description:
      'First real calculator: two plies of search with alpha-beta pruning, so it sees your reply before committing.',
    thinkMs: [420, 900],
    strategy: 'search',
    depth: 2,
    searchNoise: 12,
  },
  {
    id: 'vex',
    tier: 6,
    name: 'Grandmaster Vex',
    elo: 1900,
    tagline: 'Brutal endgame calculator',
    quote: 'I searched three plies. You searched your feelings.',
    style: ['Minimax depth 3', 'Alpha-beta pruning', 'Central control'],
    gradient: 'from-rose-500/80 to-orange-500/60',
    accent: '#fa412d',
    emoji: '♛',
    description:
      'Negamax with alpha-beta pruning, wall-inventory awareness and a fondness for the centre. Punishes loose walls.',
    thinkMs: [480, 1000],
    strategy: 'search',
    depth: 3,
    searchNoise: 5,
  },
  {
    id: 'oracle',
    tier: 7,
    name: 'The Oracle',
    elo: 2200,
    tagline: 'Sees four plies ahead',
    quote: 'The board has already told me how this ends.',
    style: ['Minimax depth 4', 'Alpha-beta pruning', 'Prophylaxis'],
    gradient: 'from-violet-500/80 to-fuchsia-600/60',
    accent: '#a855f7',
    emoji: '🔮',
    description:
      'Four plies deep with iterative deepening and a wide root. Misses almost nothing and never leaves a route open for free.',
    thinkMs: [520, 1100],
    strategy: 'search',
    depth: 4,
    searchNoise: 0,
  },
];

export const getBot = (id: BotId): BotProfile => BOTS.find((b) => b.id === id) ?? BOTS[0];

/** Bots ordered easiest → hardest. */
export const BOT_TIERS = [...BOTS].sort((a, b) => a.tier - b.tier);

/* ------------------------------------------------------------------ */
/* Static evaluation                                                   */
/* ------------------------------------------------------------------ */

export const WIN_SCORE = 100_000;

/** Search depths used by the bot tiers and the review engine. */
export const BOT_SEARCH_DEPTH = {
  pip: 0,
  nibbles: 0,
  watcher: 0,
  rookford: 1,
  sable: 2,
  vex: 3,
  oracle: 4,
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
        // Only the cheap structural checks here. The anti-trap BFS costs two
        // full searches per wall, so it is deferred until we know which walls
        // we actually intend to return (below).
        if (!isWallStructurallyLegal(state, wall, player)) continue;

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

  // Verify the anti-trap rule only for the walls we are about to offer.
  const walls: Move[] = [];
  for (const entry of scored) {
    if (walls.length >= wallLimit) break;
    if (!isWallLegal(state, entry.wall, player)) continue;
    walls.push({ type: 'wall', wall: entry.wall });
  }

  return [...pawnCandidates, ...walls];
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

export interface SearchOptions {
  depth?: number;
  timeBudgetMs?: number;
  nodeBudget?: number;
  wallLimit?: number;
  /** Candidates the leaf quiescence verifies (wider = more accurate, slower). */
  quiesceWidth?: number;
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

/* ------------------------------------------------------------------ */
/* Transposition table                                                */
/* ------------------------------------------------------------------ */

/**
 * Zobrist keys make depth-4 search affordable: wall placements transpose
 * constantly (A then B = B then A is legal for unrelated walls), so memoising
 * positions cuts the tree dramatically.
 */
const ZOBRIST = (() => {
  let seed = 0x9e3779b9;
  const next = () => {
    // xorshift32 — deterministic and fast.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  return {
    h: Array.from({ length: 64 }, next),
    v: Array.from({ length: 64 }, next),
    pawn: Array.from({ length: 81 }, next),
    turn: next(),
    left: Array.from({ length: 24 }, next),
  };
})();

export function hashState(state: GameState): number {
  let key = 0;
  for (let r = 0; r < SLOTS; r++) {
    for (let c = 0; c < SLOTS; c++) {
      const i = r * SIZE + c;
      if (state.h[i]) key ^= ZOBRIST.h[r * 8 + c];
      if (state.v[i]) key ^= ZOBRIST.v[r * 8 + c];
    }
  }
  key ^= ZOBRIST.pawn[state.pawns[0].r * SIZE + state.pawns[0].c];
  key ^= ZOBRIST.pawn[state.pawns[1].r * SIZE + state.pawns[1].c];
  key ^= ZOBRIST.left[state.left[0]];
  key ^= ZOBRIST.left[12 + state.left[1]];
  if (state.turn === 1) key ^= ZOBRIST.turn;
  return key | 0;
}

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
}

/**
 * Branching width by remaining depth: broad at the root, narrow deep in the
 * tree. This is what keeps depth 4 inside its budget.
 */
function widthForDepth(depth: number, wallLimit: number): number {
  if (depth >= 3) return 8;
  if (depth === 2) return 12;
  return wallLimit;
}

/**
 * Quiescence: always let the side to move at a leaf take one reply before we
 * evaluate. Without this, odd search depths are systematically optimistic — the
 * leaf would score a position after *our* move while assuming the opponent
 * passes, and a depth-3 bot would then lose to a depth-2 one.
 */
function quiesce(state: GameState, budget: Budget, width: number): number {
  if (state.winner !== null) return evaluate(state, state.turn);

  budget.nodes++;
  if (budget.nodes > budget.nodeBudget) {
    budget.aborted = true;
    return evaluate(state, state.turn);
  }

  const candidates = generateCandidates(state, state.turn, { wallLimit: width });
  if (candidates.length === 0) return evaluate(state, state.turn);

  let best = -Infinity;
  for (const move of candidates) {
    const child = applyMove(state, move);
    const value =
      child.winner === state.turn ? WIN_SCORE - child.ply : -evaluate(child, child.turn);
    if (value > best) best = value;
  }

  return best === -Infinity ? evaluate(state, state.turn) : best;
}

/** Negamax with alpha-beta pruning. Values are always from `state.turn`'s view. */
function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  budget: Budget,
  wallLimit: number,
  tt: Map<number, TTEntry>,
  quiesceWidth: number,
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
  if (depth <= 0) return quiesce(state, budget, quiesceWidth);

  const alphaOrig = alpha;
  const betaOrig = beta;
  const key = hashState(state);
  const cached = tt.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.flag === TT_EXACT) return cached.score;
    if (cached.flag === TT_LOWER) alpha = Math.max(alpha, cached.score);
    else if (cached.flag === TT_UPPER) beta = Math.min(beta, cached.score);
    if (alpha >= beta) return cached.score;
  }

  const candidates = generateCandidates(state, state.turn, {
    wallLimit: widthForDepth(depth, wallLimit),
  });
  if (candidates.length === 0) return evaluate(state, state.turn);

  let value = -Infinity;
  for (const move of candidates) {
    const child = applyMove(state, move);
    const score = -negamax(child, depth - 1, -beta, -alpha, budget, wallLimit, tt, quiesceWidth);
    if (score > value) value = score;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break; // beta cut-off
    if (budget.aborted) break;
  }

  if (value === -Infinity) return evaluate(state, state.turn);

  if (!budget.aborted) {
    const flag = value <= alphaOrig ? TT_UPPER : value >= betaOrig ? TT_LOWER : TT_EXACT;
    tt.set(key, { depth, score: value, flag });
  }

  return value;
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
    quiesceWidth = 8,
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

  // Scoped to this search so a stale memo can never leak across positions.
  const tt = new Map<number, TTEntry>();

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
        score = -negamax(child, d - 1, -Infinity, -alpha, budget, wallLimit, tt, quiesceWidth);
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
  return -negamax(child, depth, -Infinity, Infinity, budget, 14, new Map(), 8);
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

/** Any legal move at all, chosen uniformly. Tier 1 barely plans. */
export function randomMove(state: GameState, random: () => number = Math.random): Move {
  const me = state.turn;
  const pawns = legalPawnMoves(state, me);
  const canWall = state.left[me] > 0;
  const wallFirst = canWall && random() < 0.3;

  if (wallFirst) {
    const wall = randomWall(state, me, random);
    if (wall) return wall;
  }
  if (pawns.length > 0) return { type: 'pawn', to: pick(pawns, random) };

  const wall = randomWall(state, me, random);
  if (wall) return wall;
  return { type: 'pawn', to: state.pawns[me] };
}

/** Tier 2: greedy BFS walker with random walls and the odd side-step. */
export function greedyMove(state: GameState, random: () => number = Math.random): Move {
  if (state.left[state.turn] > 0 && random() < 0.22) {
    const wall = randomWall(state, state.turn, random);
    if (wall) return wall;
  }
  return greedyPawn(state, state.turn, random, 0.14);
}

export interface PathDiffOptions {
  /** Only spend a wall when the opponent gains at least this many steps. */
  minGain: number;
  /** Chance of committing to the wall once one is found. */
  wallChance: number;
  /** Keep this many walls in reserve for the endgame. */
  reserve?: number;
  /** Chance of a careless move instead of the calculated one. */
  blunderChance?: number;
}

/**
 * Tiers 3-4: shortest-path differential.
 * A wall is only worth it when it lengthens the opponent's route by `minGain`
 * while costing us at most one step of our own.
 */
export function pathDiffMove(
  state: GameState,
  random: () => number = Math.random,
  opts: PathDiffOptions = { minGain: 2, wallChance: 0.85 },
): Move {
  const me = state.turn;

  // Even a decent club player drifts sometimes; this is what makes the tier
  // ladder feel human rather than a wall of perfect calculators.
  if (opts.blunderChance && random() < opts.blunderChance) {
    return randomMove(state, random);
  }

  const opp = other(me);
  const myDist = pathLength(state, me);
  const oppDist = pathLength(state, opp);
  const reserve = opts.reserve ?? 2;

  const candidates = generateCandidates(state, me, { wallLimit: 28 });
  let bestWall: { wall: Wall; score: number } | null = null;

  for (const move of candidates) {
    if (move.type !== 'wall') continue;
    if (!isWallLegal(state, move.wall, me)) continue;

    const child = applyMove(state, move);
    const oppAfter = pathLength(child, opp);
    const myAfter = pathLength(child, me);
    if (myAfter === Infinity || oppAfter === Infinity) continue; // anti-trap defence

    const gain = oppAfter - oppDist;
    const ownCost = myAfter - myDist;
    if (gain < opts.minGain || ownCost > 1) continue;

    const score = gain - ownCost * 2;
    if (!bestWall || score > bestWall.score) bestWall = { wall: move.wall, score };
  }

  const canSpare = state.left[me] > reserve || oppDist - myDist < opts.minGain;
  const shouldWall = bestWall !== null && canSpare && random() < opts.wallChance;

  if (shouldWall && bestWall) return { type: 'wall', wall: bestWall.wall };

  return greedyPawn(state, me, random, 0.05);
}

/** Per-tier search budgets. Deeper tiers get more time and a wider root. */
const SEARCH_BUDGET: Record<
  number,
  { timeMs: number; nodes: number; wallLimit: number; quiesceWidth: number }
> = {
  2: { timeMs: 500, nodes: 8_000, wallLimit: 12, quiesceWidth: 4 },
  3: { timeMs: 1_000, nodes: 30_000, wallLimit: 18, quiesceWidth: 8 },
  4: { timeMs: 1_700, nodes: 90_000, wallLimit: 24, quiesceWidth: 12 },
};

export interface SearchMoveOptions {
  depth: number;
  timeMs?: number;
  nodes?: number;
  wallLimit?: number;
  quiesceWidth?: number;
  noise?: number;
  random?: () => number;
}

/**
 * Tiers 5-7: negamax with alpha-beta pruning and iterative deepening.
 * Depth scales 2 → 3 → 4 across the top three tiers.
 */
export function searchMove(
  state: GameState,
  opts: SearchMoveOptions,
): { move: Move; result: SearchResult } {
  const random = opts.random ?? Math.random;
  const budget = SEARCH_BUDGET[opts.depth] ?? SEARCH_BUDGET[2];
  const wallsEarly = state.ply < 12;

  // Opening depth is kept at the tier's depth; late-game positions branch far
  // less, so the same depth is cheap and the budget simply absorbs it.
  const depth = opts.depth;

  const result = searchBestMove(state, {
    depth,
    timeBudgetMs: opts.timeMs ?? budget.timeMs,
    nodeBudget: opts.nodes ?? budget.nodes,
    wallLimit: opts.wallLimit ?? budget.wallLimit,
    quiesceWidth: opts.quiesceWidth ?? budget.quiesceWidth,
    noise: opts.noise ?? (wallsEarly ? 4 : 2),
    random,
  });

  const fallback: Move = greedyPawn(state, state.turn, random, 0);
  return { move: result.move ?? fallback, result };
}

export interface BotTurnResult {
  move: Move;
  search?: SearchResult;
}

/** Play a move for `botId`. Always legal; falls back to a greedy step. */
export function botMove(
  state: GameState,
  botId: BotId,
  random: () => number = Math.random,
): BotTurnResult {
  if (state.winner !== null) return { move: { type: 'pawn', to: state.pawns[state.turn] } };

  const profile = getBot(botId);

  switch (profile.strategy) {
    case 'random':
      return { move: randomMove(state, random) };

    case 'greedy':
      return { move: greedyMove(state, random) };

    case 'pathdiff':
      return {
        move: pathDiffMove(state, random, {
          minGain: profile.minGain ?? 2,
          wallChance: profile.wallChance ?? 0.85,
          blunderChance: profile.blunderChance,
        }),
      };

    case 'search':
      return searchMove(state, {
        depth: profile.depth ?? 2,
        noise: profile.searchNoise ?? 0,
        random,
      });

    default:
      return { move: greedyMove(state, random) };
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
