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

// The sync "rune": a calligraphic S whose stroke fades (tapers) toward both ends —
// a spell-mark, not a mechanical glyph. When `active`, a golden spark traces a
// figure-8 over it ("sync" fast while syncing, "nudge" slow when a sync is due).
// `slash` = disconnected. `reduced` drops the motion (prefers-reduced-motion).
export const SyncRune = ({
  slash,
  active,
  reduced,
  ...p
}: IconProps & { slash?: boolean; active?: "sync" | "nudge"; reduced?: boolean }) =>
  svg(
    <>
      <defs>
        <linearGradient id="syncTaper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="0.3" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.7" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <path
        d="M15.4 7.2 C15.4 4.9 8.6 4.9 8.6 8.3 C8.6 11.4 15.4 12.1 15.4 15.7 C15.4 19.1 8.6 19.1 8.6 16.8"
        fill="none"
        stroke="url(#syncTaper)"
        strokeWidth={2.3}
        strokeLinecap="round"
      />
      {active && !reduced && (
        <circle r={1.5} stroke="none" style={{ fill: "hsl(var(--gold))" }}>
          <animateMotion
            dur={active === "nudge" ? "3.4s" : "1.5s"}
            repeatCount="indefinite"
            path="M12 12 C15 9.4 15 4.8 12 4.8 C9 4.8 9 9.4 12 12 C15 14.6 15 19.2 12 19.2 C9 19.2 9 14.6 12 12 Z"
          />
        </circle>
      )}
      {slash && <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" />}
    </>,
    p,
  );

export const Bookmark = ({ filled, ...p }: IconProps & { filled?: boolean }) =>
  svg(
    <path
      d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z"
      fill={filled ? "currentColor" : "none"}
    />,
    p,
  );
