// The Pensieve mark: a basin (the memory pool) with a single wisp of memory rising
// from it — the "Shelves" vision sigil. Theme-aware: the rim and wisp ride
// `currentColor` (so they read on any surface), while the pool glows in the accent.
// Used as the Home button in the tab bar. Decorative by default; pass a `label` to
// name it for assistive tech.

interface LogoProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Logo({ size = 20, className, label }: LogoProps) {
  const uid = `logo-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <radialGradient id={uid} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
          <stop offset="1" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="24" cy="30" rx="17" ry="9" fill={`url(#${uid})`} />
      <ellipse cx="24" cy="29" rx="17" ry="9" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.4" />
      <path
        d="M24 25 C 20 18, 30 14, 26 8 C 24 11, 22 9, 24 6"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
    </svg>
  );
}
