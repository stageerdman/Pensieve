import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getStore } from "../../lib/store";
import { excerptFromMarkdown } from "../../lib/text";

// A quiet sneak-peek into a flask's actual content — shown while Option/Alt is held
// over a card, or toggled with Space on the keyboard. Non-interactive (role=tooltip),
// so focus never moves into it. The card already shows a ~140-char snippet; the peek
// loads a fuller chunk of the body (session-cached) so it reveals more, not the same.

const PEEK_CHARS = 400;
// Session cache of peeked bodies, keyed by note id — survives popover open/close so a
// second peek is instant. Never read a body twice.
const bodyCache = new Map<string, string>();

interface PeekPopoverProps {
  id: string;
  title: string;
  fallback: string; // the card's excerpt — shown instantly while the body loads
  rect: DOMRect; // the anchor card's bounds (viewport coords)
}

export function PeekPopover({ id, title, fallback, rect }: PeekPopoverProps) {
  const [body, setBody] = useState(() => bodyCache.get(id) ?? fallback);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: rect.left,
    top: rect.bottom + 8,
  });

  useEffect(() => {
    const cached = bodyCache.get(id);
    if (cached !== undefined) {
      setBody(cached);
      return;
    }
    setBody(fallback);
    let alive = true;
    void getStore()
      .load(id)
      .then((note) => {
        const text = (note ? excerptFromMarkdown(note.markdown, PEEK_CHARS) : "") || fallback;
        bodyCache.set(id, text);
        if (alive) setBody(text);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, fallback]);

  // Clamp into the viewport; flip above the card when there isn't room below.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    let left = rect.left;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin;
    if (left < margin) left = margin;
    let top = rect.bottom + margin;
    if (top + h > window.innerHeight - margin) top = Math.max(margin, rect.top - h - margin);
    setPos({ left, top });
  }, [rect, body]);

  return (
    <div
      ref={ref}
      role="tooltip"
      id={`peek-${id}`}
      style={{ left: pos.left, top: pos.top, width: "min(40ch, 90vw)" }}
      className="pointer-events-none fixed z-30 max-h-[40vh] overflow-hidden rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
    >
      <p className="mb-1 truncate text-sm font-medium text-text">{title || "Untitled"}</p>
      <p className="whitespace-pre-wrap text-[13px] leading-snug text-text-muted">
        {body || "Empty note."}
      </p>
    </div>
  );
}
