import { Globe } from "../../components/icons";
import "./patronus.css";

// The in-field globe (spec §3): shown only while web search is on — off is the default
// and needs no marker. Clicking it turns web off. Mousedown is cancelled so the
// textarea keeps its caret. Inset 7px: a one-line field is 38px tall, so the 24px globe
// sits dead centre (7 + 24 + 7).
export function WebIndicator({ on, onTurnOff }: { on: boolean; onTurnOff: () => void }) {
  if (!on) return null;
  return (
    <button
      type="button"
      aria-label="Web search is on. Turn off"
      title="Web search is on. Click to turn off"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onTurnOff}
      className="patronus-fade-in absolute bottom-[7px] right-[7px] inline-flex h-6 w-6 items-center justify-center rounded-sm text-accent hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Globe size={16} />
    </button>
  );
}
