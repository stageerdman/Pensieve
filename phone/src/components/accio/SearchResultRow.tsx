// SearchResultRow.tsx — one row in the Accio result list (design/search-results.md).
//
// flask · title with every matched term lit · the words AROUND the match (not the note's
// first line), lit too · a quiet "Type · date". The strongest match is rendered LAST
// (nearest the thumb) and lit via .sr:last-child (CSS). Highlighting is the same shared
// code as the Mac (src/lib/search/snippet), so both platforms light the same words.

import type { ReactNode } from "react";
import type { Note } from "../../types";
import { Flask } from "../Flask";
import { isFormTemplate } from "../../../../src/lib/forms/meta";
import { stripMediaForPreview } from "../../lib/media/noteMedia";
import { makeSnippet, markTerms, type Snippet } from "../../../../src/lib/search/snippet";
import { planQuery } from "../../../../src/lib/search/rank/queryPlan";

/** "Journal · 12 Nov" — type is the memory's first category; none → the date alone. */
export function resultWhen(note: Note): string {
  const type = note.foreign?.categories?.[0];
  const date = note.created || note.d;
  return type ? `${type} · ${date}` : date;
}

/** The snippet line: around the first match, else the plain start of the body. */
export function resultSnippet(note: Note, queryText: string): Snippet | null {
  const body = stripMediaForPreview(note.c || "").trim();
  if (!body) return null;
  return makeSnippet(body, planQuery(queryText).terms) ?? { text: body.replace(/\s+/g, " ").slice(0, 160), marks: [] };
}

function Lit({ s }: { s: Snippet }): ReactNode {
  const out: ReactNode[] = [];
  let at = 0;
  s.marks.forEach(([a, b], i) => {
    if (a > at) out.push(s.text.slice(at, a));
    out.push(<mark key={i}>{s.text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < s.text.length) out.push(s.text.slice(at));
  return <>{out}</>;
}

export function SearchResultRow({
  note,
  queryText,
  onOpen,
  fetching = false,
}: {
  note: Note;
  queryText: string;
  onOpen: (n: Note) => void;
  /** PHONE-WINDOW: an older memory is being poured in from OneDrive (flask fills). */
  fetching?: boolean;
}) {
  const title = note.t || "New thought";
  // an older memory has only its title on the phone — no snippet line at all
  const snip = note.remote ? null : resultSnippet(note, queryText);
  const when = resultWhen(note);
  return (
    <div
      className={"sr" + (fetching ? " fetching" : "")}
      data-id={note.id}
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${when}`}
      onClick={() => onOpen(note)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(note);
        }
      }}
    >
      <Flask shape={note.shape} cat={note.cat} fill={fetching ? 1 : note.fill} form={isFormTemplate(note.foreign?.extra)} />
      <div className="body">
        <div className="title">
          <Lit s={markTerms(title, queryText)} />
        </div>
        {snip && (
          <div className="snip">
            <Lit s={snip} />
          </div>
        )}
        <div className="when">{when}</div>
      </div>
    </div>
  );
}
