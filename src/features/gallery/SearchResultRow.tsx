import { useRef } from "react";
import type { NoteMeta } from "../../lib/types";
import type { SearchResult } from "../../lib/search/search";
import { markTerms } from "../../lib/search/snippet";
import { absoluteDate } from "../../lib/format";
import { FlaskFor } from "../../components/Flask";
import { isFormTemplate } from "../../lib/forms/meta";
import { StarHalo } from "../../components/StarHalo";
import { Highlighted } from "../../components/Highlighted";
import { onCardKeyDown, type CardKeyActions } from "./cardKeys";
import type { MenuAnchor, PeekTarget } from "./FlaskCard";

// One search result (design/search-results.md): small flask · title with every matched
// term lit · the words around the match (or the plain excerpt for a title/tag hit) · a
// quiet "Type · date" line. Same keys/clicks as a gallery card (cardKeys.ts).

export interface SearchResultRowProps {
  note: NoteMeta;
  match?: SearchResult;
  /** The live free text, for lighting the matched terms in the title. */
  queryText: string;
  now: number;
  onOpen: (id: string, background: boolean) => void;
  onContextMenu: (e: MenuAnchor, id: string) => void;
  onHoverChange: (target: PeekTarget | null) => void;
  onPeekToggle: (target: PeekTarget) => void;
  onToggleWorkingSet: (id: string) => void;
  onToggleStar?: (id: string) => void;
}

/** "Journal · Nov 12" — the first category is the memory's type; no category → date only. */
export function resultMeta(note: NoteMeta, now: number): string {
  const type = note.categories?.[0];
  const date = absoluteDate(note.createdAt, now);
  return type ? `${type} · ${date}` : date;
}

export function SearchResultRow({
  note,
  match,
  queryText,
  now,
  onOpen,
  onContextMenu,
  onHoverChange,
  onPeekToggle,
  onToggleWorkingSet,
  onToggleStar,
}: SearchResultRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const title = note.title || "Untitled";
  const snippet = match?.snippet ?? null;
  const meta = resultMeta(note, now);
  const keys: Omit<CardKeyActions, "el"> = {
    id: note.id,
    onOpen,
    onPeekToggle,
    onToggleWorkingSet,
    onToggleStar,
    onContextMenu,
  };

  return (
    <button
      ref={ref}
      type="button"
      data-note-id={note.id}
      onClick={(e) => onOpen(note.id, e.metaKey || e.ctrlKey || e.altKey)}
      onContextMenu={(e) => onContextMenu(e, note.id)}
      onKeyDown={(e) => onCardKeyDown(e, { ...keys, el: ref.current })}
      onPointerEnter={() => ref.current && onHoverChange({ id: note.id, el: ref.current })}
      onPointerLeave={() => onHoverChange(null)}
      aria-label={`${title}${note.starred ? ", starred" : ""}, ${meta}`}
      className="group flex w-full select-none items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-raised focus-visible:bg-surface-raised"
    >
      <span className="relative mt-0.5 flex h-9 w-8 shrink-0 items-center justify-center">
        {note.starred && <StarHalo className="h-11 w-11" />}
        <FlaskFor icon={note.icon} chars={note.chars} seed={note.id} form={isFormTemplate(note.extra)} size={28} className="relative" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-text">
          <Highlighted snippet={markTerms(title, queryText)} />
        </span>
        {snippet ? (
          <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-text-muted">
            <Highlighted snippet={snippet} />
          </span>
        ) : (
          note.excerpt && (
            <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-text-muted">{note.excerpt}</span>
          )
        )}
        <span className="mt-1 text-2xs text-text-muted">{meta}</span>
      </span>
    </button>
  );
}
