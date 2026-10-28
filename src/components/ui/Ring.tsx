'use client';

import { motion } from 'framer-motion';

export function Ring({
  value,
  size = 120,
  stroke = 9,
  color = '#81b64c',
  track = 'rgba(255,255,255,.09)',
  label,
  sublabel,
  animate = true,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
  animate?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c - (clamped / 100) * c;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={animate ? { strokeDashoffset: c } : false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div
            className="font-extrabold leading-none text-white"
            style={{
              fontSize: size * ((label ?? '').length > 4 ? 0.175 : 0.235),
              letterSpacing: '-0.02em',
            }}
          >
            {label ?? `${Math.round(clamped)}`}
          </div>
          {sublabel && (
            <div
              className="mt-1 font-semibold uppercase tracking-wider text-[#8d8981]"
              style={{ fontSize: Math.max(8, size * 0.085) }}
            >
              {sublabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Horizontal accuracy meter used in the review header. */
export function AccuracyBar({
  value,
  color,
  label,
  name,
}: {
  value: number;
  color: string;
  label: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold text-[#b7b3aa]">{name}</span>
          <span className="text-xs font-bold" style={{ color }}>
            {value.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#6f6b64]">
          {label}
        </div>
      </div>
    </div>
  );
}
