// Play icon in the current text color. Media controls are not mirrored in RTL, so it always points right.

interface PlayTriangleProps {
  /** Width and height in pixels. */
  size?: number;
  /** Name for screen readers. Without it the icon is decorative and hidden from them. */
  label?: string;
  className?: string;
}

export function PlayTriangle({ size = 24, label, className = '' }: PlayTriangleProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d="M6 3.5v17L20.5 12z" />
    </svg>
  );
}
