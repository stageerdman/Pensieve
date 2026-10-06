import { useRef, type KeyboardEvent, type PointerEvent } from "react";

// A draggable colour spectrum for the flask: a rainbow bar with a thumb you drag (or
// arrow) to pick any hue 0..359. The chosen hue is stored on the note and resolved
// through the theme-paired `--flask-*` tokens, so the flask stays theme-correct and
// legible in light and dark without any raw hex. Keyboard: ←/→ (±3°), Shift for ±15°,
// Home/End to the ends. A proper ARIA slider.

interface HueSpectrumProps {
  hue: number; // 0..359
  onChange: (hue: number) => void;
  label?: string;
}

const SPECTRUM =
  "linear-gradient(to right," +
  "hsl(0 70% 50%),hsl(45 70% 47%),hsl(90 60% 42%),hsl(140 55% 40%)," +
  "hsl(190 60% 44%),hsl(230 60% 52%),hsl(270 55% 54%),hsl(310 60% 52%),hsl(359 70% 50%))";

export function HueSpectrum({ hue, onChange, label = "Colour" }: HueSpectrumProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(Math.round(t * 359));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unavailable — dragging still works while the cursor stays on the bar */
    }
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setFromClientX(e.clientX);
  };
  const stop = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
    else if (e.key === "Home") {
      e.preventDefault();
      onChange(0);
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(359);
      return;
    } else return;
    e.preventDefault();
    const step = e.shiftKey ? 15 : 3;
    onChange((((hue + delta * step) % 360) + 360) % 360);
  };

  return (
    <div
      ref={barRef}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={hue}
      aria-valuetext={`hue ${hue} degrees`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      className="relative h-5 w-full touch-none cursor-pointer rounded-full ring-1 ring-inset ring-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ background: SPECTRUM }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-[22px] w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/25"
        style={{ left: `${(hue / 359) * 100}%`, background: `hsl(${hue} var(--flask-s) var(--flask-l))` }}
      />
    </div>
  );
}
