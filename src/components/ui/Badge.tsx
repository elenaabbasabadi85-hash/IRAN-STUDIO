import type { HTMLAttributes } from 'react';
import type { StepStatus } from '@/core/types';
import fa from '@/i18n/fa.json';
import { RecDot } from './RecDot';

export type BadgeTone = 'neutral' | 'outline' | 'solid' | 'live';

// Tones that need a dark background bring navy with them, so a badge keeps its contrast
// on navy and on a denim Surface alike.
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-navy text-concrete ring-1 ring-concrete ring-inset',
  outline: 'text-cream ring-1 ring-cream ring-inset',
  solid: 'bg-cream text-navy',
  live: 'bg-navy text-live-red ring-1 ring-live-red ring-inset',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className = '', ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-0.5 text-caption ${toneClasses[tone]} ${className}`}
      {...rest}
    />
  );
}

export const statusTone: Record<StepStatus, BadgeTone> = {
  empty: 'neutral',
  working: 'live',
  ready: 'outline',
  approved: 'solid',
};

// The status of one project step; "working" shows a blinking REC dot.
export function StatusBadge({ status, className }: { status: StepStatus; className?: string }) {
  return (
    <Badge tone={statusTone[status]} className={className}>
      <span className="sr-only">{fa.status.label} </span>
      {status === 'working' && <RecDot blinking size="sm" />}
      {fa.status[status]}
    </Badge>
  );
}
