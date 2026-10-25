// The live-red REC dot. Live red is only for navy backgrounds (4.50 there, 2.34 on denim).

const sizeClasses = {
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3.5',
} as const;

interface RecDotProps {
  /** Blinks to show that something is working. Stays still under prefers-reduced-motion. */
  blinking?: boolean;
  size?: keyof typeof sizeClasses;
  /** Name for screen readers. Without it the dot is decorative and hidden from them. */
  label?: string;
  className?: string;
}

export function RecDot({ blinking = false, size = 'md', label, className = '' }: RecDotProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 rounded-full bg-live-red ${sizeClasses[size]} ${blinking ? 'motion-safe:animate-rec' : ''} ${className}`}
    />
  );
}
