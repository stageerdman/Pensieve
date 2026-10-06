import { memo, useId } from "react";
import {
  DEFAULT_ICON,
  DEFAULT_VIBRANCY,
  DEFAULT_SHINE,
  NORMAL_FILL,
  fillForChars,
  iconVibrancy,
  iconShine,
  type FlaskShape,
  type NoteIcon,
} from "../lib/flasks/icon";
import type { CategoryColor } from "../lib/categories/palette";
import { memoryThread } from "../lib/flasks/thread";

// A magical "memory flask": a glass vessel with coloured liquid, a soft glow and a
// glass highlight. The note's icon (see lib/flasks/icon). Six distinct silhouettes
// on a fixed 0 0 24 30 viewBox. Liquid + glow map to the category palette
// (`--cat-<color>-fg`) so a flask is theme-correct; cork and glass outline ride on
// `currentColor`. Three expressive axes: COLOUR (hue) and user-picked VIBRANCY
// (liquid richness) + SHINE (glass gloss) — both anchored so 0.5 reproduces the
// original look — plus FILL, driven by the note's content (empty & colourless when
// title-only, normal at ~5k chars, brim-full beyond). Glow is a radial gradient (not
// a blur filter) so a long list stays cheap.

interface ShapeDef {
  d: string;
  mouth: [number, number];
  meniscusRx: number; // liquid-surface half-width at the normal fill line
  yFloor: number; // liquid surface when nearly empty (a shallow pool)
  yBrim: number; // liquid surface when brim-full (up in the neck)
  neckRx: number; // meniscus half-width once the liquid reaches the neck
  noCork?: boolean;
  lip?: string;
}

const SHAPES: Record<FlaskShape, ShapeDef> = {
  "round-bottom": {
    d: "M10 3 C10 10 10 11 8.5 12.5 C4.5 16 3 20 5 24 C7 27.5 9.5 28 12 28 C14.5 28 17 27.5 19 24 C21 20 19.5 16 15.5 12.5 C14 11 14 10 14 3 Z",
    mouth: [10, 14],
    meniscusRx: 6.5,
    yFloor: 25,
    yBrim: 7,
    neckRx: 1.8,
  },
  erlenmeyer: {
    d: "M9.5 3 L9.5 10 L4 25 C3.6 26.2 4.2 27 5.4 27 L18.6 27 C19.8 27 20.4 26.2 20 25 L14.5 10 L14.5 3 Z",
    mouth: [9.5, 14.5],
    meniscusRx: 4.2,
    yFloor: 25,
    yBrim: 7,
    neckRx: 2.3,
  },
  vial: {
    d: "M8 3 L8 23.5 C8 27 9.5 28 12 28 C14.5 28 16 27 16 23.5 L16 3 Z",
    mouth: [8, 16],
    meniscusRx: 3.8,
    yFloor: 25.5,
    yBrim: 5,
    neckRx: 3.8,
  },
  "potion-bottle": {
    d: "M9.5 3 L9.5 7 C9.5 9 5 9.5 5 13 L5 25 C5 27 6 27.5 7.5 27.5 L16.5 27.5 C18 27.5 19 27 19 25 L19 13 C19 9.5 14.5 9 14.5 7 L14.5 3 Z",
    mouth: [9.5, 14.5],
    meniscusRx: 6.8,
    yFloor: 25,
    yBrim: 8,
    neckRx: 2.3,
  },
  teardrop: {
    d: "M12 3 C12 3 6.5 11 5.5 16 C4.5 21.5 8 27 12 27 C16 27 19.5 21.5 18.5 16 C17.5 11 12 3 12 3 Z",
    mouth: [11, 13],
    meniscusRx: 6.3,
    yFloor: 24.5,
    yBrim: 11,
    neckRx: 3,
  },
  beaker: {
    d: "M5 7 L19 7 L19 25 C19 27 18 27.5 16 27.5 L8 27.5 C6 27.5 5 27 5 25 Z",
    mouth: [5, 19],
    meniscusRx: 7,
    yFloor: 25.5,
    yBrim: 8,
    neckRx: 7,
    noCork: true,
    lip: "M5 7 q-1.6 0.2 -2 2",
  },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const NORMAL_Y = 12; // liquid surface at the normal fill (today's look)

interface FlaskProps {
  shape?: FlaskShape;
  color?: CategoryColor;
  /** Liquid fraction 0..1. 0 = empty & colourless. Default = the normal look. */
  fill?: number;
  /** Liquid richness 0..1 (soft → vivid). 0.5 = original. */
  vibrancy?: number;
  /** Glass gloss 0..1 (matte → glossy). 0.5 = original. */
  shine?: number;
  /** Seed for the memory thread (the note's id) — its shape is derived from this. */
  seed?: string;
  size?: number;
  className?: string;
  label?: string;
}

function FlaskBase({
  shape = DEFAULT_ICON.shape,
  color = DEFAULT_ICON.color,
  fill = NORMAL_FILL,
  vibrancy = DEFAULT_VIBRANCY,
  shine = DEFAULT_SHINE,
  seed,
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
  const big = size >= 40;
  const C = (a: number) => `hsl(var(--cat-${color}-fg) / ${clamp01(a).toFixed(3)})`;
  const [mL, mR] = s.mouth;
  const sw = detailed ? 1.25 : 1;

  const f = clamp01(fill);
  const v = clamp01(vibrancy);
  const sh = clamp01(shine);
  // Coloured layers fade out as the flask empties; at fill 0 nothing coloured shows.
  const contentA = clamp01(f / 0.06);

  // Liquid surface + meniscus geometry for this fill.
  let level: number;
  let rx: number;
  let ry = 1.6;
  if (f <= NORMAL_FILL) {
    const t = f / NORMAL_FILL;
    level = lerp(s.yFloor, NORMAL_Y, t);
    rx = s.meniscusRx * (0.4 + 0.6 * t);
  } else {
    const t = (f - NORMAL_FILL) / (1 - NORMAL_FILL);
    level = lerp(NORMAL_Y, s.yBrim, t);
    rx = lerp(s.meniscusRx, s.neckRx, t);
    ry = 1.6 + 1.2 * t; // overfill cue: a brimming, domed meniscus
  }

  // Vibrancy = alpha only (hue/sat stay in the token → light/dark still switch).
  const topA = 0.3 + 0.44 * v;
  const botA = 0.48 + 0.6 * v;
  const menA = 0.55 + 0.7 * v;
  const glowA = (0.18 + 0.4 * v) * (detailed ? 1 : 0.79);
  const glassA = 0.06 + 0.08 * v;
  // Shine = glass gloss (all detailed-gated below).
  const corkA = 0.09 + 0.12 * sh;
  const menHiA = 0.5 * sh;

  // The memory thread: a white strand rising from the floor to the liquid surface, its
  // shape seeded by the note's id. Drawn only at detailed sizes and when there's liquid
  // (so the white reads against colour). See lib/flasks/thread.
  const thread = seed && detailed ? memoryThread({ seed, yTop: level, yBottom: 28 }) : null;

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
          <stop offset="0" stopColor={C(topA)} />
          <stop offset="1" stopColor={C(botA)} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="66%" r="60%">
          <stop offset="0" stopColor={C(glowA)} />
          <stop offset="1" stopColor={C(0)} />
        </radialGradient>
      </defs>

      {/* 1 · glow halo (fades out as the flask empties) */}
      {contentA > 0 && (
        <ellipse cx="12" cy="20" rx={detailed ? 11 : 9} ry={detailed ? 12 : 10} fill={`url(#${glowId})`} opacity={contentA} />
      )}

      {/* 2 · glass body tint: a faint neutral always, the category hue arrives with liquid */}
      <path d={s.d} fill="currentColor" fillOpacity={0.05} />
      {contentA > 0 && <path d={s.d} fill={C(glassA)} opacity={contentA} />}

      {/* 3-5 · liquid + meniscus (+ gloss crown, bubbles) — clipped to the body */}
      {contentA > 0 && (
        <g
          clipPath={`url(#${clipId})`}
          opacity={contentA}
          style={big ? { filter: `saturate(${1 + 0.5 * v})` } : undefined}
        >
          <rect x="0" y={level} width="24" height="30" fill={`url(#${liqId})`} />
          <ellipse cx="12" cy={level} rx={rx} ry={ry} fill={C(menA)} />
          {detailed && sh > 0.04 && (
            <ellipse cx="12" cy={level - 0.4} rx={rx * 0.7} ry="0.6" fill="#fff" opacity={menHiA} />
          )}
          {detailed && f >= 0.5 && (
            <>
              <circle cx="10" cy="24" r="1.4" fill="#fff" opacity={0.5} />
              <circle cx="13.5" cy="21" r="1" fill="#fff" opacity={0.4} />
            </>
          )}
        </g>
      )}

      {/* 6 · glass outline (+ beaker pour lip). Rim catches a touch more light with shine. */}
      <path
        d={s.d}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.38 + 0.1 * sh}
        strokeWidth={sw}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {s.lip && (
        <path
          d={s.lip}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.38 + 0.1 * sh}
          strokeWidth={sw}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* 7 · the memory thread — a white strand whose shape is the note's DNA (seeded by
          its id), clipped to the glass and rising with the liquid */}
      {thread && contentA > 0 && (
        <g clipPath={`url(#${clipId})`} opacity={contentA}>
          <path
            d={thread.d}
            fill="none"
            stroke="#fff"
            strokeOpacity={0.82}
            strokeWidth={thread.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}

      {/* 7b · a small specular glint, scaled by shine (large only) */}
      {size >= 28 && sh > 0.4 && (
        <ellipse cx="9" cy="14" rx="1.2" ry="2.6" fill="#fff" opacity={0.6 * sh} transform="rotate(-18 9 14)" />
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
            <rect x={mL - 0.5} y="2.5" width={mR - mL + 1} height="1.2" fill="#fff" fillOpacity={corkA} />
          )}
        </>
      )}
    </svg>
  );
}

/** Props are primitives, so memo keeps rows from re-rendering on unrelated updates. */
export const Flask = memo(FlaskBase);

/** Render a note's icon, falling back to DEFAULT_ICON when none is set — so the row,
 *  header, mentions and relationships all show the same default flask. Pass `chars`
 *  (the note's content length) to drive the fill level; omit it for a normal-fill
 *  style preview (e.g. the picker). */
export function FlaskFor({
  icon,
  chars,
  ...rest
}: { icon?: NoteIcon; chars?: number } & Omit<FlaskProps, "shape" | "color" | "vibrancy" | "shine" | "fill">) {
  const resolved = icon ?? DEFAULT_ICON;
  return (
    <Flask
      shape={resolved.shape}
      color={resolved.color}
      vibrancy={iconVibrancy(resolved)}
      shine={iconShine(resolved)}
      fill={chars === undefined ? undefined : fillForChars(chars)}
      {...rest}
    />
  );
}
