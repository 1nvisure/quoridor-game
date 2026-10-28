'use client';

import { CLASSIFICATIONS, type Classification } from '@/lib/review';

export function ClassificationBadge({
  classification,
  size = 'md',
  showLabel = true,
  loss,
}: {
  classification: Classification;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  loss?: number;
}) {
  const meta = CLASSIFICATIONS[classification];
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : size === 'lg' ? 'px-3 py-1.5 text-[13px]' : 'px-2 py-1 text-[11.5px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold ${pad}`}
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
      title={meta.description}
    >
      <span className="font-black leading-none">{meta.symbol}</span>
      {showLabel && <span>{meta.label}</span>}
      {loss !== undefined && loss > 0 && (
        <span className="font-bold opacity-80">−{loss.toFixed(0)}%</span>
      )}
    </span>
  );
}

export function ClassificationDot({ classification }: { classification: Classification }) {
  const meta = CLASSIFICATIONS[classification];
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: meta.color }}
      title={meta.label}
    />
  );
}

/** Row of per-classification counts, Chess.com style. */
export function ClassificationCounts({
  counts,
}: {
  counts: Record<Classification, number>;
}) {
  const order: Classification[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {order.map((c) => {
        const meta = CLASSIFICATIONS[c];
        const count = counts[c] ?? 0;
        return (
          <div
            key={c}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1"
            style={{ background: count > 0 ? meta.bg : 'rgba(255,255,255,.03)' }}
            title={`${count} ${meta.label.toLowerCase()}`}
          >
            <span
              className="grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-black"
              style={{ background: meta.color, color: '#15150f' }}
            >
              {meta.symbol}
            </span>
            <span
              className="text-[11.5px] font-bold tabular-nums"
              style={{ color: count > 0 ? meta.color : '#5d5a54' }}
            >
              {count}
            </span>
            <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-[#6f6b64]">
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
