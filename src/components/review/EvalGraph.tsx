'use client';

import { motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';

import type { EvalGraphPoint } from '@/lib/review';

// The viewBox matches the real rendered width (~340px in the review sidebar) so
// the axis labels stay legible instead of being scaled down to ~5px.
const W = 360;
const H = 150;
const PAD = { top: 10, right: 8, bottom: 16, left: 8 };

/**
 * Win-probability graph. Green above the 50% midline means the human is ahead,
 * red below means the opponent is. Click / drag anywhere to scrub the game.
 */
export default function EvalGraph({
  points,
  current,
  onSelect,
}: {
  points: EvalGraphPoint[];
  current: number;
  onSelect: (ply: number) => void;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = Math.max(points.length - 1, 1);
  const x = (i: number) => PAD.left + (i / n) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);

  const { line, area } = useMemo(() => {
    if (points.length === 0) return { line: '', area: '' };
    const pts = points.map((p, i) => `${x(i)},${y(p.value)}`);
    const line = `M ${pts.join(' L ')}`;
    const area = `${line} L ${x(points.length - 1)},${y(50)} L ${x(0)},${y(50)} Z`;
    return { line, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const clampIndex = (i: number) => Math.max(0, Math.min(points.length - 1, i));

  const indexFromEvent = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const t = (clientX - rect.left) / rect.width;
    return clampIndex(Math.round(t * n));
  };

  const activeIndex = clampIndex(hover ?? current);
  const active = points[activeIndex];
  const currentX = x(clampIndex(current));

  if (points.length === 0) {
    return <div className="grid h-36 place-items-center text-xs text-[#6f6b64]">No evaluation data</div>;
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={(e) => setHover(indexFromEvent(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => onSelect(indexFromEvent(e.clientX))}
        role="slider"
        aria-label="Evaluation graph"
        aria-valuenow={points[clampIndex(current)]?.value ?? 50}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSelect(clampIndex(current + 1));
          if (e.key === 'ArrowLeft') onSelect(clampIndex(current - 1));
        }}
      >
        <defs>
          <linearGradient id="evalGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#81b64c" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#81b64c" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="evalRed" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fa412d" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fa412d" stopOpacity="0.04" />
          </linearGradient>
          <clipPath id="above50">
            <rect x="0" y="0" width={W} height={y(50)} />
          </clipPath>
          <clipPath id="below50">
            <rect x="0" y={y(50)} width={W} height={H - y(50)} />
          </clipPath>
        </defs>

        {/* grid */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="#ffffff"
              strokeOpacity={v === 50 ? 0.22 : 0.07}
              strokeWidth={v === 50 ? 1.2 : 1}
              strokeDasharray={v === 50 ? '0' : '3 4'}
            />
            {(v === 100 || v === 50 || v === 0) && (
              <text
                x={PAD.left + 2}
                y={y(v) + (v === 100 ? 9 : v === 0 ? -3 : -3)}
                fontSize="9.5"
                fill="#6f6b64"
                fontWeight="700"
              >
                {v}%
              </text>
            )}
          </g>
        ))}

        <path d={area} fill="url(#evalGreen)" clipPath="url(#above50)" />
        <path d={area} fill="url(#evalRed)" clipPath="url(#below50)" />

        <path
          d={line}
          fill="none"
          stroke="#cfcabf"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* current ply marker */}
        <line
          x1={currentX}
          x2={currentX}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="#81b64c"
          strokeOpacity="0.55"
          strokeWidth={1.5}
        />

        {points.map((p, i) => {
          const isCurrent = i === clampIndex(current);
          const isHover = hover === i;
          if (!isCurrent && !isHover) return null;
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={isCurrent ? 4.5 : 3.5}
              fill={p.value >= 50 ? '#81b64c' : '#fa412d'}
              stroke="#121212"
              strokeWidth={1.6}
            />
          );
        })}

        {/* move-number ticks */}
        {ticks(points.length).map((i) => (
          <text key={i} x={x(i)} y={H - 4} fontSize="9" fill="#5d5a54" textAnchor="middle" fontWeight="700">
            {Math.ceil(i / 2)}
          </text>
        ))}
      </svg>

      {/* tooltip */}
      {active && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none absolute top-0 rounded-md border border-white/10 bg-app-900/95 px-2 py-1 text-[10px] font-bold text-[#e9e6df] shadow-lg backdrop-blur"
          style={{
            left: `calc(${((x(activeIndex) - PAD.left) / (W - PAD.left - PAD.right)) * 100}% )`,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="text-[#8d8981]">#{activeIndex}</span>{' '}
          <span style={{ color: active.value >= 50 ? '#9bd15f' : '#ff8e7f' }}>
            {active.value.toFixed(1)}%
          </span>
        </motion.div>
      )}
    </div>
  );
}

function ticks(length: number): number[] {
  if (length <= 2) return [0, length - 1];
  const step = Math.max(1, Math.ceil((length - 1) / 8));
  const out: number[] = [];
  for (let i = 0; i < length; i += step) out.push(i);
  if (out[out.length - 1] !== length - 1) out.push(length - 1);
  return out;
}
