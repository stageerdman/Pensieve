import type { MouseEvent } from "react";
import type { Category, NoteMeta } from "../lib/types";
import type { PreviewLines, SidebarView } from "../lib/sidebar/view";
import { relativeTime, absoluteDate } from "../lib/sidebar/format";
import { Pin } from "./icons";

// One note in the sidebar. The title is always shown; everything below it is driven
// by the view's field toggles. Fields collapse into at most two sub-lines so the row
// stays calm and scannable even with several enabled (design.md). Pin state and the
// preview come from NoteMeta (the fast list), so a row never reads a note body.

interface NoteRowProps {
  note: NoteMeta;
  view: SidebarView;
  active: boolean;
  now: number;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
}

// Category → a small colour dot. Names are too long to print in a 232px row, so the
// dot carries the label and the full names live in the row's hover tooltip.
const DOT: Record<Category, string> = {
  "Notes & Lessons": "bg-accent",
  "In my mind": "bg-text-muted",
  Execution: "bg-success",
};

const CLAMP: Record<PreviewLines, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
};

export function NoteRow({ note, view, active, now, onOpen, onTogglePin }: NoteRowProps) {
  const f = view.fields;
  const cats = note.categories ?? [];
  const tags = note.tags ?? [];
  const showDots = f.category && cats.length > 0;

  // The enabled timestamps, rendered inline (relative plain, absolute mono). The
  // hover tooltip always carries the full detail.
  const times: { text: string; mono: boolean }[] = [];
  if (f.relativeUpdated) times.push({ text: relativeTime(note.updatedAt, now), mono: false });
  if (f.relativeCreated) times.push({ text: relativeTime(note.createdAt, now), mono: false });
  if (f.updatedAbs) times.push({ text: absoluteDate(note.updatedAt, now), mono: true });
  if (f.createdAbs) times.push({ text: absoluteDate(note.createdAt, now), mono: true });

  const showPreview = f.preview && !!note.excerpt;
  const showTags = f.tags && tags.length > 0;
  const showMetaLine = showTags || times.length > 0;

  const tooltip = [
    `Updated ${absoluteDate(note.updatedAt, now)}`,
    `created ${absoluteDate(note.createdAt, now)}`,
    cats.length ? cats.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const pin = (e: MouseEvent) => {
    e.stopPropagation();
    onTogglePin(note.id);
  };

  return (
    <button
      onClick={() => onOpen(note.id)}
      aria-current={active ? "true" : undefined}
      title={tooltip}
      className="group relative block w-full select-none rounded-md px-3 py-2 text-left hover:bg-surface-raised aria-[current=true]:bg-surface-raised aria-[current=true]:before:absolute aria-[current=true]:before:inset-y-1 aria-[current=true]:before:left-0 aria-[current=true]:before:w-0.5 aria-[current=true]:before:rounded-full aria-[current=true]:before:bg-accent"
    >
      {/* Title line: category dots · title · pin */}
      <span className="flex items-center gap-1.5">
        {showDots && (
          <span className="flex shrink-0 -space-x-0.5">
            {cats.slice(0, 2).map((c) => (
              <span key={c} className={`h-1.5 w-1.5 rounded-full ${DOT[c]}`} />
            ))}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {note.title || "Untitled"}
        </span>
        {/* Generous hit area (-m-1 p-1) so the pin is easy to click. */}
        <span
          role="button"
          aria-label={note.pinned ? "Unpin note" : "Pin note"}
          onClick={pin}
          className={
            "-m-1 shrink-0 rounded p-1 text-text-muted/60 hover:bg-surface hover:text-text " +
            (note.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
        >
          <Pin size={13} filled={note.pinned} />
        </span>
      </span>

      {/* No `block` on the preview: line-clamp needs display:-webkit-box, which
          `block` would override (then the clamp is ignored and all lines show). */}
      {showPreview && (
        <span className={`mt-1 text-[13px] text-text-muted ${CLAMP[view.previewLines]}`}>
          {note.excerpt}
        </span>
      )}

      {showMetaLine && (
        <span className="mt-1 flex items-center justify-between gap-2">
          {showTags ? (
            <span className="flex min-w-0 items-center gap-1">
              {tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="max-w-[72px] truncate rounded-full bg-surface-raised px-1.5 text-[11px] leading-5 text-text-muted group-aria-[current=true]:bg-surface"
                >
                  {t}
                </span>
              ))}
              {tags.length > 2 && (
                <span className="shrink-0 text-[11px] text-text-muted/60">
                  +{tags.length - 2}
                </span>
              )}
            </span>
          ) : (
            <span />
          )}
          {times.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-muted/70">
              {times.map((t, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-text-muted/40">·</span>}
                  <span className={t.mono ? "font-mono text-text-muted/60" : ""}>
                    {t.text}
                  </span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
