// accioQuery.ts — pure parsing/filtering for the Accio search bar.
//
// Ported verbatim from 01-the-wand-v2.html ~lines 665-696. Accio understands TIME,
// not just words: "yesterday"/"today"/"last week"/"recent" filter by WHEN, on their
// own or alongside text ("lighthouse yesterday") — the date words are stripped from
// the text before matching so they never fight the word search (or the highlight).

/** Minimal shape a note needs for date filtering: a stable `created` date label
 *  (falls back to the live `.d` label) and an id (for "recent" = recently opened). */
export interface DateFilterable {
  id?: string | number;
  created?: string;
  d?: string;
}

/** Minimal shape a note needs for text filtering: title + body. */
export interface TextFilterable {
  t?: string;
  c?: string;
}

export type DateBucket = "today" | "yesterday" | "week" | "older";
export type DateToken = "today" | "yesterday" | "week" | "recent";

/** Classify a card's display date into a bucket. Source ~665-671. */
export function dayBucket(ds: string | undefined): DateBucket {
  const s = (ds || "").toLowerCase();
  if (s === "just now" || s === "today" || /\bago\b/.test(s)) return "today"; // "Just now", "2m ago", "Today"
  if (s === "yesterday") return "yesterday";
  if (/^(mon|tue|wed|thu|fri|sat|sun)/.test(s)) return "week"; // weekday → within this week
  return "older";
}

const DATE_TOKENS: { re: RegExp; kind: DateToken }[] = [
  { re: /\btoday\b/, kind: "today" },
  { re: /\byesterday\b/, kind: "yesterday" },
  { re: /\b(?:last|this|past)\s*week\b|\bweek\b/, kind: "week" },
  { re: /\brecent(?:ly)?\b/, kind: "recent" },
];

export interface ParsedQuery {
  text: string;
  dates: DateToken[];
}

/** Strip date tokens out of the raw query, returning the remaining text + which
 *  date buckets were requested. Source ~678-682. */
export function parseQuery(raw: string | undefined): ParsedQuery {
  let text = (raw || "").toLowerCase();
  const dates: DateToken[] = [];
  for (const t of DATE_TOKENS) {
    if (t.re.test(text)) {
      dates.push(t.kind);
      text = text.replace(t.re, " ");
    }
  }
  return { text: text.replace(/\s+/g, " ").trim(), dates };
}

/** Does note `d` pass the requested date buckets? `openedOrder` is the list of note
 *  ids in most-recently-opened order (last = most recent) — needed for "recent".
 *  Source ~683-688. */
export function passesDate(
  d: DateFilterable,
  dates: DateToken[],
  openedOrder: Array<string | number> = [],
): boolean {
  if (!dates.length) return true;
  const b = dayBucket(d.created || d.d);
  return dates.some((k) =>
    k === "recent"
      ? openedOrder.includes(d.id as string | number)
      : k === "week"
        ? b === "today" || b === "yesterday" || b === "week"
        : b === k,
  );
}

/** Does note `d` pass the (already date-stripped) text query? Source ~689:
 *  `!text || (d.t+" "+d.c).toLowerCase().includes(text)`. */
export function passesText(d: TextFilterable, text: string): boolean {
  return !text || (d.t + " " + d.c).toLowerCase().includes(text);
}
