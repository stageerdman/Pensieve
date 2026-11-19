import { useState } from "react";
import { useDismiss } from "../../hooks/useDismiss";
import { Globe, X } from "../../components/icons";
import type { AssistantTool } from "../../lib/ai/askAgent";

// The chat's tool picker, beside Send (PATRONUS-WEB-TOOLS; spec: the update folder's
// tool-picker-spec.md). One control carries both jobs:
//   off → a quiet globe icon button that opens the list;
//   on  → an accent "Web" pill that stays in view while typing (the "is this going to
//         the internet?" glance), with an × that switches it off in one click.
// The list comes from the Rust registry; labels and ids are never hard-coded here.
export function ToolPicker({
  available,
  enabled,
  onChange,
}: {
  available: AssistantTool[];
  enabled: string[];
  onChange: (tools: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // Capture-phase Escape so closing the list doesn't also close the whole Patronus
  // window (its own Escape listener sits on the same document).
  const ref = useDismiss<HTMLDivElement>(() => setOpen(false), {
    enabled: open,
    escapeCapture: true,
  });

  if (available.length === 0) return null;

  const on = available.filter((t) => enabled.includes(t.id));
  const toggle = (id: string) =>
    onChange(
      enabled.includes(id) ? enabled.filter((t) => t !== id) : [...enabled, id],
    );

  return (
    <div ref={ref} className="relative shrink-0">
      {on.length === 0 ? (
        <button
          type="button"
          aria-label="Tools"
          title="Tools"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={
            "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
            (open
              ? "bg-surface-raised text-text"
              : "text-text-muted hover:bg-surface-raised hover:text-text")
          }
        >
          <Globe size={18} />
        </button>
      ) : (
        <div className="flex h-9 items-center rounded-md bg-accent/10 text-accent">
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={`Tools: ${on.map((t) => t.label).join(", ")} on`}
            onClick={() => setOpen((v) => !v)}
            className="flex h-full items-center gap-1.5 rounded-md pl-2.5 pr-1 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Globe size={16} />
            {on.length === 1 ? shortLabel(on[0]) : `${on.length} tools`}
          </button>
          <button
            type="button"
            aria-label={`Turn off ${on.map((t) => t.label).join(", ")}`}
            title="Turn off"
            onClick={() => onChange([])}
            className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {open && (
        <div
          role="group"
          aria-label="Tools for this chat"
          className="absolute bottom-11 right-0 z-20 w-64 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-text-muted">
            Tools for this chat
          </div>
          {available.map((t) => {
            const isOn = enabled.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                role="switch"
                aria-checked={isOn}
                onClick={() => toggle(t.id)}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Globe
                  size={16}
                  className={"mt-0.5 " + (isOn ? "text-accent" : "text-text-muted")}
                />
                <span className="flex-1">
                  <span className="block text-sm text-text">{t.label}</span>
                  <span className="block text-xs text-text-muted">
                    {t.description}
                  </span>
                </span>
                <SwitchTrack on={isOn} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Web search" → "Web": the pill must stay small beside Send. */
function shortLabel(tool: AssistantTool): string {
  return tool.label.split(" ")[0] ?? tool.label;
}

function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors " +
        (on ? "bg-accent" : "bg-border")
      }
    >
      <span
        className={
          "h-4 w-4 rounded-full bg-white transition-transform " +
          (on ? "translate-x-4" : "translate-x-0")
        }
      />
    </span>
  );
}
