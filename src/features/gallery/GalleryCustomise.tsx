import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../components/IconButton";
import { MoreHorizontal } from "../../components/icons";
import type { GalleryFields, GalleryState, SnippetLines } from "../../lib/gallery/view";

// The gallery's "Edit view" — the ⋯ popover (design.md: no settings screen). Controls
// exactly what each flask shows, and whether the working set survives between sessions.
// Changes apply live; closes on outside-click / Esc. Mirrors the old SidebarCustomise
// popover so the two surfaces feel the same.

interface GalleryCustomiseProps {
  state: GalleryState;
  onToggleField: (key: keyof GalleryFields) => void;
  onSetSnippetLines: (n: SnippetLines) => void;
  onSetWorkingSetPersist: (on: boolean) => void;
}

const FIELDS: { key: keyof GalleryFields; label: string }[] = [
  { key: "snippet", label: "Content snippet" },
  { key: "category", label: "Category" },
  { key: "tags", label: "Tags" },
  { key: "createdRelative", label: "Created — relative" },
  { key: "createdAbs", label: "Created — date" },
];

const SNIPPET_LINES: SnippetLines[] = [1, 2, 3];

export function GalleryCustomise({
  state,
  onToggleField,
  onSetSnippetLines,
  onSetWorkingSetPersist,
}: GalleryCustomiseProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton label="Edit view" title="Edit view" active={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal />
      </IconButton>

      {open && (
        <div className="absolute right-0 top-9 z-40 max-h-[75vh] w-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
          <Group title="Show on each flask">
            {FIELDS.map((field) => {
              const on = state.fields[field.key];
              return (
                <Row key={field.key} onClick={() => onToggleField(field.key)}>
                  <span className="flex-1">{field.label}</span>
                  <span className={on ? "text-accent" : "text-text-muted/30"}>{on ? "✓" : ""}</span>
                </Row>
              );
            })}
            {state.fields.snippet && (
              <div className="mt-1 flex items-center gap-2 px-2 py-1 text-sm text-text-muted">
                <span className="flex-1">Snippet lines</span>
                <div className="flex overflow-hidden rounded-md border border-border">
                  {SNIPPET_LINES.map((n) => (
                    <button
                      key={n}
                      onClick={() => onSetSnippetLines(n)}
                      className={
                        "px-2 py-0.5 text-xs " +
                        (state.snippetLines === n
                          ? "bg-accent text-surface"
                          : "text-text-muted hover:bg-surface")
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Group>

          <Divider />

          <Group title="Working set">
            <Row onClick={() => onSetWorkingSetPersist(!state.settings.workingSetPersist)}>
              <span className="flex-1">Keep between sessions</span>
              <span className={state.settings.workingSetPersist ? "text-accent" : "text-text-muted/30"}>
                {state.settings.workingSetPersist ? "✓" : ""}
              </span>
            </Row>
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
        {title}
      </p>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-border" />;
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-muted hover:bg-surface hover:text-text"
    >
      {children}
    </button>
  );
}
