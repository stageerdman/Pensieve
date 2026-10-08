// The sync panel's progress visual: a memory flask that FILLS as the backup
// progresses — the app's flask motif (the round-bottom/Florence silhouette, same
// as the logo mark) rather than a generic percentage bar. One accent colour, flat
// (no gradient), with a single living meniscus ripple so it reads as alive while a
// transfer is in flight. Honours prefers-reduced-motion (the ripple drops; the fill
// level still shows). See design.md — magic lives in restraint.

// Round-bottom silhouette, shared with components/Flask (viewBox 0 0 24 30).
const SILHOUETTE =
  "M10 3 C10 10 10 11 8.5 12.5 C4.5 16 3 20 5 24 C7 27.5 9.5 28 12 28 C14.5 28 17 27.5 19 24 C21 20 19.5 16 15.5 12.5 C14 11 14 10 14 3 Z";
const Y_BRIM = 7; // liquid top when full
const Y_FLOOR = 25; // liquid top when empty

export function SyncFlask({
  level,
  active = true,
  className = "h-5 w-4",
}: {
  level: number; // 0..1 fill fraction
  active?: boolean; // ripple only while a transfer is in flight
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, level));
  // Reveal only the bottom `level` of the liquid by sliding the full column down.
  const drop = (1 - clamped) * (Y_FLOOR - Y_BRIM);
  const clipId = "sync-flask-clip";

  return (
    <svg
      viewBox="0 0 24 30"
      className={`sync-flask ${active ? "is-active" : ""} ${className}`}
      aria-hidden
      fill="none"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SILHOUETTE} />
        </clipPath>
      </defs>
      {/* glass: faint body + outline, inherits the parent's muted text colour */}
      <path d={SILHOUETTE} fill="currentColor" fillOpacity={0.06} />
      <g clipPath={`url(#${clipId})`}>
        {/* the ripple group (CSS animation) wraps the level group (inline transition) */}
        <g className="ripple">
          <rect
            className="liquid"
            x="0"
            y={Y_BRIM}
            width="24"
            height={30 - Y_BRIM}
            style={{ transform: `translateY(${drop}px)`, transition: "transform 0.45s ease" }}
          />
        </g>
      </g>
      <path
        d={SILHOUETTE}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeOpacity={0.55}
      />
    </svg>
  );
}
