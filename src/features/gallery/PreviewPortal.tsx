import { useEffect, useState } from "react";
import { getStore } from "../../lib/store";
import { NotePreview } from "./NotePreview";

// The preview "portal": a centered, translucent pane that renders the hovered/peeked
// note FORMATTED (via NotePreview) — "diving into a memory." The whole pane is
// see-through glass: a heavy backdrop-blur turns the flasks behind it into soft colour
// washes, and a watery bluish light wells in from every edge. No separate title (the
// note's first line already is its title). Pointer-events-none so the flasks stay live
// behind it; the Space-pinned peek makes the content scrollable.
//
// Watery/circular motion (sheen ring, breathing glow, drifting caustic, the dive edge)
// lives in index.css; all of it has prefers-reduced-motion stills.

const bodyCache = new Map<string, string>(); // session cache of note Markdown, by id

interface PreviewPortalProps {
  id: string;
  title: string; // used only for the screen-reader label (no visible title)
  theme: "light" | "dark";
  interactive: boolean; // true only for the Space-pinned peek (content becomes scrollable)
}

export function PreviewPortal({ id, title, theme, interactive }: PreviewPortalProps) {
  const [markdown, setMarkdown] = useState<string | null>(() => bodyCache.get(id) ?? null);

  useEffect(() => {
    const cached = bodyCache.get(id);
    if (cached !== undefined) {
      setMarkdown(cached);
      return;
    }
    setMarkdown(null);
    let alive = true;
    void getStore()
      .load(id)
      .then((note) => {
        const md = note?.markdown ?? "";
        bodyCache.set(id, md);
        if (alive) setMarkdown(md);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6">
      <div
        role="region"
        aria-label={`Preview: ${title || "Untitled"}`}
        className="portal-enter relative flex max-h-[82vh] w-[min(720px,86vw)] flex-col overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.45)] bg-[hsl(var(--surface)/0.58)] shadow-[0_40px_120px_-24px_rgba(0,0,0,0.55)] backdrop-blur-[30px] backdrop-saturate-[150%] dark:bg-[hsl(var(--surface)/0.42)]"
      >
        {/* Ambient magic — all behind the text. The "dive" is the bluish edge well. */}
        <span className="portal-ring" aria-hidden />
        <span className="portal-caustic" aria-hidden />
        <span className="portal-glow" aria-hidden />
        <span className="portal-dive" aria-hidden />

        <h2 className="sr-only" aria-live="polite">
          {title || "Untitled"}
        </h2>

        <div
          className={
            "no-scrollbar relative z-10 flex-1 overflow-y-auto overscroll-contain px-8 py-7 " +
            (interactive ? "pointer-events-auto" : "pointer-events-none")
          }
        >
          {markdown !== null && (
            <div key={id} className="well-focus">
              <NotePreview markdown={markdown} theme={theme} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
