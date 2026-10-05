import { memo, useId } from "react";
import type { FlaskShape, NoteIcon } from "../lib/flasks/icon";
import type { CategoryColor } from "../lib/categories/palette";

// A magical "memory flask": a glass vessel with coloured liquid, a soft glow and a
// glass highlight. The note's icon (see lib/flasks/icon). Visual spec: six distinct
// silhouettes on a fixed 0 0 24 30 viewBox. Liquid + glow map to the category
// palette (`--cat-<color>-fg`) so a flask is theme-correct in light and dark; the
// cork and glass outline ride on `currentColor` (inherited), legible on any surface.
// Glow is a radialGradient fill (NOT a blur filter) so a long list stays cheap.

interface ShapeDef {
  /** Body outline — used twice: as the liquid clip AND the stroked glass. */
  d: string;
  /** Cork span [left, right] across the mouth. */
  mouth: [number, number];
  /** Half-width of the liquid surface at the fill line. */
  meniscusRx: number;
  /** Open-top vessel (beaker): no cork, plus a pour lip. */
  noCork?: boolean;
  lip?: string;
}

const SHAPES: Record<FlaskShape, ShapeDef> = {
  "round-bottom": {
    d: "M10 3 C10 10 10 11 8.5 12.5 C4.5 16 3 20 5 24 C7 27.5 9.5 28 12 28 C14.5 28 17 27.5 19 24 C21 20 19.5 16 15.5 12.5 C14 11 14 10 14 3 Z",
    mouth: [10, 14],
    meniscusRx: 6.5,
  },
  erlenmeyer: {
    d: "M9.5 3 L9.5 10 L4 25 C3.6 26.2 4.2 27 5.4 27 L18.6 27 C19.8 27 20.4 26.2 20 25 L14.5 10 L14.5 3 Z",
    mouth: [9.5, 14.5],
    meniscusRx: 4.2,
  },
  vial: {
    d: "M8 3 L8 23.5 C8 27 9.5 28 12 28 C14.5 28 16 27 16 23.5 L16 3 Z",
    mouth: [8, 16],
    meniscusRx: 3.8,
  },
  "potion-bottle": {
    d: "M9.5 3 L9.5 7 C9.5 9 5 9.5 5 13 L5 25 C5 27 6 27.5 7.5 27.5 L16.5 27.5 C18 27.5 19 27 19 25 L19 13 C19 9.5 14.5 9 14.5 7 L14.5 3 Z",
    mouth: [9.5, 14.5],
    meniscusRx: 6.8,
  },
  teardrop: {
    d: "M12 3 C12 3 6.5 11 5.5 16 C4.5 21.5 8 27 12 27 C16 27 19.5 21.5 18.5 16 C17.5 11 12 3 12 3 Z",
    mouth: [11, 13],
    meniscusRx: 6.3,
  },
  beaker: {
    d: "M5 7 L19 7 L19 25 C19 27 18 27.5 16 27.5 L8 27.5 C6 27.5 5 27 5 25 Z",
    mouth: [5, 19],
    meniscusRx: 7,
    noCork: true,
    lip: "M5 7 q-1.6 0.2 -2 2",
  },
};

/** Liquid fill line (viewBox units). Constant across shapes — the single knob if
 *  we later want fill-by-importance. ~lower 60%, leaving the neck empty. */
const LEVEL = 12;

interface FlaskProps {
  shape?: FlaskShape;
  color?: CategoryColor;
  /** Rendered px (width). Height follows the 24:30 ratio. */
  size?: number;
  className?: string;
  /** When set, the flask is the note's sole visual identity → role="img" + label.
   *  Omit inside a row that already shows the title (stays aria-hidden). */
  label?: string;
}

function FlaskBase({
  shape = "round-bottom",
  color = "blue",
  size = 16,
  className,
  label,
}: FlaskProps) {
  const uid = useId();
  const clipId = `clip-${uid}`;
  const liqId = `liq-${uid}`;
  const glowId = `glow-${uid}`;
  const s = SHAPES[shape];
  const detailed = size >= 20;
  const C = (a: number) => `hsl(var(--cat-${color}-fg) / ${a})`;
  const [mL, mR] = s.mouth;

  return (
    <svg
      width={size}
      height={(size * 30) / 24}
      viewBox="0 0 24 30"
      fill="none"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={s.d} />
        </clipPath>
        <linearGradient id={liqId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C(0.52)} />
          <stop offset="1" stopColor={C(0.78)} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="66%" r="60%">
          <stop offset="0" stopColor={C(detailed ? 0.38 : 0.3)} />
          <stop offset="1" stopColor={C(0)} />
        </radialGradient>
      </defs>

      {/* 1 · glow halo (compositor-cheap radial gradient, not a blur filter) */}
      <ellipse
        cx="12"
        cy="20"
        rx={detailed ? 11 : 9}
        ry={detailed ? 12 : 10}
        fill={`url(#${glowId})`}
      />

      {/* 2 · empty-glass tint */}
      <path d={s.d} fill={C(0.1)} />

      {/* 3-5 · liquid, meniscus, bubbles — clipped to the body */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y={LEVEL} width="24" height="30" fill={`url(#${liqId})`} />
        <ellipse cx="12" cy={LEVEL} rx={s.meniscusRx} ry="1.6" fill={C(0.9)} />
        {detailed && (
          <>
            <circle cx="10" cy="24" r="1.4" fill="#fff" opacity="0.5" />
            <circle cx="13.5" cy="21" r="1" fill="#fff" opacity="0.4" />
          </>
        )}
      </g>

      {/* 6 · glass outline (+ beaker pour lip) */}
      <path
        d={s.d}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.38"
        strokeWidth={detailed ? 1.25 : 1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {s.lip && (
        <path
          d={s.lip}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.38"
          strokeWidth={detailed ? 1.25 : 1}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* 7 · highlight streak (large only) */}
      {detailed && (
        <path
          d="M8 13 q-1.6 4 0.5 8"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.45"
          strokeWidth="1.25"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* 8 · cork / stopper (skipped for the open beaker) */}
      {!s.noCork && (
        <>
          <rect
            x={mL - 0.5}
            y="1"
            width={mR - mL + 1}
            height="5"
            rx="2"
            fill="currentColor"
            fillOpacity="0.45"
            stroke="currentColor"
            strokeOpacity="0.3"
            vectorEffect="non-scaling-stroke"
          />
          {detailed && (
            <rect x={mL - 0.5} y="2.5" width={mR - mL + 1} height="1.2" fill="#fff" fillOpacity="0.15" />
          )}
        </>
      )}
    </svg>
  );
}

/** Props are primitives, so memo keeps rows from re-rendering on unrelated updates. */
export const Flask = memo(FlaskBase);

/** Render a note's chosen icon, falling back to the default when none is set. */
export function FlaskFor({ icon, ...rest }: { icon?: NoteIcon } & Omit<FlaskProps, "shape" | "color">) {
  return <Flask shape={icon?.shape} color={icon?.color} {...rest} />;
}
