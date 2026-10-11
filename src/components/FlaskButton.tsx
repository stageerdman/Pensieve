import { useRef, useState } from "react";
import { DEFAULT_ICON, SHAPE_LABELS, type NoteIcon } from "../lib/flasks/icon";
import { useDismiss } from "../hooks/useDismiss";
import { colorLabel } from "../lib/categories/palette";
import { FlaskFor } from "./Flask";
import { FlaskPicker } from "./FlaskPicker";

// The note's flask, large and left-aligned above the editor (Notion page-icon
// style) — the single affordance for choosing a flask. Click opens the picker
// popover; a note with no flask yet simply shows the default, so it always looks
// finished (picking is a refinement, not a requirement). Closes on outside-click /
// Esc and returns focus to the button, matching the house popover pattern.

interface FlaskButtonProps {
  icon?: NoteIcon;
  chars?: number; // the open note's content length — drives the flask's fill level
  seed?: string; // the note's id — seeds the memory thread
  onChange: (icon: NoteIcon) => void;
}

export function FlaskButton({ icon, chars, seed, onChange }: FlaskButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false), {
    enabled: open,
    // Esc returns focus to the trigger (keyboard users don't lose their place).
    onEscape: () => {
      setOpen(false);
      btnRef.current?.focus();
    },
  });
  const shown = icon ?? DEFAULT_ICON;

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Flask — ${SHAPE_LABELS[shown.shape]}, ${colorLabel(shown.color)}. Click to change`}
        title="Change flask"
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-raised"
      >
        <FlaskFor icon={icon} chars={chars} seed={seed} size={28} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface-raised shadow-lg">
          <FlaskPicker icon={icon} seed={seed} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
