/**
 * Post-game review engine — a Quoridor take on Chess.com's Game Review.
 *
 * For every half-move we
 *   1. compute the position's advantage from the shortest-path difference,
 *   2. convert that advantage into a win probability with a sigmoid,
 *   3. compare the move actually played against the engine's best move,
 *   4. classify the win-probability drop as Best / Excellent / Good /
 *      Inaccuracy / Mistake / Blunder.
 *
 * The result powers the accuracy scores, the evaluation graph, the key-moment
 * cards and the interactive step-through board.
 */

import {
  type GameState,
  type Move,
  type Player,
  GOAL_ROW,
  applyMove,
  cellName,
  createInitialState,
  describeMove,
  moveNotation,
  other,
  pathLength,
  wallName,
} from './engine';
import { WIN_SCORE, evaluateMove, generateCandidates, sameMove, BOT_SEARCH_DEPTH } from './bots';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type Classification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface ClassificationMeta {
  id: Classification;
  label: string;
  symbol: string;
  color: string;
  bg: string;
  border: string;
  description: string;
}

export const CLASSIFICATIONS: Record<Classification, ClassificationMeta> = {
  best: {
    id: 'best',
    label: 'Best',
    symbol: '★',
    color: '#81b64c',
    bg: 'rgba(129,182,76,.14)',
    border: 'rgba(129,182,76,.45)',
    description: 'The strongest move in the position.',
  },
  excellent: {
    id: 'excellent',
    label: 'Excellent',
    symbol: '✓',
    color: '#95bb4a',
    bg: 'rgba(149,187,74,.12)',
    border: 'rgba(149,187,74,.4)',
    description: 'Almost as good as the best move.',
  },
  good: {
    id: 'good',
    label: 'Good',
    symbol: '●',
    color: '#7fa650',
    bg: 'rgba(127,166,80,.10)',
    border: 'rgba(127,166,80,.35)',
    description: 'A sound, reasonable move.',
  },
  inaccuracy: {
    id: 'inaccuracy',
    label: 'Inaccuracy',
    symbol: '?!',
    color: '#f7c631',
    bg: 'rgba(247,198,49,.12)',
    border: 'rgba(247,198,49,.4)',
    description: 'Let a little of your advantage slip.',
  },
  mistake: {
    id: 'mistake',
    label: 'Mistake',
    symbol: '?',
    color: '#ff9b21',
    bg: 'rgba(255,155,33,.14)',
    border: 'rgba(255,155,33,.45)',
    description: 'A clear error that changes the assessment.',
  },
  blunder: {
    id: 'blunder',
    label: 'Blunder',
    symbol: '??',
    color: '#fa412d',
    bg: 'rgba(250,65,45,.16)',
    border: 'rgba(250,65,45,.5)',
    description: 'A serious error that flips the game.',
  },
};

export interface PlyAnalysis {
  /** 0-based half-move index. */
  index: number;
  /** 1-based move number shown in the UI. */
  moveNumber: number;
  player: Player;
  move: Move;
  notation: string;
  description: string;
  bestMove: Move;
  bestNotation: string;
  /** Advantage for player 0, measured in steps of shortest-path difference. */
  advantageBefore: number;
  advantageAfter: number;
  /** Win probability for player 0 before/after the move (0-1). */
  winProbBefore: number;
  winProbAfter: number;
  /** Win probability for the player who moved, after their move (0-1). */
  moverWinProb: number;
  /** Win probability for the player who moved with the best move (0-1). */
  moverWinProbBest: number;
  /** Drop in win probability, in percentage points. */
  loss: number;
  accuracy: number;
  classification: Classification;
  stateBefore: GameState;
  stateAfter: GameState;
  /** Shortest-path lengths for both players after the move. */
  paths: [number, number];
  wallsLeft: [number, number];
}

export interface PlayerSummary {
  accuracy: number;
  counts: Record<Classification, number>;
  /** Average win-probability loss per move, percentage points. */
  averageLoss: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  bestMoves: number;
}

export interface KeyMoment {
  ply: number;
  player: Player;
  classification: Classification;
  headline: string;
  detail: string;
  loss: number;
  notation: string;
  bestNotation: string;
}

export interface EvalGraphPoint {
  ply: number;
  /** Win probability for player 0, 0-100. */
  value: number;
  classification?: Classification;
  player?: Player;
  label: string;
}

export interface GameAnalysis {
  plies: PlyAnalysis[];
  players: [PlayerSummary, PlayerSummary];
  keyMoments: KeyMoment[];
  graph: EvalGraphPoint[];
  accuracy: [number, number];
  winner: Player | null;
  totalMoves: number;
  averageRating: number;
  /** Per-player book-style verdict lines. */
  verdict: [string, string];
  /** Display names indexed by player. */
  names: [string, string];
  /** Largest win-probability swing of the game, in percentage points. */
  biggestSwing: number;
}

export interface AnalyzeOptions {
  /** Plies of lookahead used to score each candidate move. */
  depth?: number;
  /** Display names, indexed by player. */
  names?: [string, string];
  /** Wall candidates considered per position. */
  wallLimit?: number;
  /** Optional callback so the UI can show progress. */
  onProgress?: (done: number, total: number) => void;
  /** Yield to the event loop every N plies (for the browser). */
  maxPlies?: number;
}

/* ------------------------------------------------------------------ */
/* Math                                                               */
/* ------------------------------------------------------------------ */

/** Logistic curve turning a step-based advantage into a 0-1 win probability. */
export function winProbability(advantage: number, steepness = 0.55): number {
  const x = advantage * steepness;
  // Guard against overflow at extreme values.
  if (x > 30) return 1;
  if (x < -30) return 0;
  return 1 / (1 + Math.exp(-x));
}

export const toPercent = (p: number): number => Math.round(p * 1000) / 10;

/** Smooth 0-100 accuracy for a single move given its win-probability loss. */
export function moveAccuracy(loss: number): number {
  if (loss <= 0) return 100;
  const acc = 100 * Math.exp(-loss / 24);
  return Math.max(0, Math.min(100, Math.round(acc * 10) / 10));
}

/**
 * Classify a move by the win-probability points it gave away.
 * Ties are common in Quoridor (many moves keep the same shortest path), so only
 * the engine's actual top choice earns the star.
 */
export function classify(loss: number, isBest: boolean): Classification {
  if (isBest) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 6) return 'good';
  if (loss < 12) return 'inaccuracy';
  if (loss < 22) return 'mistake';
  return 'blunder';
}

/**
 * Position advantage for player 0, in steps. Positive favours green (player 0).
 * This is the "difference in shortest paths" that drives the whole review.
 *
 * Tempo convention: the side to move is credited with having already taken its
 * step. Without this every pawn push flips the sign of the difference and the
 * evaluation graph turns into a meaningless saw-tooth, while the opening would
 * sit on a permanent 57% "first-move advantage".
 */
export function positionAdvantage(state: GameState): number {
  if (state.winner === 0) return 20;
  if (state.winner === 1) return -20;

  const d0 = pathLength(state, 0);
  const d1 = pathLength(state, 1);
  if (!Number.isFinite(d0)) return -20;
  if (!Number.isFinite(d1)) return 20;

  const tempo = state.turn === 1 ? -1 : 0;
  const walls = (state.left[0] - state.left[1]) * 0.08;

  return d1 - d0 + tempo + walls;
}

const scoreToAdvantage = (score: number): number => {
  if (score >= WIN_SCORE / 2) return 20;
  if (score <= -WIN_SCORE / 2) return -20;
  return score / 100;
};

/* ------------------------------------------------------------------ */
/* Position analysis                                                  */
/* ------------------------------------------------------------------ */

export interface RankedMove {
  move: Move;
  /** Advantage for player 0 if this move is played. */
  advantage: number;
  /** Win probability for player 0. */
  winProb: number;
}

export interface PositionAnalysis {
  ranked: RankedMove[];
  best: RankedMove | null;
  /** Advantage for player 0 in the current position (best play). */
  advantage: number;
  winProb: number;
  evaluatedMoves: number;
}

/**
 * Rank every plausible move in a position with a small alpha-beta search and
 * express the result as an advantage for player 0.
 */
export function analyzePosition(
  state: GameState,
  opts: { depth?: number; wallLimit?: number } = {},
): PositionAnalysis {
  const { depth = 1, wallLimit = 16 } = opts;
  const mover = state.turn;

  if (state.winner !== null) {
    const adv = state.winner === 0 ? 20 : -20;
    return { ranked: [], best: null, advantage: adv, winProb: winProbability(adv), evaluatedMoves: 0 };
  }

  const candidates = generateCandidates(state, mover, { wallLimit });

  const ranked: RankedMove[] = candidates.map((move) => {
    const score = evaluateMove(state, move, depth); // mover's perspective
    const advantage = mover === 0 ? scoreToAdvantage(score) : -scoreToAdvantage(score);
    return { move, advantage, winProb: winProbability(advantage) };
  });

  ranked.sort((a, b) => {
    const av = mover === 0 ? a.advantage : -a.advantage;
    const bv = mover === 0 ? b.advantage : -b.advantage;
    return bv - av;
  });

  const best = ranked[0] ?? null;
  return {
    ranked,
    best,
    advantage: best ? best.advantage : positionAdvantage(state),
    winProb: best ? best.winProb : winProbability(positionAdvantage(state)),
    evaluatedMoves: ranked.length,
  };
}

/* ------------------------------------------------------------------ */
/* Full game review                                                   */
/* ------------------------------------------------------------------ */

const emptyCounts = (): Record<Classification, number> => ({
  best: 0,
  excellent: 0,
  good: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
});

const emptySummary = (): PlayerSummary => ({
  accuracy: 0,
  counts: emptyCounts(),
  averageLoss: 0,
  blunders: 0,
  mistakes: 0,
  inaccuracies: 0,
  bestMoves: 0,
});

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Analyse a complete game, one ply at a time. Implemented as a generator so the
 * browser can yield to the event loop between plies and keep the UI responsive.
 */
function* analysisSteps(
  initial: GameState,
  moves: Move[],
  opts: AnalyzeOptions = {},
): Generator<number, GameAnalysis, void> {
  const depth = opts.depth ?? BOT_SEARCH_DEPTH.review;
  const names = opts.names ?? (['You', 'Opponent'] as [string, string]);

  const plies: PlyAnalysis[] = [];
  let state = initial;

  const startAdv = positionAdvantage(initial);
  const graph: EvalGraphPoint[] = [
    {
      ply: 0,
      value: toPercent(winProbability(startAdv)),
      label: 'Start',
    },
  ];

  for (let i = 0; i < moves.length; i++) {
    if (state.winner !== null) break;

    const stateBefore = state;
    const move = moves[i];
    const player = stateBefore.turn;
    const opponent = other(player);

    const analysis = analyzePosition(stateBefore, { depth, wallLimit: opts.wallLimit });
    const stateAfter = applyMove(stateBefore, move);

    // Advantage for player 0 after the played move. The move may be missing from
    // the candidate list (e.g. an odd wall the generator pruned), so fall back to
    // scoring it directly.
    const playedEntry = analysis.ranked.find((r) => sameMove(r.move, move));
    const playedAdv =
      playedEntry?.advantage ??
      (() => {
        const score = evaluateMove(stateBefore, move, depth);
        return player === 0 ? scoreToAdvantage(score) : -scoreToAdvantage(score);
      })();

    const bestAdv = analysis.best?.advantage ?? playedAdv;
    const bestMove = analysis.best?.move ?? move;

    // Win probability for the side that just moved.
    const mover = (adv: number) => (player === 0 ? winProbability(adv) : 1 - winProbability(adv));
    const moverWinProb = mover(playedAdv);
    const moverWinProbBest = mover(bestAdv);
    const loss = Math.max(0, (moverWinProbBest - moverWinProb) * 100);

    const isBest = sameMove(move, bestMove);
    const classification = classify(loss, isBest);

    plies.push({
      index: i,
      moveNumber: Math.floor(i / 2) + 1,
      player,
      move,
      notation: moveNotation(move),
      description: describeMove(move),
      bestMove,
      bestNotation: moveNotation(bestMove),
      advantageBefore: bestAdv,
      advantageAfter: playedAdv,
      winProbBefore: player === 0 ? winProbability(bestAdv) : 1 - winProbability(bestAdv),
      winProbAfter: moverWinProb,
      moverWinProb,
      moverWinProbBest,
      loss: round1(loss),
      accuracy: moveAccuracy(loss),
      classification,
      stateBefore,
      stateAfter,
      paths: [pathLength(stateAfter, 0), pathLength(stateAfter, 1)],
      wallsLeft: [stateAfter.left[0], stateAfter.left[1]],
    });

    graph.push({
      ply: i + 1,
      value: toPercent(winProbability(positionAdvantage(stateAfter))),
      classification,
      player,
      label: `${player === 0 ? 'Green' : 'Red'} ${moveNotation(move)}`,
    });

    state = stateAfter;
    yield i + 1;
  }

  // Per-player aggregates.
  const summaries: [PlayerSummary, PlayerSummary] = [emptySummary(), emptySummary()];
  const accSums: [number, number] = [0, 0];
  const lossSums: [number, number] = [0, 0];
  const accCounts: [number, number] = [0, 0];

  for (const p of plies) {
    const s = summaries[p.player];
    s.counts[p.classification]++;
    accSums[p.player] += p.accuracy;
    lossSums[p.player] += p.loss;
    accCounts[p.player]++;
  }

  for (let i = 0; i < 2; i++) {
    const s = summaries[i];
    s.accuracy = accCounts[i] ? round1(accSums[i] / accCounts[i]) : 0;
    s.averageLoss = accCounts[i] ? round1(lossSums[i] / accCounts[i]) : 0;
    s.blunders = s.counts.blunder;
    s.mistakes = s.counts.mistake;
    s.inaccuracies = s.counts.inaccuracy;
    s.bestMoves = s.counts.best;
  }

  const keyMoments = buildKeyMoments(plies, names);

  // Swing = largest single-point change on the evaluation graph.
  let biggestSwing = 0;
  for (let i = 1; i < graph.length; i++) {
    biggestSwing = Math.max(biggestSwing, Math.abs(graph[i].value - graph[i - 1].value));
  }

  return {
    plies,
    players: summaries,
    keyMoments,
    graph,
    accuracy: [summaries[0].accuracy, summaries[1].accuracy],
    winner: state.winner,
    totalMoves: Math.ceil(plies.length / 2),
    averageRating: estimateRating(summaries[0].accuracy, summaries[1].accuracy),
    verdict: [verdictLine(summaries[0], 0), verdictLine(summaries[1], 1)],
    names,
    biggestSwing: round1(biggestSwing),
  };
}

/** Analyse a complete game synchronously. */
export function analyzeGame(
  initial: GameState,
  moves: Move[],
  opts: AnalyzeOptions = {},
): GameAnalysis {
  const steps = analysisSteps(initial, moves, opts);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * Analyse a complete game without blocking the main thread: yields between
 * half-moves and reports progress so the UI can animate an analysing screen.
 */
export async function analyzeGameAsync(
  initial: GameState,
  moves: Move[],
  opts: AnalyzeOptions = {},
): Promise<GameAnalysis> {
  const steps = analysisSteps(initial, moves, opts);
  let step = steps.next();
  while (!step.done) {
    opts.onProgress?.(step.value, moves.length);
    // Give the browser a frame to paint the progress bar.
    await new Promise((resolve) => setTimeout(resolve, 0));
    step = steps.next();
  }
  return step.value;
}

function buildKeyMoments(plies: PlyAnalysis[], names: [string, string]): KeyMoment[] {
  const picks = new Map<number, PlyAnalysis>();
  const add = (list: PlyAnalysis[], limit: number) => {
    for (const p of list) {
      if (picks.size >= limit) return;
      if (!picks.has(p.index)) picks.set(p.index, p);
    }
  };

  // 1. The real turning points: blunders, then mistakes, then inaccuracies.
  add(
    plies.filter((p) => p.classification === 'blunder').sort((a, b) => b.loss - a.loss),
    3,
  );
  add(
    plies.filter((p) => p.classification === 'mistake').sort((a, b) => b.loss - a.loss),
    3,
  );
  add(
    plies.filter((p) => p.classification === 'inaccuracy').sort((a, b) => b.loss - a.loss),
    3,
  );

  // 2. If the game was clean, highlight the most accurate moves instead.
  if (picks.size === 0) {
    add(
      plies
        .filter((p) => p.classification === 'best' && p.move.type === 'wall')
        .sort((a, b) => b.index - a.index),
      2,
    );
    add([...plies].sort((a, b) => a.index - b.index), 2);
  }

  return [...picks.values()]
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      ply: p.index,
      player: p.player,
      classification: p.classification,
      headline: `Move ${p.moveNumber} · ${CLASSIFICATIONS[p.classification].label}: ${
        names[p.player]
      } ${p.description}`,
      detail:
        p.classification === 'best'
          ? `Top engine choice — win probability ${Math.round(p.moverWinProb * 100)}%.`
          : `Cost ${p.loss.toFixed(1)}% win probability. Best was ${p.bestNotation} (${describeMove(
              p.bestMove,
            )}).`,
      loss: p.loss,
      notation: p.notation,
      bestNotation: p.bestNotation,
    }));
}

function verdictLine(summary: PlayerSummary, player: Player): string {
  const who = player === 0 ? 'Green' : 'Red';
  if (summary.counts.blunder > 0)
    return `${who} lost the thread with ${summary.counts.blunder} blunder${
      summary.counts.blunder > 1 ? 's' : ''
    }.`;
  if (summary.counts.mistake > 1) return `${who} was solid but leaked ${summary.counts.mistake} mistakes.`;
  if (summary.accuracy >= 90) return `${who} played near-flawless paths.`;
  if (summary.accuracy >= 75) return `${who} kept a clean route with minor slips.`;
  return `${who} wandered off the shortest path too often.`;
}

/** Rough "performance rating" of the game, for flavour only. */
function estimateRating(a0: number, a1: number): number {
  const avg = (a0 + a1) / 2;
  return Math.round(Math.max(400, Math.min(2400, avg * 22 + 60)) / 25) * 25;
}

/* ------------------------------------------------------------------ */
/* Helpers used by the review UI                                       */
/* ------------------------------------------------------------------ */

export const moveTitle = (m: Move): string =>
  m.type === 'pawn' ? `Pawn to ${cellName(m.to)}` : `Wall ${wallName(m.wall)}`;

/** Convert a ply index into a human-readable "move 12 · Red" label. */
export const plyLabel = (ply: PlyAnalysis): string =>
  `Move ${ply.moveNumber}${ply.player === 0 ? '' : '…'} · ${ply.player === 0 ? 'Green' : 'Red'}`;

/** Suggest a coaching sentence for the position after `ply`. */
export function coachTip(ply: PlyAnalysis): string {
  if (ply.classification === 'best' || ply.classification === 'excellent') {
    return 'Keep going — this is the engine-approved route.';
  }
  if (ply.classification === 'good') return 'Playable. The engine saw a slightly sharper idea.';
  if (ply.classification === 'inaccuracy') return 'Small leak. Count both paths before you commit.';
  if (ply.classification === 'mistake') return 'That gave away real ground — check the wall count.';
  return 'Big swing. Replay the position and look for the shortest-path move.';
}

/** Build the initial "empty" analysis shown before a review has run. */
export function emptyAnalysis(): GameAnalysis {
  const s = createInitialState();
  return {
    plies: [],
    players: [emptySummary(), emptySummary()],
    keyMoments: [],
    graph: [{ ply: 0, value: toPercent(winProbability(positionAdvantage(s))), label: 'Start' }],
    accuracy: [0, 0],
    winner: null,
    totalMoves: 0,
    averageRating: 0,
    verdict: ['No moves yet.', 'No moves yet.'],
    names: ['You', 'Opponent'],
    biggestSwing: 0,
  };
}

export { GOAL_ROW };
