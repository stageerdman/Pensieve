import type { ReactNode } from "react";
import type { Snippet } from "../lib/search/snippet";

/** Render a snippet (or a title from `markTerms`) with its matched ranges wrapped in the
 *  app's one subtle accent highlight. Ranges must be sorted and non-overlapping. */
export function Highlighted({ snippet }: { snippet: Snippet }) {
  const { text, marks } = snippet;
  if (marks.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
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
