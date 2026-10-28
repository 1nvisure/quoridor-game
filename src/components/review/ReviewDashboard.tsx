'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  Gauge,
  Keyboard,
  RotateCcw,
  Sparkles,
  SplitSquareHorizontal,
  SplitSquareVertical,
  TriangleAlert,
  Trophy,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Board from '../Board';
import MoveList from '../MoveList';
import { ClassificationBadge, ClassificationCounts } from './ClassificationBadge';
import EvalGraph from './EvalGraph';
import { Avatar } from '../ui/Avatar';
import { Ring } from '../ui/Ring';
import type { BotProfile } from '@/lib/bots';
import {
  type GameState,
  type Move,
  type Orientation,
  type Player,
  type Pos,
  type Wall,
  describeMove,
  legalPawnMoves,
  legalWalls,
  moveNotation,
} from '@/lib/engine';
import { analyzePosition, CLASSIFICATIONS, classify, moveAccuracy, type GameAnalysis } from '@/lib/review';
import { sameMove } from '@/lib/bots';

interface ReviewDashboardProps {
  analysis: GameAnalysis;
  initial: GameState;
  humanPlayer: Player;
  bot: BotProfile;
  onLeave: () => void;
  onRematch: () => void;
}

interface RetryResult {
  move: Move;
  best: Move;
  loss: number;
  accuracy: number;
  classification: ReturnType<typeof classify>;
}

export default function ReviewDashboard({
  analysis,
  initial,
  humanPlayer,
  bot,
  onLeave,
  onRematch,
}: ReviewDashboardProps) {
  const total = analysis.plies.length;
  const [current, setCurrent] = useState(total);
  const [showBest, setShowBest] = useState(false);
  const [retry, setRetry] = useState<{ ply: number; state: GameState; result: RetryResult | null } | null>(
    null,
  );
  const [wallMode, setWallMode] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>('h');

  const botSeat = (1 - humanPlayer) as Player;
  const gameplay = analysis.plies;

  const clamped = Math.max(0, Math.min(total, current));

  const boardState: GameState = useMemo(() => {
    if (retry) return retry.state;
    if (clamped === 0) return initial;
    return analysis.plies[clamped - 1]?.stateAfter ?? initial;
  }, [analysis.plies, clamped, initial, retry]);

  const activePly = clamped > 0 ? analysis.plies[clamped - 1] : null;

  const go = useCallback(
    (n: number) => {
      setRetry(null);
      setShowBest(false);
      setCurrent(Math.max(0, Math.min(total, n)));
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(clamped - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(clamped + 1);
      } else if (e.key === 'Home') {
        go(0);
      } else if (e.key === 'End') {
        go(total);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clamped, go, total]);

  /* ---------------- Retry ---------------- */

  const startRetry = () => {
    if (!activePly) return;
    setShowBest(false);
    setWallMode(false);
    setRetry({ ply: activePly.index, state: activePly.stateBefore, result: null });
  };

  const playRetryMove = (move: Move) => {
    if (!retry) return;
    const state = retry.state;
    const an = analyzePosition(state, { depth: 1 });
    const best = an.best?.move ?? move;
    const playedEntry = an.ranked.find((r) => sameMove(r.move, move));
    const advantage = playedEntry?.advantage ?? an.advantage;

    const mover = (adv: number) => (state.turn === 0 ? 1 / (1 + Math.exp(-adv * 0.55)) : 1 - 1 / (1 + Math.exp(-adv * 0.55)));
    const loss = Math.max(0, (mover(an.best?.advantage ?? advantage) - mover(advantage)) * 100);

    setRetry({
      ...retry,
      result: {
        move,
        best,
        loss,
        accuracy: moveAccuracy(loss),
        classification: classify(loss, sameMove(move, best)),
      },
    });
  };

  const retryLegalPawns = useMemo<Pos[]>(() => {
    if (!retry || retry.result) return [];
    return legalPawnMoves(retry.state, retry.state.turn);
  }, [retry]);

  const retryLegalWalls = useMemo<Wall[]>(() => {
    if (!retry || retry.result || !wallMode) return [];
    return legalWalls(retry.state, retry.state.turn).filter((w) => w.o === orientation);
  }, [retry, wallMode, orientation]);

  /* ---------------- derived labels ---------------- */

  const humanAccuracy = analysis.accuracy[humanPlayer];
  const botAccuracy = analysis.accuracy[botSeat];

  const bestMoveHint = useMemo(() => {
    // In retry mode, reveal the engine's ideal move once the attempt is scored.
    const bm = retry ? (retry.result ? retry.result.best : null) : showBest ? activePly?.bestMove : null;
    if (!bm) return null;
    return bm.type === 'pawn'
      ? { move: 'pawn' as const, to: bm.to }
      : { move: 'wall' as const, wall: bm.wall };
  }, [showBest, activePly, retry]);

  const lastMove = useMemo(() => {
    if (retry) return { from: null, to: null, wall: null };
    if (!activePly) return { from: null, to: null, wall: null };
    const before = activePly.stateBefore.pawns[activePly.player];
    if (activePly.move.type === 'pawn') {
      return { from: before, to: activePly.move.to, wall: null };
    }
    return { from: null, to: null, wall: activePly.move.wall };
  }, [activePly, retry]);

  const entries = useMemo(
    () =>
      gameplay.map((p, i) => ({
        move: p.move,
        player: p.player,
        active: i === clamped - 1,
        badge: {
          symbol: CLASSIFICATIONS[p.classification].symbol,
          color: CLASSIFICATIONS[p.classification].color,
          bg: CLASSIFICATIONS[p.classification].bg,
        },
      })),
    [gameplay, clamped],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-16 pt-3 sm:px-5">
      {/* top bar */}
      <header className="mb-4 flex items-center gap-3">
        <button onClick={onLeave} className="btn-ghost !px-2" aria-label="Back to lobby">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="text-[17px] font-extrabold text-white">Game Review</h1>
          <p className="text-[11.5px] font-semibold text-[#6f6b64]">
            You vs {bot.name} ({bot.elo}) · {analysis.totalMoves} moves
            {analysis.winner !== null && (
              <>
                {' · '}
                {analysis.winner === humanPlayer ? 'you won' : `${bot.name} won`}
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onRematch} className="btn-secondary !px-3 !py-2 !text-[12px]">
            <RotateCcw size={13} /> Rematch
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------- board column ---------------- */}
        <div className="mx-auto w-full max-w-[560px]">
          <div className="mb-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-app-800 px-3 py-2">
            <div className="flex items-center gap-2">
              <Avatar emoji={bot.emoji} gradient={bot.gradient} size={28} />
              <span className="text-[12.5px] font-bold text-[#e9e6df]">{bot.name}</span>
            </div>
            <span className="text-[11px] font-bold tabular-nums text-[#8d8981]">
              {botAccuracy.toFixed(1)}% accuracy
            </span>
          </div>

          <div className="relative rounded-xl border border-white/[0.07] bg-app-850 p-1.5 shadow-card">
            <Board
              state={boardState}
              pawnMoves={retryLegalPawns}
              wallTargets={retryLegalWalls}
              wallMode={wallMode}
              orientation={orientation}
              lastMove={lastMove}
              onPawnMove={retry ? (pos) => playRetryMove({ type: 'pawn', to: pos }) : undefined}
              onWallPlace={retry ? (w) => playRetryMove({ type: 'wall', wall: w }) : undefined}
              bestMove={bestMoveHint}
              interactive={!!retry}
              activePlayer={activePly?.player}
            />

            {/* classification chip over the board */}
            {activePly && !retry && (
                <motion.div
                  key={activePly.index}
                  initial={{ opacity: 0, y: -6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="pointer-events-none absolute left-3 top-3"
                >
                  <div className="rounded-lg bg-black/65 p-1 backdrop-blur">
                    <ClassificationBadge
                      classification={activePly.classification}
                      size="lg"
                      loss={activePly.loss}
                    />
                  </div>
                </motion.div>
              )}
          </div>

          <div className="mt-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-app-800 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[#3c3a35] to-[#282724] ring-1 ring-white/15">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8.5" r="3.9" fill="#cfcabf" />
                  <path d="M3.6 21c.9-4.2 4.2-6.4 8.4-6.4s7.5 2.2 8.4 6.4" fill="#cfcabf" />
                </svg>
              </span>
              <span className="text-[12.5px] font-bold text-[#e9e6df]">You</span>
            </div>
            <span className="text-[11px] font-bold tabular-nums text-[#8d8981]">
              {humanAccuracy.toFixed(1)}% accuracy
            </span>
          </div>

          {/* navigation */}
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-app-750 p-2.5">
            {retry ? (
              <RetryPanel
                retry={retry}
                onMove={playRetryMove}
                onReset={() => setRetry({ ...retry, result: null })}
                onExit={() => setRetry(null)}
                wallMode={wallMode}
                setWallMode={setWallMode}
                orientation={orientation}
                setOrientation={setOrientation}
              />
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <NavBtn onClick={() => go(0)} label="Start">
                    <ChevronFirst size={16} />
                  </NavBtn>
                  <NavBtn onClick={() => go(clamped - 1)} label="Previous">
                    <ChevronLeft size={16} />
                  </NavBtn>
                  <NavBtn onClick={() => go(clamped + 1)} label="Next">
                    <ChevronRight size={16} />
                  </NavBtn>
                  <NavBtn onClick={() => go(total)} label="End">
                    <ChevronLast size={16} />
                  </NavBtn>

                  <div className="mx-1 h-6 w-px bg-white/10" />

                  <button
                    onClick={() => setShowBest((v) => !v)}
                    disabled={!activePly}
                    className={`btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold ${
                      showBest
                        ? 'bg-brand/20 text-brand-light'
                        : 'bg-app-700 text-[#b7b3aa] hover:bg-app-600'
                    } disabled:opacity-40`}
                  >
                    {showBest ? <Eye size={13} /> : <EyeOff size={13} />} Best move
                  </button>

                  <button
                    onClick={startRetry}
                    disabled={!activePly}
                    className="btn flex items-center gap-1.5 rounded-lg bg-app-700 px-2.5 py-1.5 text-[11.5px] font-bold text-[#b7b3aa] hover:bg-app-600 disabled:opacity-40"
                  >
                    <RotateCcw size={13} /> Retry
                  </button>

                  <span className="ml-auto pr-1 text-[11px] font-bold tabular-nums text-[#6f6b64]">
                    {clamped}/{total}
                  </span>
                </div>

                <div className="mt-2 min-h-[46px] rounded-lg bg-app-800 px-3 py-2">
                  {activePly ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <ClassificationBadge classification={activePly.classification} size="sm" />
                      <span className="text-[12.5px] font-bold text-[#e9e6df]">
                        {activePly.player === humanPlayer ? 'You' : bot.name}{' '}
                        {describeMove(activePly.move)}
                      </span>
                      {activePly.classification !== 'best' && (
                        <>
                          <span className="text-[11px] font-semibold text-[#6f6b64]">best was</span>
                          <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[11.5px] font-bold text-brand-light">
                            {moveNotation(activePly.bestMove)}
                          </span>
                        </>
                      )}
                      <span className="ml-auto text-[11px] font-bold tabular-nums text-[#8d8981]">
                        Your win chance{' '}
                        <span
                          className="text-[#e9e6df]"
                          style={{
                            color:
                              (activePly.player === humanPlayer
                                ? activePly.winProbAfter
                                : 1 - activePly.winProbAfter) >= 0.5
                                ? '#9bd15f'
                                : '#ff8e7f',
                          }}
                        >
                          {Math.round(
                            (activePly.player === humanPlayer
                              ? activePly.winProbAfter
                              : 1 - activePly.winProbAfter) * 100,
                          )}
                          %
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-[#8d8981]">
                      <Flag size={13} /> Starting position
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] font-semibold text-[#5d5a54]">
            <Keyboard size={12} /> Arrow keys to step through the game
          </div>
        </div>

        {/* ---------------- right column ---------------- */}
        <aside className="flex flex-col gap-3">
          {/* accuracy summary */}
          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">
                <Gauge size={13} /> Accuracy
              </h2>
              <span className="chip !text-[9px]">
                <Trophy size={9} /> ~{analysis.averageRating} rated
              </span>
            </div>

            <div className="flex items-center justify-around gap-2">
              <div className="text-center">
                <Ring
                  value={humanAccuracy}
                  size={112}
                  color="#81b64c"
                  label={`${humanAccuracy.toFixed(1)}%`}
                  sublabel="You"
                />
              </div>
              <div className="text-center">
                <Ring
                  value={botAccuracy}
                  size={112}
                  color="#fa412d"
                  label={`${botAccuracy.toFixed(1)}%`}
                  sublabel={bot.name}
                />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#81b64c]">
                  You
                </div>
                <ClassificationCounts counts={analysis.players[humanPlayer].counts} />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#fa412d]">
                  {bot.name}
                </div>
                <ClassificationCounts counts={analysis.players[botSeat].counts} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
              <MiniMetric
                label="Your avg loss"
                value={`${analysis.players[humanPlayer].averageLoss.toFixed(1)}%`}
              />
              <MiniMetric
                label={`${bot.name} avg loss`}
                value={`${analysis.players[botSeat].averageLoss.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* graph */}
          <div className="panel p-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">
                <Sparkles size={13} /> Evaluation
              </h2>
              <div className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-wide text-[#6f6b64]">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#81b64c]" /> you
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#fa412d]" /> bot
                </span>
              </div>
            </div>
            <EvalGraph
              points={analysis.graph.map((g) => ({
                ...g,
                value: humanPlayer === 0 ? g.value : 100 - g.value,
              }))}
              current={clamped}
              onSelect={(i) => {
                setRetry(null);
                setCurrent(i);
              }}
            />
            <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-[#6f6b64]">
              <span>Win probability · your side up</span>
              <span className="tabular-nums">biggest swing {analysis.biggestSwing.toFixed(1)}%</span>
            </div>
          </div>

          {/* key moments */}
          {analysis.keyMoments.length > 0 && (
            <div className="panel p-3">
              <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">
                <TriangleAlert size={13} /> Key moments
              </h2>
              <div className="space-y-2">
                {analysis.keyMoments.map((k) => {
                  const meta = CLASSIFICATIONS[k.classification];
                  return (
                    <button
                      key={k.ply}
                      onClick={() => {
                        setRetry(null);
                        setCurrent(k.ply + 1);
                      }}
                      className="group w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-white/[0.04]"
                      style={{ borderColor: meta.border, background: meta.bg }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-black"
                          style={{ background: meta.color, color: '#15150f' }}
                        >
                          {meta.symbol}
                        </span>
                        <span
                          className="truncate text-[11.5px] font-bold"
                          style={{ color: meta.color }}
                        >
                          {k.headline}
                        </span>
                        {k.loss > 0 && (
                          <span
                            className="ml-auto shrink-0 text-[10px] font-bold tabular-nums"
                            style={{ color: meta.color }}
                          >
                            −{k.loss.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-[#c9c5bc]">{k.detail}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* move table */}
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">Moves</h2>
              <span className="text-[10px] font-semibold text-[#6f6b64]">
                click to jump
              </span>
            </div>
            <MoveList
              entries={entries}
              onSelect={(i) => {
                setRetry(null);
                setCurrent(i + 1);
              }}
            />
          </div>

          <div className="panel p-3">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">
              <Wand2 size={13} /> Verdict
            </h2>
            <p className="text-[11.5px] leading-relaxed text-[#b7b3aa]">{analysis.verdict[humanPlayer]}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#8d8981]">{analysis.verdict[botSeat]}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NavBtn({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg bg-app-700 text-[#b7b3aa] transition-colors hover:bg-app-600 hover:text-white"
    >
      {children}
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-app-800 px-2 py-1.5">
      <div className="text-[13px] font-extrabold tabular-nums text-white">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#6f6b64]">{label}</div>
    </div>
  );
}

function RetryPanel({
  retry,
  onMove,
  onReset,
  onExit,
  wallMode,
  setWallMode,
  orientation,
  setOrientation,
}: {
  retry: { ply: number; state: GameState; result: RetryResult | null };
  onMove: (m: Move) => void;
  onReset: () => void;
  onExit: () => void;
  wallMode: boolean;
  setWallMode: (v: boolean) => void;
  orientation: Orientation;
  setOrientation: (o: Orientation) => void;
}) {
  const meta = retry.result ? CLASSIFICATIONS[retry.result.classification] : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md bg-brand/15 px-2 py-1 text-[11px] font-bold text-brand-light">
          <RotateCcw size={11} /> Retry mode
        </span>
        <span className="text-[11.5px] font-semibold text-[#8d8981]">
          Play a different move from this position
        </span>
        <button onClick={onExit} className="btn-ghost ml-auto !py-1 !text-[11px]">
          Back to review
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setWallMode(!wallMode)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
            wallMode ? 'bg-brand/20 text-brand-light' : 'bg-app-700 text-[#b7b3aa] hover:bg-app-600'
          }`}
        >
          {wallMode ? <Eye size={13} /> : <EyeOff size={13} />} Walls
        </button>
        <button
          onClick={() => {
            setOrientation('h');
            setWallMode(true);
          }}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold ${
            orientation === 'h' ? 'bg-app-600 text-white' : 'bg-app-700 text-[#8d8981]'
          }`}
        >
          <SplitSquareHorizontal size={12} /> H
        </button>
        <button
          onClick={() => {
            setOrientation('v');
            setWallMode(true);
          }}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold ${
            orientation === 'v' ? 'bg-app-600 text-white' : 'bg-app-700 text-[#8d8981]'
          }`}
        >
          <SplitSquareVertical size={12} /> V
        </button>

        {retry.result && (
          <button onClick={onReset} className="btn-secondary ml-auto !px-2.5 !py-1.5 !text-[11px]">
            <RotateCcw size={12} /> Try again
          </button>
        )}
      </div>

      {retry.result && meta ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 rounded-lg border p-2.5"
          style={{ borderColor: meta.border, background: meta.bg }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationBadge classification={retry.result.classification} size="sm" />
            <span className="text-[12.5px] font-bold text-white">
              You {describeMove(retry.result.move)}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
              {retry.result.loss > 0 ? `−${retry.result.loss.toFixed(1)}% win chance` : 'top choice!'}
            </span>
            <span className="ml-auto text-[11px] font-bold tabular-nums text-[#8d8981]">
              {retry.result.accuracy.toFixed(0)}% accuracy
            </span>
          </div>
          {!sameMove(retry.result.move, retry.result.best) && (
            <p className="mt-1 text-[11.5px] text-[#c9c5bc]">
              Engine preferred <span className="font-bold text-brand-light">{moveNotation(retry.result.best)}</span>{' '}
              — {describeMove(retry.result.best)}.
            </p>
          )}
        </motion.div>
      ) : (
        <p className="mt-2 rounded-lg bg-app-800 px-3 py-2 text-[11.5px] text-[#8d8981]">
          Tap a highlighted square to move, or switch on Walls to try a different wall.
        </p>
      )}
    </div>
  );
}
