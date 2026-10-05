import type { MouseEvent } from "react";
import type { NoteMeta } from "../../lib/types";
import type { CategoryDef } from "../../lib/categories/defs";
import { colorOf } from "../../lib/categories/defs";
import { catFg } from "../../lib/categories/palette";
import { relativeTime, absoluteDate } from "../../lib/sidebar/format";
import type { GalleryFields, SnippetLines } from "../../lib/gallery/view";
import { FlaskFor } from "../../components/Flask";

// One memory in the gallery: a large flask (its visual identity) with the title and a
// little of the actual content below it — a specimen on a shelf. The title is always
// shown; everything else is driven by the view's field toggles. Reads only NoteMeta
// (never a note body), so the grid stays cheap at hundreds of flasks.

interface FlaskCardProps {
  note: NoteMeta;
  fields: GalleryFields;
  snippetLines: SnippetLines;
  categoryDefs: CategoryDef[];
  now: number;
  // Plain click opens as a tab and switches to it; ⌘/Ctrl click opens a background
  // tab and stays on Home. The card forwards which it was.
  onOpen: (id: string, background: boolean) => void;
}

const CLAMP: Record<SnippetLines, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
};

export function FlaskCard({
  note,
  fields,
  snippetLines,
  categoryDefs,
  now,
  onOpen,
}: FlaskCardProps) {
  const cats = note.categories ?? [];
  const tags = note.tags ?? [];
  const showDots = fields.category && cats.length > 0;
  const showSnippet = fields.snippet && !!note.excerpt;
  const showTags = fields.tags && tags.length > 0;

  const times: string[] = [];
  if (fields.createdRelative) times.push(relativeTime(note.createdAt, now));
  if (fields.createdAbs) times.push(absoluteDate(note.createdAt, now));
  const showMeta = showTags || times.length > 0;

  return (
    <button
      data-note-id={note.id}
      onClick={(e: MouseEvent) => onOpen(note.id, e.metaKey || e.ctrlKey)}
      aria-label={`${note.title || "Untitled"}, created ${absoluteDate(note.createdAt, now)}`}
      className="group relative flex select-none flex-col rounded-lg p-3 text-left transition-colors hover:bg-surface-raised"
    >
      {/* Flask — fixed-height box so every flask in a row bottom-aligns. */}
      <span className="flex h-[84px] items-center justify-center">
        <FlaskFor
          icon={note.icon}
          chars={note.chars}
          size={64}
          label={note.title || "Untitled"}
        />
      </span>

      {/* Title line: category dots · title */}
      <span className="mt-2 flex items-center gap-1.5">
        {showDots && (
          <span className="flex shrink-0 -space-x-0.5">
            {cats.slice(0, 2).map((c) => (
              <span
                key={c}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: catFg(colorOf(c, categoryDefs)) }}
              />
            ))}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {note.title || "Untitled"}
        </span>
      </span>

      {/* No `block` on the snippet: line-clamp needs display:-webkit-box, which
          `block` would override (then the clamp is ignored and all lines show). */}
      {showSnippet && (
        <span className={`mt-1 text-[13px] leading-snug text-text-muted ${CLAMP[snippetLines]}`}>
          {note.excerpt}
        </span>
      )}

      {showMeta && (
        <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
          {showTags &&
            tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="max-w-[80px] truncate rounded-full bg-surface-raised px-1.5 leading-5 group-hover:bg-surface"
              >
                {t}
              </span>
            ))}
          {times.length > 0 && (
            <span className="shrink-0">{times.join(" · ")}</span>
          )}
        </span>
      )}
    </button>
  );
}
