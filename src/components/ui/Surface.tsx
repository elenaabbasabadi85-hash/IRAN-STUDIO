import type { HTMLAttributes } from 'react';

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside' | 'li';
  /**
   * Slants the left edge at the brand angle, like the primary button. A cut surface clips
   * whatever overflows it, focus outlines of children near its edges included.
   */
  cut?: boolean;
}

// A denim card. Concrete fails on denim, so text-muted inside it switches to a cream tint.
// Live red fails on denim too: put REC dots and red text inside a navy element (see Badge).
export function Surface({ as: Tag = 'div', cut = false, className = '', children, ...rest }: SurfaceProps) {
  return (
    <Tag
      className={`p-5 text-foreground [--ui-text-muted:var(--ui-surface-text-muted)] sm:p-6 ${cut ? 'cut-edge pe-14 sm:pe-14' : 'bg-surface'} ${className}`}
      {...rest}
    >
      {cut && <span aria-hidden="true" className="cut-fill bg-surface" />}
      {children}
    </Tag>
  );
}
