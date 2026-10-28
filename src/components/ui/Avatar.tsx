'use client';

import { motion } from 'framer-motion';

export function Avatar({
  emoji,
  gradient,
  size = 44,
  ring,
  thinking = false,
  label,
}: {
  emoji: string;
  gradient: string;
  size?: number;
  ring?: string;
  thinking?: boolean;
  label?: string;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {thinking && (
        <motion.span
          className="absolute inset-0 rounded-xl"
          style={{ boxShadow: `0 0 0 2px ${ring ?? '#81b64c'}` }}
          animate={{ opacity: [0.75, 0.15, 0.75], scale: [1, 1.12, 1] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        className={`grid h-full w-full place-items-center overflow-hidden rounded-xl bg-gradient-to-br ${gradient} ring-1 ring-white/15`}
        aria-label={label}
      >
        <span style={{ fontSize: size * 0.46, lineHeight: 1 }}>{emoji}</span>
      </div>
    </div>
  );
}

export function HumanAvatar({ size = 44, name = 'You' }: { size?: number; name?: string }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#3c3a35] to-[#282724] ring-1 ring-white/15"
      style={{ width: size, height: size }}
      aria-label={name}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8.5" r="3.9" fill="#cfcabf" />
        <path d="M3.6 21c.9-4.2 4.2-6.4 8.4-6.4s7.5 2.2 8.4 6.4" fill="#cfcabf" />
      </svg>
    </div>
  );
}
