'use client';

import { motion } from 'framer-motion';
import {
  Bot,
  ChevronRight,
  Crown,
  Flame,
  Gamepad2,
  Info,
  Shield,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

import { BOTS, type BotId, type BotProfile } from '@/lib/bots';
import type { GameRecord } from '@/lib/types';
import { Avatar } from './ui/Avatar';

interface LobbyProps {
  onStart: (botId: BotId, humanPlayer: 0 | 1) => void;
  records: Record<string, GameRecord>;
  humanPlayer: 0 | 1;
  onSelectSide: (side: 0 | 1) => void;
  totalGames: number;
}

/** Difficulty band per tier: 1-2 easy, 3-4 medium, 5-6 hard, 7 expert. */
function difficultyFor(tier: number): { label: string; icon: typeof Shield; tone: string } {
  if (tier <= 2) return { label: 'Easy', icon: Shield, tone: '#81b64c' };
  if (tier <= 4) return { label: 'Medium', icon: Target, tone: '#f7c631' };
  if (tier <= 6) return { label: 'Hard', icon: Flame, tone: '#fa412d' };
  return { label: 'Expert', icon: Crown, tone: '#a855f7' };
}

export default function Lobby({ onStart, records, humanPlayer, onSelectSide, totalGames }: LobbyProps) {
  return (
    <div className="min-h-dvh">
      <TopNav />

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-7 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand">
              <Swords size={14} /> Practice
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Play Bots</h1>
            <p className="mt-1.5 max-w-xl text-sm text-[#a8a49b]">
              Pick an opponent to sharpen your wall placement. Every bot validates its walls with
              BFS — nobody can trap you, and you cannot trap them.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-app-800 p-1.5">
            <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-[#8d8981]">
              Your side
            </span>
            <SideButton active={humanPlayer === 0} color="#81b64c" onClick={() => onSelectSide(0)}>
              Green · first
            </SideButton>
            <SideButton active={humanPlayer === 1} color="#fa412d" onClick={() => onSelectSide(1)}>
              Red · second
            </SideButton>
          </div>
        </motion.header>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {BOTS.map((bot, i) => (
              <BotCard
                key={bot.id}
                bot={bot}
                index={i}
                record={records[bot.id]}
                onPlay={() => onStart(bot.id, humanPlayer)}
              />
            ))}
          </div>

          <aside className="space-y-4 xl:col-start-3 xl:row-span-1">
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp size={15} className="text-brand" />
                <h2 className="text-sm font-bold text-white">Your record</h2>
              </div>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-white">{totalGames}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#8d8981]">
                  games played
                </span>
              </div>
              <div className="space-y-2.5">
                {BOTS.map((bot) => {
                  const rec = records[bot.id] ?? { wins: 0, losses: 0, bestAccuracy: 0 };
                  const played = rec.wins + rec.losses;
                  const rate = played ? Math.round((rec.wins / played) * 100) : 0;
                  return (
                    <div key={bot.id} className="flex items-center gap-2">
                      <span className="w-[76px] shrink-0 truncate text-[11px] font-semibold text-[#b7b3aa]">
                        {bot.name}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: bot.accent }}
                          initial={{ width: 0 }}
                          animate={{ width: `${rate}%` }}
                          transition={{ duration: 0.7, delay: 0.1 }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-[11px] font-bold tabular-nums text-[#8d8981]">
                        {rec.wins}W · {rec.losses}L
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <Info size={15} className="text-brand" />
                <h2 className="text-sm font-bold text-white">How to play</h2>
              </div>
              <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-[#a8a49b]">
                <li className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                  Reach the far side of the board. Green races up, red races down.
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                  You may jump over your opponent — diagonally if a wall blocks the straight jump.
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                  Walls span two edges. They can touch but never overlap or cross.
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                  A wall that seals off every path is rejected automatically.
                </li>
              </ul>
            </div>

            <div className="panel overflow-hidden">
              <div className="bg-gradient-to-br from-brand/20 to-transparent p-4">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand">
                  <Sparkles size={13} /> After the game
                </div>
                <p className="text-[12.5px] leading-relaxed text-[#c9c5bc]">
                  Run a full Game Review: accuracy scores, an evaluation graph, move
                  classifications and key moments — just like Chess.com.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function SideButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`focus-ring rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
        active ? 'text-[#121212]' : 'text-[#a8a49b] hover:bg-white/[0.06] hover:text-white'
      }`}
      style={active ? { background: color } : undefined}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function BotCard({
  bot,
  index,
  record,
  onPlay,
}: {
  bot: BotProfile;
  index: number;
  record?: GameRecord;
  onPlay: () => void;
}) {
  const meta = difficultyFor(bot.tier);
  const Icon = meta.icon;
  const played = (record?.wins ?? 0) + (record?.losses ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.06 * index }}
      whileHover={{ y: -4 }}
      className="group panel relative flex flex-col overflow-hidden"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
        style={{ background: `radial-gradient(60% 100% at 50% 0%, ${bot.accent}, transparent)` }}
      />

      <div className="relative flex items-start gap-3 p-4 pb-3">
        <Avatar emoji={bot.emoji} gradient={bot.gradient} size={52} ring={bot.accent} label={bot.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-extrabold text-white">{bot.name}</h3>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#8d8981]">
            <Users size={11} />
            <span className="tabular-nums">{bot.elo}</span>
            <span className="text-[#4b4a46]">•</span>
            <span className="uppercase tracking-wide">{meta.label}</span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="h-1 w-3 rounded-full transition-colors"
                style={{
                  background: i < bot.tier ? bot.accent : 'rgba(255,255,255,.1)',
                  opacity: i < bot.tier ? 1 : 0.5,
                }}
              />
            ))}
            <span className="ml-1 text-[9px] font-bold uppercase tracking-wider text-[#6f6b64]">
              Lv {bot.tier}
            </span>
          </div>
        </div>
        <div
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: `${meta.tone}1f`, color: meta.tone }}
        >
          <Icon size={15} />
        </div>
      </div>

      <p className="relative min-h-[52px] px-4 text-[12.5px] italic leading-relaxed text-[#b7b3aa]">
        “{bot.quote}”
      </p>

      <div className="relative flex flex-wrap gap-1.5 px-4 pb-3 pt-2">
        {bot.style.map((s) => (
          <span key={s} className="chip !px-2 !py-0.5 !text-[9.5px]">
            {s}
          </span>
        ))}
      </div>

      <div className="relative mt-auto">
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#6f6b64]">
          <span>{played > 0 ? `${record?.wins ?? 0}W · ${record?.losses ?? 0}L` : 'No games yet'}</span>
          <span className="flex items-center gap-1">
            <Crown size={10} /> best {record?.bestAccuracy ? `${record.bestAccuracy.toFixed(0)}%` : '—'}
          </span>
        </div>
        <button
          onClick={onPlay}
          className="btn-primary w-full !rounded-none !py-3 text-[13px] uppercase tracking-wide"
        >
          <Gamepad2 size={15} /> Play
          <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </motion.div>
  );
}

function TopNav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-white/[0.06] bg-app-900/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-[#12210a]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 3h2v18H4zM10 3h2v18h-2zM16 9h2v12h-2z" opacity=".9" />
              <circle cx="11" cy="6" r="2.4" />
            </svg>
          </div>
          <span className="text-[17px] font-extrabold tracking-tight text-white">
            Quoridor
          </span>
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          <NavLink active>
            <Swords size={14} /> Play
          </NavLink>
          <NavLink>
            <Bot size={14} /> Bots
          </NavLink>
          <NavLink>
            <TrendingUp size={14} /> Review
          </NavLink>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-[#6f6b64] sm:block">
            Local play
          </span>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#3c3a35] to-[#282724] ring-1 ring-white/15" />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={`flex cursor-default items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold ${
        active ? 'text-white' : 'text-[#8d8981]'
      }`}
    >
      {children}
    </span>
  );
}
