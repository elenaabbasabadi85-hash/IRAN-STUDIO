import type { HTMLAttributes } from 'react';

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
  /** Cuts the bottom corner at the brand angle, like the primary button. */
  cut?: boolean;
}

// A denim card. Concrete fails on denim, so text-muted inside it switches to a cream tint.
// Live red fails on denim too: put REC dots and red text inside a navy element (see Badge).
export function Surface({ as: Tag = 'div', cut = false, className = '', ...rest }: SurfaceProps) {
  return (
    <Tag
      className={`bg-surface p-5 text-foreground [--ui-text-muted:var(--ui-surface-text-muted)] sm:p-6 ${cut ? 'cut-diagonal' : ''} ${className}`}
      {...rest}
    />
  );
}
