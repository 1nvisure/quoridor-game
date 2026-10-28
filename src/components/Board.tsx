'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';

import {
  type GameState,
  type Orientation,
  type Pos,
  type Wall,
  SIZE,
  SLOTS,
  GOAL_ROW,
  cellName,
  isEdgeBlocked,
  samePos,
  shortestPath,
  wallName,
} from '@/lib/engine';

/* Board geometry — one unit grid, 9 cells, 8 wall gaps. */
const CELL = 36;
const GAP = 8;
const MARGIN = 8;
const STEP = CELL + GAP; // 44
const TOTAL = MARGIN * 2 + CELL * SIZE + GAP * SLOTS; // 404
const WALL_THICKNESS = 7;
const WALL_LENGTH = CELL * 2 + GAP; // 80

const cellStart = (i: number) => MARGIN + i * STEP;
const cellCenter = (i: number) => cellStart(i) + CELL / 2;
const gapCenter = (i: number) => cellStart(i) + CELL + GAP / 2;

export const pct = (v: number) => `${(v / TOTAL) * 100}%`;

export function wallRect(w: Wall) {
  if (w.o === 'h') {
    return {
      x: cellStart(w.c),
      y: gapCenter(w.r) - WALL_THICKNESS / 2,
      width: WALL_LENGTH,
      height: WALL_THICKNESS,
    };
  }
  return {
    x: gapCenter(w.c) - WALL_THICKNESS / 2,
    y: cellStart(w.r),
    width: WALL_THICKNESS,
    height: WALL_LENGTH,
  };
}

/** All walls currently on the board. */
export function boardWalls(state: GameState): Wall[] {
  const walls: Wall[] = [];
  for (let r = 0; r < SLOTS; r++) {
    for (let c = 0; c < SLOTS; c++) {
      if (state.h[r * SIZE + c]) walls.push({ r, c, o: 'h' });
      if (state.v[r * SIZE + c]) walls.push({ r, c, o: 'v' });
    }
  }
  return walls;
}

const PLAYER_COLOR = ['#81b64c', '#fa412d'];
const PLAYER_DARK = ['#5d8a33', '#b62d1c'];

export interface BoardProps {
  state: GameState;
  /** Legal pawn destinations for the side to move (human only). */
  pawnMoves?: Pos[];
  /** Legal wall slots to render as ghost targets. */
  wallTargets?: Wall[];
  wallMode?: boolean;
  orientation?: Orientation;
  lastMove?: { from: Pos | null; to: Pos | null; wall: Wall | null };
  bestMove?: { move: 'pawn'; to: Pos } | { move: 'wall'; wall: Wall } | null;
  onPawnMove?: (pos: Pos) => void;
  onWallPlace?: (wall: Wall) => void;
  /** Highlight the last move of each pawn. */
  activePlayer?: 0 | 1;
  showPaths?: boolean;
  interactive?: boolean;
  className?: string;
}

export default function Board({
  state,
  pawnMoves = [],
  wallTargets = [],
  wallMode = false,
  orientation = 'h',
  lastMove,
  bestMove,
  onPawnMove,
  onWallPlace,
  activePlayer,
  showPaths = false,
  interactive = true,
  className = '',
}: BoardProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [hoveredWall, setHoveredWall] = useState<string | null>(null);

  const walls = useMemo(() => boardWalls(state), [state]);

  const paths = useMemo(() => {
    if (!showPaths) return [];
    return [0, 1].map((p) => shortestPath(state, p as 0 | 1));
  }, [state, showPaths]);

  const legalMoveSet = useMemo(() => new Set(pawnMoves.map((m) => `${m.r},${m.c}`)), [pawnMoves]);
  const legalWallSet = useMemo(
    () => new Set(wallTargets.map((w) => `${w.r},${w.c},${w.o}`)),
    [wallTargets],
  );

  const checkedCell = (r: number, c: number) => (r + c) % 2 === 0;
  // While placing walls the squares are inert: a click must never be ambiguous.
  const cellsInteractive = interactive && !wallMode;

  return (
    <div
      className={`relative aspect-square w-full select-none overflow-hidden rounded-lg ${className}`}
      style={{ touchAction: 'manipulation' }}
    >
      <svg
        viewBox={`0 0 ${TOTAL} ${TOTAL}`}
        className="absolute inset-0 h-full w-full"
        aria-label="Quoridor board"
      >
        <defs>
          <linearGradient id="boardFrame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2f2e2a" />
            <stop offset="100%" stopColor="#232220" />
          </linearGradient>
          <linearGradient id="wallWood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d3a568" />
            <stop offset="45%" stopColor="#bd8a4b" />
            <stop offset="100%" stopColor="#9a6a34" />
          </linearGradient>
          <linearGradient id="wallWoodV" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d3a568" />
            <stop offset="45%" stopColor="#bd8a4b" />
            <stop offset="100%" stopColor="#9a6a34" />
          </linearGradient>
          <radialGradient id="greenPawn" cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#b6e07c" />
            <stop offset="55%" stopColor="#81b64c" />
            <stop offset="100%" stopColor="#4f7a2a" />
          </radialGradient>
          <radialGradient id="redPawn" cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#ff9b8b" />
            <stop offset="55%" stopColor="#fa412d" />
            <stop offset="100%" stopColor="#a92415" />
          </radialGradient>
          <filter id="pawnShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodOpacity="0.45" />
          </filter>
          <filter id="wallShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Frame */}
        <rect x="0" y="0" width={TOTAL} height={TOTAL} rx="6" fill="url(#boardFrame)" />

        {/* Cells */}
        <g>
          {Array.from({ length: SIZE * SIZE }).map((_, i) => {
            const r = Math.floor(i / SIZE);
            const c = i % SIZE;
            const isGoalGreen = r === GOAL_ROW[0];
            const isGoalRed = r === GOAL_ROW[1];
            const light = checkedCell(r, c);
            let fill = light ? '#e9e2d0' : '#dcd2bb';
            if (isGoalGreen) fill = light ? '#dcebc4' : '#cfe0b2';
            if (isGoalRed) fill = light ? '#f4d9cf' : '#ebc5b9';

            const key = `${r},${c}`;
            const isLegal = legalMoveSet.has(key);
            const isHovered = hoveredCell === key;

            return (
              <g key={key}>
                <rect
                  x={cellStart(c)}
                  y={cellStart(r)}
                  width={CELL}
                  height={CELL}
                  fill={fill}
                  rx={2}
                  className={cellsInteractive && isLegal ? 'cursor-pointer' : undefined}
                  onPointerEnter={() => setHoveredCell(key)}
                  onPointerLeave={() => setHoveredCell((h) => (h === key ? null : h))}
                  onClick={() => {
                    if (cellsInteractive && isLegal) onPawnMove?.({ r, c });
                  }}
                />
                {isLegal && cellsInteractive && (
                  <g pointerEvents="none">
                    <circle
                      cx={cellCenter(c)}
                      cy={cellCenter(r)}
                      r={isHovered ? 8 : 6}
                      fill="#81b64c"
                      opacity={isHovered ? 0.95 : 0.55}
                      style={{ transition: 'all .12s ease-out' }}
                    />
                    {isHovered && (
                      <circle
                        cx={cellCenter(c)}
                        cy={cellCenter(r)}
                        r={15}
                        fill="none"
                        stroke="#81b64c"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        opacity={0.8}
                      />
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Last-move trail */}
        {lastMove?.from && (
          <rect
            x={cellStart(lastMove.from.c)}
            y={cellStart(lastMove.from.r)}
            width={CELL}
            height={CELL}
            rx={2}
            fill={PLAYER_COLOR[activePlayer ?? 0]}
            opacity={0.18}
            pointerEvents="none"
          />
        )}
        {lastMove?.to && (
          <rect
            x={cellStart(lastMove.to.c)}
            y={cellStart(lastMove.to.r)}
            width={CELL}
            height={CELL}
            rx={2}
            fill={PLAYER_COLOR[activePlayer ?? 0]}
            opacity={0.3}
            pointerEvents="none"
          />
        )}

        {/* Shortest paths */}
        {paths.map((p, idx) => {
          if (!p.path.length) return null;
          const points = p.path.map((c) => `${cellCenter(c.c)},${cellCenter(c.r)}`).join(' ');
          return (
            <polyline
              key={idx}
              points={points}
              fill="none"
              stroke={PLAYER_COLOR[idx]}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="5 5"
              opacity={0.65}
              pointerEvents="none"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-20"
                dur="1s"
                repeatCount="indefinite"
              />
            </polyline>
          );
        })}

        {/* Placed walls */}
        <AnimatePresence initial={false}>
          {walls.map((w) => {
            const rect = wallRect(w);
            return (
              <motion.g
                key={`${w.r}-${w.c}-${w.o}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                style={{ transformOrigin: `${rect.x + rect.width / 2}px ${rect.y + rect.height / 2}px` }}
                pointerEvents="none"
              >
                <rect
                  {...rect}
                  rx={2.5}
                  fill={w.o === 'h' ? 'url(#wallWood)' : 'url(#wallWoodV)'}
                  stroke="#7a5227"
                  strokeWidth={0.7}
                  filter="url(#wallShadow)"
                />
                <rect
                  x={rect.x + 1}
                  y={rect.y + 1}
                  width={Math.max(0, rect.width - 2)}
                  height={Math.max(0, rect.height - 2)}
                  rx={2}
                  fill="none"
                  stroke="#ffe0b0"
                  strokeOpacity={0.28}
                  strokeWidth={0.7}
                />
              </motion.g>
            );
          })}
        </AnimatePresence>

        {/* Wall placement ghosts */}
        {interactive &&
          wallMode &&
          wallTargets.map((w) => {
            const rect = wallRect(w);
            const key = `${w.r},${w.c},${w.o}`;
            const hovered = hoveredWall === key;
            return (
              <rect
                key={`ghost-${key}`}
                {...rect}
                rx={2.5}
                fill={hovered ? '#81b64c' : '#ffffff'}
                fillOpacity={hovered ? 0.75 : 0.16}
                stroke={hovered ? '#9bd15f' : '#ffffff'}
                strokeOpacity={hovered ? 0.95 : 0.25}
                strokeWidth={hovered ? 1.2 : 0.8}
                className="cursor-pointer transition-all duration-100"
                onPointerEnter={() => setHoveredWall(key)}
                onPointerLeave={() => setHoveredWall((h) => (h === key ? null : h))}
                onClick={() => onWallPlace?.(w)}
              />
            );
          })}

        {/* Best-move hint */}
        {bestMove?.move === 'wall' &&
          (() => {
            const rect = wallRect(bestMove.wall);
            return (
              <rect
                {...rect}
                rx={2.5}
                fill="none"
                stroke="#81b64c"
                strokeWidth={2}
                strokeDasharray="4 3"
                pointerEvents="none"
              >
                <animate attributeName="stroke-opacity" values="0.35;1;0.35" dur="1.4s" repeatCount="indefinite" />
              </rect>
            );
          })()}

      </svg>

      {/* Pawns (HTML for springy animation) */}
      {[0, 1].map((i) => {
        const pawn = state.pawns[i as 0 | 1];
        const x = pct(cellCenter(pawn.c));
        const y = pct(cellCenter(pawn.r));
        const isTurn = state.turn === i && state.winner === null;
        return (
          <motion.div
            key={`pawn-${i}`}
            initial={false}
            animate={{ left: x, top: y }}
            transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative grid place-items-center" style={{ width: CELL, height: CELL }}>
              {isTurn && (
                <span
                  className="absolute inset-0 animate-pulse-ring rounded-full"
                  style={{ boxShadow: `0 0 0 2px ${PLAYER_COLOR[i]}`, opacity: 0.5 }}
                />
              )}
              <svg width={CELL} height={CELL} viewBox="0 0 36 36" filter="url(#pawnShadow)">
                <circle
                  cx="18"
                  cy="18"
                  r="12.5"
                  fill={i === 0 ? 'url(#greenPawn)' : 'url(#redPawn)'}
                  stroke={PLAYER_DARK[i]}
                  strokeWidth="1"
                />
                <circle cx="18" cy="18" r="7.4" fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.2" />
                <ellipse cx="14.5" cy="12.5" rx="4" ry="2.6" fill="#ffffff" opacity="0.42" transform="rotate(-25 14.5 12.5)" />
              </svg>
            </div>
          </motion.div>
        );
      })}

      {/* Pawn hint for the best move */}
      {bestMove?.move === 'pawn' && (
        <motion.div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          initial={{ left: pct(cellCenter(bestMove.to.c)), top: pct(cellCenter(bestMove.to.r)) }}
          animate={{ left: pct(cellCenter(bestMove.to.c)), top: pct(cellCenter(bestMove.to.r)) }}
        >
          <div className="grid place-items-center" style={{ width: CELL, height: CELL }}>
            <span className="absolute h-9 w-9 animate-pulse-ring rounded-full border-2 border-brand" />
            <span className="h-3.5 w-3.5 rounded-full bg-brand shadow-[0_0_12px_rgba(129,182,76,.9)]" />
          </div>
        </motion.div>
      )}
    </div>
  );
}

/** Distance badges shown beside each player's name. */
export function pathDistances(state: GameState): [number, number] {
  return [shortestPath(state, 0).dist, shortestPath(state, 1).dist];
}

export function describeCell(p: Pos): string {
  return cellName(p);
}

export function describeWall(w: Wall): string {
  return wallName(w);
}

/** True when the wall would sever a path (used for rejected-move feedback). */
export function wouldTrap(state: GameState, wall: Wall): boolean {
  const grid = wall.o === 'h' ? state.h : state.v;
  const i = wall.r * SIZE + wall.c;
  if (grid[i]) return false;
  grid[i] = true;
  const trapped = shortestPath(state, 0).dist === Infinity || shortestPath(state, 1).dist === Infinity;
  grid[i] = false;
  return trapped;
}

/** Cells adjacent to `p` that are reachable (used for hover arrows). */
export function reachableFrom(state: GameState, p: Pos): Pos[] {
  const out: Pos[] = [];
  for (const d of [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ]) {
    const n = { r: p.r + d.r, c: p.c + d.c };
    if (n.r < 0 || n.r >= SIZE || n.c < 0 || n.c >= SIZE) continue;
    if (!isEdgeBlocked(state, p, n)) out.push(n);
  }
  return out;
}

export { samePos };
