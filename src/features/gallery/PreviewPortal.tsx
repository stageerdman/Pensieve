import { useEffect, useState } from "react";
import { getStore } from "../../lib/store";
import { NotePreview } from "./NotePreview";

// The preview "portal": a centered, translucent, gently-animated pane that renders the
// hovered/peeked note FORMATTED (via NotePreview) — "looking into the Pensieve." The
// frame is translucent and the whole thing is pointer-events-none, so the flasks stay
// visible behind it and the owner can keep moving between them while it updates. The
// Space-pinned peek passes interactive=true so a long note can be scrolled.
//
// Watery/circular motion (rotating sheen ring, breathing glow, drifting caustic) and
// the enter/swap transitions live in index.css; all have prefers-reduced-motion stills.

const bodyCache = new Map<string, string>(); // session cache of note Markdown, by id

interface PreviewPortalProps {
  id: string;
  title: string;
  theme: "light" | "dark";
  interactive: boolean; // true only for the Space-pinned peek (well becomes scrollable)
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
        className="portal-enter relative flex max-h-[82vh] w-[min(760px,88vw)] flex-col overflow-hidden rounded-[20px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-raised)/0.66)] shadow-[0_40px_120px_-24px_rgba(0,0,0,0.55)] backdrop-blur-[16px] backdrop-saturate-[120%] dark:bg-[hsl(var(--surface)/0.58)]"
      >
        {/* Ambient magic — behind the content, never under the text. */}
        <span className="portal-ring" aria-hidden />
        <span className="portal-caustic" aria-hidden />
        <span className="portal-glow" aria-hidden />

        {/* Title (static) */}
        <div className="relative z-10 flex-none px-7 pb-3 pt-6">
          <p aria-live="polite" className="truncate text-[15px] font-medium tracking-[0.01em] text-text">
            {title || "Untitled"}
          </p>
        </div>

        {/* Reading well — more opaque so the formatted text stays AA-legible. */}
        <div
          className={
            "no-scrollbar relative z-10 mx-3 mb-3 flex-1 overflow-y-auto overscroll-contain rounded-[14px] bg-[hsl(var(--surface)/0.92)] px-4 pb-6 pt-2 dark:bg-[hsl(var(--surface-raised)/0.82)] " +
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
