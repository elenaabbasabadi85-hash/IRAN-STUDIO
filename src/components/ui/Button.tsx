import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import fa from '@/i18n/fa.json';
import { focusRing } from './focus';

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

// --cut-size sets the primary's cut; the angle (33deg) comes from tokens.css.
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 gap-2 px-4 text-caption [--cut-size:0.625rem]',
  md: 'min-h-11 gap-2.5 px-5 text-body [--cut-size:0.75rem]',
  lg: 'min-h-14 gap-3 px-7 text-h3 [--cut-size:1rem]',
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'text-cream',
  secondary: 'text-cream ring-1 ring-cream ring-inset',
  ghost: 'text-cream',
};

// Hover on an enabled button: the primary's cut grows, the others get a light fill.
const hoverClasses: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    sm: 'hover:[--cut-size:0.875rem]',
    md: 'hover:[--cut-size:1.125rem]',
    lg: 'hover:[--cut-size:1.5rem]',
  },
  secondary: { sm: 'hover:bg-cream/10', md: 'hover:bg-cream/10', lg: 'hover:bg-cream/10' },
  ghost: { sm: 'hover:bg-cream/10', md: 'hover:bg-cream/10', lg: 'hover:bg-cream/10' },
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
    'relative isolate inline-flex shrink-0 items-center justify-center font-bold whitespace-nowrap transition-colors select-none',
    focusRing,
    sizeClasses[size],
    variantClasses[variant],
    inactive ? '' : `${hoverClasses[variant][size]} active:translate-y-px`,
    disabled ? 'cursor-not-allowed opacity-50' : '',
    loading ? 'cursor-progress' : '',
    className,
  ].join(' ');

  const content = (
    <>
      {variant === 'primary' && (
        // The red is a layer of its own so the cut does not clip the focus outline.
        <span
          aria-hidden="true"
          className="cut-diagonal absolute inset-0 -z-10 bg-primary transition-[clip-path] motion-reduce:transition-none"
        />
      )}
      {loading && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current motion-safe:animate-rec" />}
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
