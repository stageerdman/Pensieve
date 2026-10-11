// constants.ts — The Wand's locked tunables, ported verbatim.
//
// Source: updates/2026-10-08 PHONE-UX - OPEN/concepts/01-the-wand-v2.html
//   - wheel CFG object: ~lines 1044-1065
//   - loupe/reel consts: ~lines 646-650, 735-737
//
// These are hand-tuned feel values, not derived math — never "round them off" or
// re-approximate. If a number here needs to change, change it here AND re-verify
// against the source/on-device feel, never drift them apart.

/* ---- Thumb-wheel geometry + rotation spring (source ~1045, 1047, 1049) ---- */

/** Degrees of arc between adjacent buttons. */
export const STEP_DEG = 31;
/** The arc's centre direction, in degrees (0 = along +x). */
export const CENTER_R = 150;
/** Buttons farther than this many detents from centre are hidden while expanded. */
export const MAX_VIS = 2.25;
/** Minimum arc radius (px), clamped from the stored user preference. */
export const R_MIN = 118;
/** Maximum arc radius (px), clamped from the stored user preference. */
export const R_MAX = 300;
/** Duration (ms) of the side-flip (left/right hand) animation. */
export const FLIP_MS = 2000;
/** Press-and-hold duration (ms) before a long-press fires. */
export const HOLD_MS = 420;
/** Total finger rotation (deg) under which a gesture counts as a tap, not a swing. */
export const TAP_DEG = 4;

/** Velocity decay rate (exponential, per second) applied to the rotation spring. */
export const FRICTION = 3.0;
/** Rotation spring stiffness (k). */
export const STIFFNESS = 115;
/** Rotation spring damping ratio — 1.0 = critically damped (no overshoot). */
export const DAMPING = 1.0;
/** Hard clamp (detents/sec) on the rotation velocity carried out of a fling release. */
export const MAX_VEL = 30;
/** Rotation spring is "at rest" below this velocity (detents/sec). */
export const REST_V = 0.02;
/** Rotation spring is "at rest" below this distance-to-target (detents). */
export const REST_X = 0.004;

/* ---- Collapse / expand "gravity well" spring (source ~1057-1064) ---- */

/** Resting radius (px) of the lone wand from the corner pivot once fully collapsed. */
export const COLLAPSE_R = 64;
/** Finger radial travel (px) that maps to a full 0→1 collapse drag. */
export const COLLAPSE_SPAN = 150;
/** Radial/tangential travel (px) before a drag commits to rotate vs. collapse mode. */
export const PEND_PX = 8;
/** Radial travel (px) that triggers the suck-in/-out as a short flick. */
export const FLICK_DIST = 34;
/** Radial speed (px/s) that triggers the suck-in/-out by momentum alone. */
export const FLICK_VEL = 520;
/** Collapse spring stiffness (k). */
export const COLLAPSE_STIFF = 150;
/** Collapse spring damping ratio — <1 → a slight overshoot before settling. */
export const COLLAPSE_DAMP = 0.6;
/** Collapse spring is "at rest" below this velocity. */
export const COL_REST_V = 0.02;
/** Collapse spring is "at rest" below this distance-to-target. */
export const COL_REST_X = 0.004;

/* ---- The reel + loupe fisheye (source ~646, 650, 735-737) ---- */

/** Height (px) of one reel slot — read from the `--slot` CSS var in the original,
 *  hard-coded here as its fallback/actual value. */
export const SLOT_H = 84;
/** Fraction down the reel where the focal line sits (room above for the parted
 *  upper neighbour + the glass rim). */
export const FOCAL_FRAC = 0.42;
/** Height (px) of the magnifying glass overlay — roughly one magnified row tall. */
export const GLASS_H = 150;
/** Loupe influence radius, in slots (±R react). */
export const LOUPE_R = 2.0;
/** Focal magnification at the centre of the loupe (full-motion). */
export const LOUPE_MAX = 1.75;
/** Focal magnification at the centre of the loupe under `prefers-reduced-motion`
 *  (source ~736: `reduce ? 1.5 : 1.75`). Not used by default; kept for parity. */
export const LOUPE_MAX_REDUCED = 1.5;
/** Hann weight above which a card's snippet begins to bloom in. */
export const REVEAL_IN = 0.55;
