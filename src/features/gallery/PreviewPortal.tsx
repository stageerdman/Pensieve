import { useEffect, useState } from "react";
import { getStore } from "../../lib/store";
import { NotePreview } from "./NotePreview";

// The preview "portal": the previewed memory is the sharp focal subject, while the rest
// of the app recedes — a focus backdrop blurs + darkens the gallery toward its edges
// (depth-of-field / spotlight). The memory pane itself stays crisp and legible; only a
// faint drifting water-light and a sub-pixel heat-haze sway play over it, so it reads as
// "looking at a sharp memory through water." No separate title (the note's first line is
// the title). Everything is pointer-events-none (flasks stay live behind it, so hovering
// swaps the preview); the Space-pinned peek makes the reading column scrollable.
//
// The focus backdrop, outer halo, water skin and sway all live in index.css, with
// prefers-reduced-motion stills.

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
    <>
      {/* Layer 1: the rest of the app recedes — mask on the parent clips the child's
          backdrop blur + vignette to the edges (WebKit won't mask a backdrop-filter on
          the same element). The background ripple is applied by Gallery, not here. */}
      <div className="focus-backdrop" aria-hidden>
        <div className="focus-backdrop-fx" />
      </div>

      {/* Layer 2: the sharp memory, centered. */}
      <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6">
        <div
          role="region"
          aria-label={`Preview: ${title || "Untitled"}`}
          className="portal-enter relative flex max-h-[82vh] w-[min(720px,86vw)] flex-col overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface)/0.92)] shadow-[0_40px_120px_-24px_rgba(0,0,0,0.55)] backdrop-blur-[3px] backdrop-saturate-[120%] dark:bg-[hsl(var(--surface)/0.9)]"
        >
          {/* Outer glow — magic lives outside the memory, never a wash over the text. */}
          <span className="portal-halo" aria-hidden />

          <h2 className="sr-only" aria-live="polite">
            {title || "Untitled"}
          </h2>

          {/* The memory — crisp text, with a constant subtle liquid ripple over it. */}
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

          {/* Water skin — drifting light over everything; pointer-events pass through. */}
          <span className="portal-water" aria-hidden />
        </div>
      </div>
    </>
  );
}
