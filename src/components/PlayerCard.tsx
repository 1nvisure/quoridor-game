'use client';

import { motion } from 'framer-motion';
import { Flag, Timer } from 'lucide-react';

import { Avatar, HumanAvatar } from './ui/Avatar';
import type { Player } from '@/lib/engine';

export function WallPips({ left, total = 10, color }: { left: number; total?: number; color: string }) {
  return (
    <div className="flex items-center gap-[3px]" aria-label={`${left} walls remaining`}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.span
          key={i}
          className="h-[13px] w-[4px] rounded-[1px]"
          initial={false}
          animate={{
            backgroundColor: i < left ? color : 'rgba(255,255,255,.12)',
            opacity: i < left ? 1 : 0.6,
          }}
          transition={{ duration: 0.25 }}
        />
      ))}
    </div>
  );
}

export interface PlayerCardProps {
  player: Player;
  name: string;
  elo?: number;
  emoji?: string;
  gradient?: string;
  isHuman?: boolean;
  wallsLeft: number;
  active: boolean;
  thinking?: boolean;
  /** Shortest path length, shown when the path overlay is enabled. */
  pathLength?: number | null;
  capturedWalls?: number;
  side: 'top' | 'bottom';
}

export default function PlayerCard({
  player,
  name,
  elo,
  emoji,
  gradient,
  isHuman,
  wallsLeft,
  active,
  thinking,
  pathLength,
  side,
}: PlayerCardProps) {
  const accent = player === 0 ? '#81b64c' : '#fa412d';

  return (
    <div
      className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200 ${
        active
          ? 'border-white/[0.14] bg-app-750'
          : 'border-white/[0.05] bg-app-800/70'
      }`}
    >
      {active && (
        <motion.span
          layoutId="active-player-bar"
          className="absolute -left-px top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: accent }}
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}

      <div className="relative">
        {isHuman ? (
          <HumanAvatar size={40} name={name} />
        ) : (
          <Avatar
            emoji={emoji ?? '🤖'}
            gradient={gradient ?? 'from-slate-600 to-slate-800'}
            size={40}
            ring={accent}
            thinking={thinking}
            label={name}
          />
        )}
        <span
          className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full text-[9px] font-black"
          style={{ background: accent, color: '#121212' }}
        >
          {player === 0 ? 'G' : 'R'}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-[#e9e6df]">{name}</span>
          {elo !== undefined && (
            <span className="shrink-0 text-[11px] font-semibold text-[#8d8981]">({elo})</span>
          )}
          {thinking && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#8d8981]">
              <Timer size={11} className="animate-spin" style={{ animationDuration: '2.4s' }} />
              thinking
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2.5">
          <WallPips left={wallsLeft} color={accent} />
          <span className="text-[10px] font-semibold tabular-nums text-[#6f6b64]">
            {wallsLeft} left
          </span>
          {pathLength != null && pathLength !== Infinity && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#b7b3aa]">
              {pathLength} to goal
            </span>
          )}
        </div>
      </div>

      {side === 'top' && (
        <Flag size={14} className="shrink-0 text-[#5d5a54]" aria-hidden />
      )}
    </div>
  );
}
