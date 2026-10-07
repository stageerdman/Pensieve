// A tiny, dependency-free icon set (stroke, currentColor) — just the handful the
// chrome needs. Keeps the bundle lean and the look consistent. Add icons here as
// the single home for them.

interface IconProps {
  className?: string;
  size?: number;
}

function svg(path: React.ReactNode, { className, size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const MoreHorizontal = (p: IconProps) =>
  svg(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
    p,
  );

// Six-dot grip — the drag handle in the editor gutter (Notion-style).
export const GripVertical = (p: IconProps) =>
  svg(
    <>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const PanelRight = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </>,
    p,
  );

export const Clock = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>,
    p,
  );

export const X = (p: IconProps) =>
  svg(
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>,
    p,
  );

export const Trash = (p: IconProps) =>
  svg(
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>,
    p,
  );

export const Pin = ({ filled, ...p }: IconProps & { filled?: boolean }) =>
  svg(
    <path
      d="M12 17v5M9 10.5V4h6v6.5l2 3.5H7l2-3.5Z"
      fill={filled ? "currentColor" : "none"}
    />,
    p,
  );

export const ChevronDown = (p: IconProps) =>
  svg(<polyline points="6 9 12 15 18 9" />, p);

export const Plus = (p: IconProps) =>
  svg(
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
    p,
  );

export const Search = (p: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>,
    p,
  );

// The summon "sigil" — concentric rings + compass ticks. Slowly rotates while the
// summon bar is focused (see .summon-sigil in index.css). Matches the Summon concept.
export const Sigil = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" opacity={0.5} />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>,
    p,
  );

// A little "magic"/dissolve mark for the clear-all control.
export const Sparkles = (p: IconProps) =>
  svg(
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
    </>,
    p,
  );

// The sync "rune": one continuous figure-8 (lemniscate) curve drawn UNFINISHED —
// the dash hides one diagonal strand so the visible arc reads as an "S" at rest.
// When a sync is due/running, a seamless stroke-dashoffset flow runs the line around
// the full 8 — a moving infinity. Colour + motion are CSS, keyed by the button's
// data-state (see .sync-icon in index.css); `pathLength=1` makes the dash fractions
// exact. `slash` = disconnected.
export const SyncRune = ({ slash, size = 18, className }: IconProps & { slash?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <path
      className="lemniscate"
      pathLength={1}
      d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z"
    />
    {slash && (
      <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
    )}
  </svg>
);

export const Bookmark = ({ filled, ...p }: IconProps & { filled?: boolean }) =>
  svg(
    <path
      d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z"
      fill={filled ? "currentColor" : "none"}
    />,
    p,
  );
