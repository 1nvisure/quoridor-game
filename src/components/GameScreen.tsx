'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChartNoAxesColumn,
  Eye,
  EyeOff,
  Flag,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Trophy,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Board from './Board';
import PlayerCard from './PlayerCard';
import MoveList from './MoveList';
import type { BotProfile } from '@/lib/bots';
import {
  type GameState,
  type Move,
  type Orientation,
  type Player,
  type Pos,
  type Wall,
  legalPawnMoves,
  legalWalls,
  pathLength,
  samePos,
  shortestPath,
} from '@/lib/engine';
import type { HistoryEntry } from '@/lib/types';

export interface GameScreenProps {
  state: GameState;
  humanPlayer: Player;
  bot: BotProfile;
  history: HistoryEntry[];
  thinking: boolean;
  onMove: (move: Move) => void;
  onResign: () => void;
  onLeave: () => void;
  onReview: () => void;
  onRematch: () => void;
  reviewing?: boolean;
  lastMove: { from: Pos | null; to: Pos | null; wall: Wall | null } | null;
}

export default function GameScreen({
  state,
  humanPlayer,
  bot,
  history,
  thinking,
  onMove,
  onResign,
  onLeave,
  onReview,
  onRematch,
  reviewing,
  lastMove,
}: GameScreenProps) {
  const [wallMode, setWallMode] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [showPaths, setShowPaths] = useState(false);
  const [hint, setHint] = useState<Pos | Wall | null>(null);
  // The result modal is dismissible — the user may want to study the final board.
  const [resultOpen, setResultOpen] = useState(true);

  const gameOver = state.winner !== null;
  useEffect(() => {
    if (gameOver) setResultOpen(true);
  }, [gameOver]);
  const myTurn = state.turn === humanPlayer && !gameOver && !thinking;

  const pawnMoves = useMemo<Pos[]>(
    () => (myTurn ? legalPawnMoves(state, humanPlayer) : []),
    [state, myTurn, humanPlayer],
  );

  const wallTargets = useMemo<Wall[]>(
    () => (myTurn && wallMode ? legalWalls(state, humanPlayer).filter((w) => w.o === orientation) : []),
    [state, myTurn, wallMode, orientation, humanPlayer],
  );

  const resetHint = useCallback(() => setHint(null), []);
  useEffect(() => {
    resetHint();
  }, [state.ply, resetHint]);

  const handlePawn = useCallback(
    (pos: Pos) => {
      if (!myTurn) return;
      onMove({ type: 'pawn', to: pos });
    },
    [myTurn, onMove],
  );

  const handleWall = useCallback(
    (wall: Wall) => {
      if (!myTurn) return;
      onMove({ type: 'wall', wall });
    },
    [myTurn, onMove],
  );

  // Keyboard shortcuts: W toggles wall mode, H/V pick the orientation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'w') {
        setWallMode((v) => !v);
      } else if (k === 'h') {
        setWallMode(true);
        setOrientation('h');
      } else if (k === 'v') {
        setWallMode(true);
        setOrientation('v');
      } else if (k === 'escape') {
        setWallMode(false);
      } else if (k === 'p') {
        setShowPaths((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const botSeat = (1 - humanPlayer) as Player;
  const lastMover = history[history.length - 1]?.player;
  const myDist = pathLength(state, humanPlayer);
  const botDist = pathLength(state, botSeat);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-3 pb-6 pt-3 sm:px-5">
      {/* Header */}
      <header className="mb-3 flex items-center gap-3">
        <button onClick={onLeave} className="btn-ghost !px-2" aria-label="Back to lobby">
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-extrabold text-white">
              {bot.name} <span className="font-semibold text-[#8d8981]">({bot.elo})</span>
            </h1>
            <span className="chip !border-white/[0.08] !bg-white/[0.04] !text-[9px]">
              {bot.tagline}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-[#6f6b64]">
            Move {Math.floor(state.ply / 2) + 1} ·{' '}
            {gameOver
              ? 'Game over'
              : thinking
                ? `${bot.name} is thinking…`
                : myTurn
                  ? 'Your move'
                  : 'Waiting'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={onResign} disabled={gameOver} className="btn-secondary !px-3 !py-2 !text-[12px]">
            <Flag size={13} /> Resign
          </button>
          {gameOver && !resultOpen && (
            <button
              onClick={() => setResultOpen(true)}
              className="btn-primary !px-3 !py-2 !text-[12px]"
            >
              <Trophy size={13} /> Result
            </button>
          )}
          <button
            onClick={onRematch}
            className="btn-secondary hidden !px-3 !py-2 !text-[12px] sm:flex"
          >
            <RotateCcw size={13} /> Rematch
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* Board column — capped by viewport height so a laptop never has to scroll. */}
        <div className="mx-auto w-full max-w-[min(600px,calc(100dvh-17rem))]">
          <div className="mb-2">
            <PlayerCard
              player={botSeat}
              name={bot.name}
              elo={bot.elo}
              emoji={bot.emoji}
              gradient={bot.gradient}
              wallsLeft={state.left[botSeat]}
              active={!gameOver && state.turn === botSeat}
              thinking={thinking}
              pathLength={showPaths ? botDist : null}
              side="top"
            />
          </div>

          <div className="relative rounded-xl border border-white/[0.07] bg-app-850 p-1.5 shadow-card">
            <Board
              state={state}
              pawnMoves={pawnMoves}
              wallTargets={wallTargets}
              wallMode={wallMode}
              orientation={orientation}
              lastMove={lastMove ?? undefined}
              onPawnMove={handlePawn}
              onWallPlace={handleWall}
              activePlayer={lastMover}
              showPaths={showPaths}
              interactive={myTurn || gameOver}
              bestMove={
                hint && !('o' in hint)
                  ? { move: 'pawn', to: hint as Pos }
                  : hint
                    ? { move: 'wall', wall: hint as Wall }
                    : null
              }
            />
            {thinking && !gameOver && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
                >
                  <span className="flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-[#d8d4cb] backdrop-blur">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-brand"
                          animate={{ opacity: [0.25, 1, 0.25] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </span>
                    {bot.name} is choosing a wall…
                  </span>
                </motion.div>
              )}
          </div>

          <div className="mt-2">
            <PlayerCard
              player={humanPlayer}
              name="You"
              isHuman
              wallsLeft={state.left[humanPlayer]}
              active={!gameOver && state.turn === humanPlayer}
              pathLength={showPaths ? myDist : null}
              side="bottom"
            />
          </div>

        </div>

        {/* Side panel */}
        <aside className="flex flex-col gap-3">
          {/* Wall controls sit first so they stay reachable right under the board
              on phones, where the sidebar stacks beneath the play area. */}
          <div className="panel p-3">
            <WallControls
              wallsLeft={state.left[humanPlayer]}
              wallMode={wallMode}
              setWallMode={setWallMode}
              orientation={orientation}
              setOrientation={setOrientation}
              disabled={!myTurn}
            />
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">
                Moves
              </h2>
              <div className="flex items-center gap-1 text-[10.5px] font-semibold text-[#6f6b64]">
                <span className="tabular-nums">{state.ply}</span> plies
              </div>
            </div>
            <MoveList
              entries={history.map((h) => ({ move: h.move, player: h.player }))}
              compact
            />
          </div>

          {/* Analysis helpers */}
          <div className="panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="stat-label">Assist</span>
              <span className="text-[10px] font-semibold text-[#6f6b64]">local only</span>
            </div>
            <div className="space-y-1.5">
              <button
                onClick={() => setShowPaths((v) => !v)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors ${
                  showPaths ? 'bg-brand/15 text-brand-light' : 'text-[#b7b3aa] hover:bg-white/[0.05]'
                }`}
              >
                <Sparkles size={14} />
                Shortest paths
                <span className="ml-auto text-[10px] font-bold text-[#6f6b64]">
                  {myDist} / {botDist}
                </span>
              </button>
              <button
                onClick={() => {
                  if (hint) {
                    setHint(null);
                    return;
                  }
                  // BFS ignores pawns, so make sure the hint is an actually playable square.
                  const route = shortestPath(state, humanPlayer).path.slice(1);
                  const legal = legalPawnMoves(state, humanPlayer);
                  const target =
                    route.find((cell) => legal.some((m) => samePos(m, cell))) ?? legal[0] ?? null;
                  setHint(target);
                }}
                disabled={!myTurn}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-[#b7b3aa] transition-colors hover:bg-white/[0.05] disabled:opacity-40"
              >
                <Lightbulb size={14} />
                Show next step
                <span className="ml-auto text-[10px] font-bold text-[#6f6b64]">
                  {hint ? 'hide' : 'show'}
                </span>
              </button>
            </div>
          </div>

          {gameOver && (
            <button
              onClick={onReview}
              disabled={reviewing || history.length === 0}
              className="btn-primary w-full"
            >
              <ChartNoAxesColumn size={16} />
              {reviewing
                ? 'Analysing game…'
                : history.length === 0
                  ? 'No moves to review'
                  : 'Game Review'}
            </button>
          )}

          <div className="hidden text-center text-[10.5px] leading-relaxed text-[#5d5a54] lg:block">
            Walls are BFS-validated: a placement that seals off a player&apos;s only route is
            rejected before it touches the board.
          </div>
        </aside>
      </div>

      {gameOver && resultOpen && (
          <GameOverPanel
            state={state}
            humanPlayer={humanPlayer}
            bot={bot}
            onReview={onReview}
            onRematch={onRematch}
            onLeave={onLeave}
            onClose={() => setResultOpen(false)}
            reviewing={reviewing}
            canReview={history.length > 0}
          />
        )}
    </div>
  );
}

function WallControls({
  wallsLeft,
  wallMode,
  setWallMode,
  orientation,
  setOrientation,
  disabled,
}: {
  wallsLeft: number;
  wallMode: boolean;
  setWallMode: (fn: (v: boolean) => boolean) => void;
  orientation: Orientation;
  setOrientation: (o: Orientation) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="stat-label">Walls</span>
        <span className="text-[11px] font-bold tabular-nums text-[#c9c5bc]">{wallsLeft} / 10 left</span>
      </div>

      <button
        onClick={() => setWallMode((v) => !v)}
        disabled={disabled || wallsLeft === 0}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] font-bold transition-colors disabled:opacity-40 ${
          wallMode
            ? 'border-brand bg-brand/15 text-brand-light'
            : 'border-white/10 bg-app-700 text-[#c9c5bc] hover:border-white/20'
        }`}
      >
        {wallMode ? <Eye size={14} /> : <EyeOff size={14} />}
        {wallMode ? 'Placing walls' : 'Place a wall'}
        <kbd className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-[#8d8981]">W</kbd>
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <OrientationButton
          active={orientation === 'h'}
          onClick={() => {
            setOrientation('h');
            setWallMode(() => true);
          }}
          icon={<SplitSquareHorizontal size={15} />}
          label="Horizontal"
          kbd="H"
        />
        <OrientationButton
          active={orientation === 'v'}
          onClick={() => {
            setOrientation('v');
            setWallMode(() => true);
          }}
          icon={<SplitSquareVertical size={15} />}
          label="Vertical"
          kbd="V"
        />
      </div>
    </>
  );
}

function OrientationButton({
  active,
  onClick,
  icon,
  label,
  kbd,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  kbd: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11.5px] font-bold transition-colors ${
        active
          ? 'border-white/20 bg-app-600 text-white'
          : 'border-white/[0.07] bg-app-800 text-[#8d8981] hover:text-[#c9c5bc]'
      }`}
    >
      {icon}
      {label}
      <kbd className="rounded bg-black/30 px-1 text-[9px] font-bold">{kbd}</kbd>
    </button>
  );
}

function GameOverPanel({
  state,
  humanPlayer,
  bot,
  onReview,
  onRematch,
  onLeave,
  onClose,
  reviewing,
  canReview = true,
}: {
  state: GameState;
  humanPlayer: Player;
  bot: BotProfile;
  onReview: () => void;
  onRematch: () => void;
  onLeave: () => void;
  onClose: () => void;
  reviewing?: boolean;
  canReview?: boolean;
}) {
  const win = state.winner === humanPlayer;
  const draw = state.winner === null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-app-750 p-6 text-center shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[#8d8981] transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div
          className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-2xl"
          style={{
            background: draw ? 'rgba(255,255,255,.08)' : win ? 'rgba(129,182,76,.18)' : 'rgba(250,65,45,.16)',
          }}
        >
          {draw ? '🤝' : win ? '🏆' : '💀'}
        </div>

        <h2 className="text-xl font-extrabold text-white">
          {draw ? 'Game over' : win ? 'You won!' : 'You lost'}
        </h2>
        <p className="mt-1 text-[12.5px] text-[#a8a49b]">
          {draw
            ? 'Nobody reached the far side.'
            : win
              ? `You reached the top in ${Math.ceil(state.ply / 2)} moves against ${bot.name}.`
              : `${bot.name} reached the bottom in ${Math.ceil(state.ply / 2)} moves.`}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Moves" value={String(Math.ceil(state.ply / 2))} />
          <MiniStat label="Walls left" value={String(state.left[humanPlayer])} />
          <MiniStat label="Opp walls" value={String(state.left[1 - humanPlayer])} />
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={onReview}
            disabled={reviewing || !canReview}
            className="btn-primary w-full"
          >
            <ChartNoAxesColumn size={16} />
            {reviewing ? 'Analysing…' : canReview ? 'Game Review' : 'No moves to review'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onRematch} className="btn-secondary">
              <RotateCcw size={14} /> Rematch
            </button>
            <button onClick={onLeave} className="btn-secondary">
              <ArrowLeft size={14} /> Lobby
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-app-800 py-2">
      <div className="text-base font-extrabold tabular-nums text-white">{value}</div>
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#6f6b64]">{label}</div>
    </div>
  );
}
