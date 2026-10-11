// accioRank.ts — pure relevance ranking for the Accio search sheet.
//
// Ported verbatim from 01-the-wand-v2.html ~lines 1360-1373 (`rankedView`).
// Relevance: title-starts-with > title-contains > body-contains, tying back to
// the item's original index; a bare "recent" query (no text) instead sorts by
// most-recently-opened.

import { parseQuery, passesDate, passesText, type DateFilterable, type TextFilterable } from "./accioQuery";

export type RankableNote = DateFilterable & TextFilterable;

/** Rank `notes` against `query` the way the Accio sheet does. Empty query (no text,
 *  no date tokens) returns everything in its original (recency) order. `openedOrder`
 *  is note ids in most-recently-opened order (last = most recent); required for
 *  "recent" filtering/sorting. Source ~1360-1373. */
export function rankNotes<T extends RankableNote>(
  notes: T[],
  query: string,
  openedOrder: Array<string | number> = [],
): T[] {
  const { text, dates } = parseQuery(query);
  if (!text && !dates.length) return notes.slice();

  let list: { d: T; i: number; s?: number }[] = notes
    .map((d, i) => ({ d, i }))
    .filter((x) => passesText(x.d, text) && passesDate(x.d, dates, openedOrder));

  if (text) {
    list = list
      .map((x) => {
        const t = (x.d.t || "").toLowerCase();
        const c = (x.d.c || "").toLowerCase();
        let s = 2;
        if (t.startsWith(text)) s = 0;
        else if (t.includes(text)) s = 1;
        else if (c.includes(text)) s = 2;
        return { ...x, s };
      })
      .sort((a, b) => (a.s as number) - (b.s as number) || a.i - b.i);
  } else if (dates.includes("recent")) {
    list = list.slice().sort((a, b) => openedOrder.indexOf(b.d.id as string | number) - openedOrder.indexOf(a.d.id as string | number));
  }

  return list.map((x) => x.d);
}
