// highlight.tsx — wrap the matched span of a string in a <mark> (violet, via wand.css).
//
// React analogue of the prototype's hl() (source ~1447-1449): highlight only the
// WORD part of the query (date tokens like "yesterday" are not text matches). Case-
// insensitive, first occurrence only — same as the original indexOf-based match.

import type { ReactNode } from "react";

export function highlight(text: string, queryText: string): ReactNode {
  const t = text || "";
  if (!queryText) return t;
  const i = t.toLowerCase().indexOf(queryText);
  if (i < 0) return t;
  return (
    <>
      {t.slice(0, i)}
      <mark>{t.slice(i, i + queryText.length)}</mark>
      {t.slice(i + queryText.length)}
    </>
  );
}
