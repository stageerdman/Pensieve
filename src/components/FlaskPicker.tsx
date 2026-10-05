import { useEffect, useRef, useState } from "react";
import {
  FLASK_SHAPES,
  SHAPE_LABELS,
  DEFAULT_ICON,
  iconVibrancy,
  iconShine,
  type FlaskShape,
  type NoteIcon,
} from "../lib/flasks/icon";
import { CATEGORY_COLORS, catFg, type CategoryColor } from "../lib/categories/palette";
import { Flask } from "./Flask";

/** The five discrete steps for the vibrancy / shine taste knobs. */
const STEPS = [0, 0.25, 0.5, 0.75, 1];
const stepIndex = (value: number) => {
  let best = 0;
  for (let i = 1; i < STEPS.length; i++) {
    if (Math.abs(STEPS[i] - value) < Math.abs(STEPS[best] - value)) best = i;
  }
  return best;
};

// The popover body of the flask picker: one calm panel with a live preview, a grid
// of six shape silhouettes, and the nine palette colours. Shape and colour are set
// independently (either can change first); each change commits via onChange so the
// result forms live. Both grids are roving-tabindex radiogroups — arrows move focus,
// Enter/Space/click commit (so arrowing never thrashes the disk). Esc / outside-click
// are handled by the hosting FlaskButton.

interface FlaskPickerProps {
  icon?: NoteIcon;
  onChange: (icon: NoteIcon) => void;
}

/** Move focus within a single-row grid of refs, clamped to the ends. */
function step(
  refs: (HTMLButtonElement | null)[],
  from: number,
  key: string,
  count: number,
): number {
  let to = from;
  if (key === "ArrowRight" || key === "ArrowDown") to = Math.min(count - 1, from + 1);
  else if (key === "ArrowLeft" || key === "ArrowUp") to = Math.max(0, from - 1);
  else if (key === "Home") to = 0;
  else if (key === "End") to = count - 1;
  else return from;
  refs[to]?.focus();
  return to;
}

export function FlaskPicker({ icon, onChange }: FlaskPickerProps) {
  const current = icon ?? DEFAULT_ICON;
  const curVib = iconVibrancy(current);
  const curShine = iconShine(current);
  const shapeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const colorRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const vibRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Roving focus index per group (independent of the committed value).
  const [shapeFocus, setShapeFocus] = useState(() =>
    Math.max(0, FLASK_SHAPES.indexOf(current.shape)),
  );
  const [colorFocus, setColorFocus] = useState(() =>
    Math.max(0, CATEGORY_COLORS.indexOf(current.color)),
  );
  const [vibFocus, setVibFocus] = useState(() => stepIndex(curVib));
  const [shineFocus, setShineFocus] = useState(() => stepIndex(curShine));

  // Open with focus on the selected shape (standard dialog behaviour).
  useEffect(() => {
    shapeRefs.current[shapeFocus]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickShape = (shape: FlaskShape) => onChange({ ...current, shape });
  const pickColor = (color: CategoryColor) => onChange({ ...current, color });
  const pickVibrancy = (vibrancy: number) => onChange({ ...current, vibrancy });
  const pickShine = (shine: number) => onChange({ ...current, shine });

  return (
    <div role="dialog" aria-label="Choose flask" className="w-[264px] p-2">
      {/* Live preview — the composed result, large */}
      <div
        className="mb-2 flex items-center justify-center rounded-md bg-surface py-3"
        aria-live="polite"
        aria-label={`Flask: ${SHAPE_LABELS[current.shape]}, ${current.color}, vibrancy ${vibFocus + 1} of 5, shine ${shineFocus + 1} of 5`}
      >
        <Flask
          shape={current.shape}
          color={current.color}
          vibrancy={curVib}
          shine={curShine}
          size={52}
          className="text-text"
        />
      </div>

      {/* Shape */}
      <p className="px-0.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted/70">
        Shape
      </p>
      <div role="radiogroup" aria-label="Shape" className="grid grid-cols-6 gap-1">
        {FLASK_SHAPES.map((shape, i) => {
          const selected = shape === current.shape;
          return (
            <button
              key={shape}
              ref={(el) => (shapeRefs.current[i] = el)}
              role="radio"
              aria-checked={selected}
              aria-label={SHAPE_LABELS[shape]}
              title={SHAPE_LABELS[shape]}
              tabIndex={i === shapeFocus ? 0 : -1}
              onClick={() => pickShape(shape)}
              onFocus={() => setShapeFocus(i)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  pickShape(shape);
                } else {
                  const to = step(shapeRefs.current, i, e.key, FLASK_SHAPES.length);
                  if (to !== i) {
                    e.preventDefault();
                    setShapeFocus(to);
                  }
                }
              }}
              className={
                "flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface " +
                (selected ? "bg-surface text-text ring-2 ring-accent" : "text-text-muted")
              }
            >
              <Flask shape={shape} color={selected ? current.color : "gray"} size={22} />
            </button>
          );
        })}
      </div>

      {/* Colour */}
      <p className="px-0.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-muted/70">
        Colour
      </p>
      <div role="radiogroup" aria-label="Colour" className="flex justify-between px-0.5">
        {CATEGORY_COLORS.map((color, i) => {
          const selected = color === current.color;
          return (
            <button
              key={color}
              ref={(el) => (colorRefs.current[i] = el)}
              role="radio"
              aria-checked={selected}
              aria-label={color}
              title={color}
              tabIndex={i === colorFocus ? 0 : -1}
              onClick={() => pickColor(color)}
              onFocus={() => setColorFocus(i)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  pickColor(color);
                } else {
                  const to = step(colorRefs.current, i, e.key, CATEGORY_COLORS.length);
                  if (to !== i) {
                    e.preventDefault();
                    setColorFocus(to);
                  }
                }
              }}
              className={
                "h-5 w-5 rounded-full ring-offset-2 ring-offset-surface-raised " +
                (selected ? "ring-2 ring-text" : "")
              }
              style={{ background: catFg(color) }}
            />
          );
        })}
      </div>

      {/* Vibrancy — five steps, each a swatch of the current colour at that richness */}
      <p className="px-0.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-muted/70">
        Vibrancy
      </p>
      <div role="radiogroup" aria-label="Vibrancy" className="flex gap-1">
        {STEPS.map((val, i) => {
          const selected = i === stepIndex(curVib);
          return (
            <button
              key={val}
              ref={(el) => (vibRefs.current[i] = el)}
              role="radio"
              aria-checked={selected}
              aria-label={`Vibrancy ${i + 1} of 5`}
              tabIndex={i === vibFocus ? 0 : -1}
              onClick={() => pickVibrancy(val)}
              onFocus={() => setVibFocus(i)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  pickVibrancy(val);
                } else {
                  const to = step(vibRefs.current, i, e.key, STEPS.length);
                  if (to !== i) {
                    e.preventDefault();
                    setVibFocus(to);
                  }
                }
              }}
              className={
                "h-6 flex-1 rounded-md ring-offset-1 ring-offset-surface-raised " +
                (selected ? "ring-2 ring-accent" : "ring-1 ring-border")
              }
              style={{ background: `hsl(var(--cat-${current.color}-fg) / ${0.2 + 0.7 * val})` }}
            />
          );
        })}
      </div>

      {/* Shine — five steps, each a gloss bar whose brightness previews the step */}
      <p className="px-0.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-muted/70">
        Shine
      </p>
      <div role="radiogroup" aria-label="Shine" className="flex gap-1">
        {STEPS.map((val, i) => {
          const selected = i === stepIndex(curShine);
          return (
            <button
              key={val}
              ref={(el) => (shineRefs.current[i] = el)}
              role="radio"
              aria-checked={selected}
              aria-label={`Shine ${i + 1} of 5`}
              tabIndex={i === shineFocus ? 0 : -1}
              onClick={() => pickShine(val)}
              onFocus={() => setShineFocus(i)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  pickShine(val);
                } else {
                  const to = step(shineRefs.current, i, e.key, STEPS.length);
                  if (to !== i) {
                    e.preventDefault();
                    setShineFocus(to);
                  }
                }
              }}
              className={
                "flex h-6 flex-1 items-center justify-center rounded-md ring-offset-1 ring-offset-surface-raised " +
                (selected ? "ring-2 ring-accent" : "ring-1 ring-border")
              }
              style={{ background: `hsl(var(--cat-${current.color}-fg) / 0.5)` }}
            >
              <span
                className="block h-1.5 w-3/4 rounded-full bg-white"
                style={{ opacity: 0.15 + 0.7 * val }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
