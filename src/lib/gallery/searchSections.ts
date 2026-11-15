// The Accio (active search) layout for the gallery: STARRED TEXT MATCHES RISE "WAY ON TOP".
//
// Starred = "a very important bright memory" (owner). During a search the gallery normally
// date-buckets every result by updatedAt (see buckets.ts) and ignores relevance. That would
// leave a starred answer wherever its date puts it, so we lift every starred note that
// matched the FREE TEXT out of the date buckets into ONE leading "Starred" section, ordered
// by match strength (title > tag > body, runSearch's `rank`) then most-recently-updated.
// Everything else stays in its usual date bucket, unchanged.
//
// Deliberately NOT lifted:
//  - chip-only queries (`#CANI`, `last week`, `pinned`): a thread / time lens is read in date
//    order. They carry no free text, so every match has `where: null`.
//  - when EVERY result would lift (e.g. the `starred` chip + text): a section that repeats
//    the whole result set says nothing — keep the plain date view instead.
// The home view (no query) never calls this; it keeps its created-date grouping.

import type { NoteMeta } from "../types";
import type { SearchResult } from "../search/search";
import { bucketize, type GallerySection } from "./buckets";

export const STARRED_SECTION_KEY = "starred";

/** Does this result earn the lift? Starred AND matched the free text. */
export function isLifted(n: NoteMeta, match: Map<string, SearchResult> | undefined): boolean {
  return !!n.starred && match?.get(n.id)?.where != null;
}

export function searchSections(
  notes: NoteMeta[],
  match: Map<string, SearchResult> | undefined,
  now: number,
): GallerySection[] {
  const lifted = notes.filter((n) => isLifted(n, match));
  if (lifted.length === 0 || lifted.length === notes.length) return bucketize(notes, now, "updated");

  const rank = (n: NoteMeta) => match?.get(n.id)?.rank ?? 3;
  const ordered = [...lifted].sort(
    (a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  );
  const rest = notes.filter((n) => !isLifted(n, match));
  return [
    { key: STARRED_SECTION_KEY, label: "Starred", short: "Starred", notes: ordered },
    ...bucketize(rest, now, "updated"),
  ];
}
