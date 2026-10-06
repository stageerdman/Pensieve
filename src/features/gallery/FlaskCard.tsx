import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { NoteMeta } from "../../lib/types";
import type { SearchResult } from "../../lib/search/search";
import type { Snippet } from "../../lib/search/snippet";
import type { CategoryDef } from "../../lib/categories/defs";
import { colorOf } from "../../lib/categories/defs";
import { catFg } from "../../lib/categories/palette";
import { relativeTime, absoluteDate } from "../../lib/format";
import type { GalleryFields, SnippetLines } from "../../lib/gallery/view";
import { FlaskFor } from "../../components/Flask";
import { Bookmark } from "../../components/icons";

// One memory in the gallery: a large flask (its visual identity) with the title and a
// little of the actual content below it — a specimen on a shelf. The title is always
// shown; everything else is driven by the view's field toggles. Reads only NoteMeta
// (never a note body), so the grid stays cheap at hundreds of flasks.
//
// Interactions: click opens a tab and switches (⌘/Ctrl-click → background tab); Enter /
// ⌘Enter mirror that on the keyboard; Space toggles the content peek; `w` toggles the
// working set; right-click (or the menu/Shift+F10 key) opens the context menu.

export interface PeekTarget {
  id: string;
  el: HTMLElement;
}

// Just the cursor coords the context menu needs — satisfied by a React.MouseEvent and
// by the synthetic object the keyboard (Shift+F10) path builds from the card's rect.
export interface MenuAnchor {
  preventDefault: () => void;
  clientX: number;
  clientY: number;
}

interface FlaskCardProps {
  note: NoteMeta;
  fields: GalleryFields;
  snippetLines: SnippetLines;
  categoryDefs: CategoryDef[];
  now: number;
  inWorkingSet: boolean;
  /** Why this card matched the active summon query (snippet + reason), if any. */
  searchMatch?: SearchResult | null;
  /** How many lines the title may use before it ellipsises (default 2). */
  titleLines?: 1 | 2;
  onOpen: (id: string, background: boolean) => void;
  onContextMenu: (e: MenuAnchor, id: string) => void;
  onHoverChange: (target: PeekTarget | null) => void;
  onPeekToggle: (target: PeekTarget) => void;
  onToggleWorkingSet: (id: string) => void;
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
  inWorkingSet,
  searchMatch,
  titleLines = 2,
  onOpen,
  onContextMenu,
  onHoverChange,
  onPeekToggle,
  onToggleWorkingSet,
}: FlaskCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const cats = note.categories ?? [];
  const tags = note.tags ?? [];
  const showDots = fields.category && cats.length > 0;
  const matchSnippet = searchMatch?.where === "text" ? searchMatch.snippet : null;
  const showSnippet = fields.snippet && !!note.excerpt;
  const showTags = fields.tags && tags.length > 0;
  const reason =
    searchMatch?.where === "title"
      ? "in title"
      : searchMatch?.where === "tag"
        ? "in tag"
        : searchMatch?.where === "text"
          ? "in note"
          : null;

  const times: string[] = [];
  if (fields.createdRelative) times.push(relativeTime(note.createdAt, now));
  if (fields.createdAbs) times.push(absoluteDate(note.createdAt, now));
  const showMeta = showTags || times.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(note.id, e.metaKey || e.ctrlKey || e.altKey);
    } else if (e.key === " ") {
      // Space would otherwise activate the button (= open); instead it peeks.
      e.preventDefault();
      if (ref.current) onPeekToggle({ id: note.id, el: ref.current });
    } else if (e.key.toLowerCase() === "w") {
      e.preventDefault();
      onToggleWorkingSet(note.id);
    } else if (e.shiftKey && e.key === "F10") {
      e.preventDefault();
      const r = ref.current?.getBoundingClientRect();
      if (r) onContextMenu({ preventDefault() {}, clientX: r.left + 12, clientY: r.bottom - 12 }, note.id);
    }
  };

  return (
    <button
      ref={ref}
      data-note-id={note.id}
      onClick={(e: MouseEvent) => onOpen(note.id, e.metaKey || e.ctrlKey || e.altKey)}
      onContextMenu={(e) => onContextMenu(e, note.id)}
      onKeyDown={onKeyDown}
      onPointerEnter={() => ref.current && onHoverChange({ id: note.id, el: ref.current })}
      onPointerLeave={() => onHoverChange(null)}
      aria-label={`${note.title || "Untitled"}, created ${absoluteDate(note.createdAt, now)}`}
      className="group relative flex w-full select-none flex-col overflow-hidden rounded-lg p-3 text-left transition-colors hover:bg-surface-raised"
    >
      {inWorkingSet && (
        <Bookmark
          size={13}
          filled
          className="absolute right-2 top-2 text-text-muted/70"
        />
      )}

      {/* Flask — fixed-height box so every flask in a row bottom-aligns. */}
      <span className="flex h-[84px] items-center justify-center">
        <FlaskFor
          icon={note.icon}
          chars={note.chars}
          seed={note.id}
          size={64}
          label={note.title || "Untitled"}
        />
      </span>

      {/* Title line: category dots · title. The title wraps to two lines when long —
          dots then top-align with the first line. */}
      <span className={`mt-2 flex gap-1.5 ${titleLines === 2 ? "items-start" : "items-center"}`}>
        {showDots && (
          <span className={`flex shrink-0 -space-x-0.5 ${titleLines === 2 ? "mt-[5px]" : ""}`}>
            {cats.slice(0, 2).map((c) => (
              <span
                key={c}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: catFg(colorOf(c, categoryDefs)) }}
              />
            ))}
          </span>
        )}
        <span
          className={
            "min-w-0 flex-1 text-sm font-medium text-text " +
            (titleLines === 2 ? "line-clamp-2" : "truncate")
          }
        >
          {note.title || "Untitled"}
        </span>
      </span>

      {/* A body-text match shows the matched context (highlighted) in place of the
          preview; otherwise the normal excerpt. No `block`: line-clamp needs
          display:-webkit-box, which `block` would override. */}
      {matchSnippet ? (
        <span className={`mt-1 text-[13px] leading-snug text-text-muted ${CLAMP[snippetLines]}`}>
          <Highlighted snippet={matchSnippet} />
        </span>
      ) : (
        showSnippet && (
          <span className={`mt-1 text-[13px] leading-snug text-text-muted ${CLAMP[snippetLines]}`}>
            {note.excerpt}
          </span>
        )
      )}

      {reason && (
        <span className="mt-1 select-none text-[10px] uppercase tracking-wider text-accent/80">
          {reason}
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
          {times.length > 0 && <span className="shrink-0">{times.join(" · ")}</span>}
        </span>
      )}
    </button>
  );
}

/** Render a snippet with its matched ranges wrapped in a subtle accent highlight. */
function Highlighted({ snippet }: { snippet: Snippet }) {
  const { text, marks } = snippet;
  if (marks.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className="rounded bg-accent/25 px-0.5 text-text">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
