// Timecode formatting for the audio player — pure, framework-free (shared by the desktop
// player today and portable to the phone capture app per the decouple convention).
// Monospace tabular digits in the UI keep these from jittering as they tick.

/** Format seconds as `m:ss` (or `h:mm:ss` past an hour). NaN/negative → "0:00". */
export function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}
