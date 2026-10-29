import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import fa from '@/i18n/fa.json';
import { focusRing } from './focus';
import { PlayTriangle } from './PlayTriangle';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface OwnProps {
  /** Primary is the one red action of a page: use it at most once per page. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a working dot; the button keeps focus but ignores clicks until loading ends. */
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

type AsButton = OwnProps & Omit<ComponentPropsWithoutRef<'button'>, keyof OwnProps> & { href?: undefined };
type AsLink = OwnProps & Omit<ComponentPropsWithoutRef<typeof Link>, keyof OwnProps>;

export type ButtonProps = AsButton | AsLink;

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 gap-2 px-4 text-caption',
  md: 'min-h-11 gap-2.5 px-5 text-body',
  lg: 'min-h-14 gap-3 px-7 text-h3',
};

// The primary's slanted left edge takes about a fifth of its height, so the text gets that much more room there.
const primaryEndPadding: Record<ButtonSize, string> = { sm: 'pe-6', md: 'pe-7', lg: 'pe-10' };

const playSize: Record<ButtonSize, number> = { sm: 11, md: 13, lg: 16 };

// Like the brand guide: the primary is red with a slanted left edge (angle from tokens.css)
// and a play triangle; the secondary has a cream outline.
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'cut-edge text-cream',
  secondary: 'text-cream ring-2 ring-cream ring-inset',
  ghost: 'text-cream',
};

const hoverClasses: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'hover:bg-cream/10',
  ghost: 'hover:bg-cream/10',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  const classes = [
    'group relative isolate inline-flex shrink-0 items-center justify-center font-bold whitespace-nowrap transition-colors select-none',
    focusRing,
    sizeClasses[size],
    variant === 'primary' ? primaryEndPadding[size] : '',
    variantClasses[variant],
    inactive ? '' : `${hoverClasses[variant]} active:translate-y-px`,
    disabled ? 'cursor-not-allowed opacity-50' : '',
    loading ? 'cursor-progress' : '',
    className,
  ].join(' ');

  const content = (
    <>
      {variant === 'primary' && (
        // On hover the red dims a little over the navy behind it; the shape never changes.
        <span
          aria-hidden="true"
          className={`cut-fill bg-primary transition-opacity motion-reduce:transition-none ${inactive ? '' : 'group-hover:opacity-85'}`}
        />
      )}
      {loading ? (
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current motion-safe:animate-rec" />
      ) : (
        variant === 'primary' && <PlayTriangle size={playSize[size]} />
      )}
      {children}
      {loading && <span className="sr-only">{fa.ui.loading}</span>}
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...linkProps } = rest;
    if (inactive) {
      // A link has no disabled state; without href it is neither focusable nor followed.
      return (
        <a role="link" aria-disabled="true" aria-busy={loading || undefined} className={classes}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} {...linkProps}>
        {content}
      </Link>
    );
  }

  // While loading the button stays focusable (aria-disabled, not disabled) so keyboard focus
  // is not lost; it drops its click handler and stops submitting forms.
  const { type = 'button', onClick, ...buttonProps } = rest;
  return (
    <button
      type={loading ? 'button' : type}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={classes}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
