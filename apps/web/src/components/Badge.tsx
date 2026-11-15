import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'amber' | 'coral' | 'aurora' | 'mint' | 'violet';

// coral/aurora/mint/violet 在主题中是单值颜色（无色阶），用透明度修饰符区分边框
const TONES: Record<BadgeTone, string> = {
  neutral: 'border-space-200 bg-space-50 text-muted',
  amber: 'border-amber-300 bg-amber-50 text-amber-700',
  coral: 'border-ink bg-space-50 text-ink',
  aurora: 'border-aurora/50 bg-space-50 text-aurora',
  mint: 'border-mint/50 bg-space-50 text-mint',
  violet: 'border-violet/50 bg-space-50 text-violet',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export default function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
