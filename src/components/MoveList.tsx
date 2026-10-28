'use client';

import { useEffect, useRef } from 'react';

import { type Move, cellName, wallName } from '@/lib/engine';

export function moveText(m: Move): string {
  return m.type === 'pawn' ? cellName(m.to) : `${wallName(m.wall)}`;
}

export function MoveIcon({ move, color }: { move: Move; color: string }) {
  if (move.type === 'pawn') {
    return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
  }
  return (
    <span
      className="inline-block h-2.5 w-[3px] rounded-[1px]"
      style={{ background: color }}
    />
  );
}

export interface MoveColumnEntry {
  move: Move;
  player: 0 | 1;
  label?: string;
  badge?: { symbol: string; color: string; bg: string };
  active?: boolean;
}

export default function MoveList({
  entries,
  onSelect,
  compact = false,
}: {
  entries: MoveColumnEntry[];
  onSelect?: (index: number) => void;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // jsdom and a few older engines lack Element.scrollTo — never crash a game over it.
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  const rows: Array<{ num: number; green?: MoveColumnEntry & { i: number }; red?: MoveColumnEntry & { i: number } }> = [];
  entries.forEach((e, i) => {
    const num = Math.floor(i / 2) + 1;
    let row = rows.find((r) => r.num === num);
    if (!row) {
      row = { num };
      rows.push(row);
    }
    if (e.player === 0) row.green = { ...e, i };
    else row.red = { ...e, i };
  });

  return (
    <div
      ref={scrollRef}
      className={`overflow-y-auto ${compact ? 'max-h-[190px]' : 'max-h-[340px]'}`}
    >
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-app-750/95 backdrop-blur">
          <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6f6b64]">
            <th className="w-8 py-1.5 pl-3 text-left font-bold">#</th>
            <th className="py-1.5 text-left font-bold">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-pawn-green" /> Green
              </span>
            </th>
            <th className="py-1.5 text-left font-bold">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-pawn-red" /> Red
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.num} className="group border-t border-white/[0.04]">
              <td className="py-1 pl-3 align-middle text-[11px] font-semibold tabular-nums text-[#6f6b64]">
                {row.num}
              </td>
              <MoveCell entry={row.green} onSelect={onSelect} color="#81b64c" />
              <MoveCell entry={row.red} onSelect={onSelect} color="#fa412d" />
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-[11.5px] text-[#6f6b64]">
                No moves yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MoveCell({
  entry,
  onSelect,
  color,
}: {
  entry?: MoveColumnEntry & { i: number };
  onSelect?: (index: number) => void;
  color: string;
}) {
  if (!entry) return <td className="py-1" />;

  return (
    <td className="py-1 pr-2">
      <button
        disabled={!onSelect}
        onClick={() => onSelect?.(entry.i)}
        className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-semibold transition-colors ${
          entry.active
            ? 'bg-white/[0.13] text-white'
            : 'text-[#c9c5bc] hover:bg-white/[0.06]'
        } ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <MoveIcon move={entry.move} color={color} />
        <span className="tabular-nums">{moveText(entry.move)}</span>
        {entry.badge && (
          <span
            className="ml-auto rounded px-1 text-[10px] font-black leading-4"
            style={{ background: entry.badge.bg, color: entry.badge.color }}
          >
            {entry.badge.symbol}
          </span>
        )}
      </button>
    </td>
  );
}
