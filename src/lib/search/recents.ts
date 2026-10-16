// Recent Accio searches — a small, device-local memory of the queries the owner has
// actually run, so the bar can suggest them back. Pure + localStorage only; NEVER synced
// (journaling queries are sensitive — same rule as the phone app's recents). The UI shows
// the most-recent FITTING queries first: typing "las" offers "last 7 days", not "late…".

const KEY = "pensieve.recentSearches";
const CAP = 25; // rolling buffer kept on disk; the dropdown shows a small slice of it

/** Normalize a query for storage/compare: trim + collapse inner whitespace. */
function norm(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}

export function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveRecents(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / unavailable — recents are best-effort */
  }
}

/** Add a query to the front: case-insensitively de-duped (a re-run moves it to the top,
 *  never duplicates), capped. Queries shorter than 2 chars are ignored (noise). Returns the
 *  SAME reference when nothing changed, so callers can skip a redundant write. */
export function addRecent(list: string[], query: string): string[] {
  const q = norm(query);
  if (q.length < 2) return list;
  const lower = q.toLowerCase();
  const rest = list.filter((x) => x.toLowerCase() !== lower);
  // Already at the front and unchanged → no-op.
  if (rest.length === list.length - 1 && list[0]?.toLowerCase() === lower) return list;
  return [q, ...rest].slice(0, CAP);
}

/** The recents that FIT what's typed: case-insensitive prefix match, recency order
 *  preserved, with an exact echo of the current input suppressed (it'd be a no-op row).
 *  An empty input returns the most-recent `limit` queries. */
export function matchRecents(list: string[], input: string, limit: number): string[] {
  const p = norm(input).toLowerCase();
  const out: string[] = [];
  for (const q of list) {
    const ql = q.toLowerCase();
    if (ql === p) continue; // don't echo exactly what's already typed
    if (p === "" || ql.startsWith(p)) out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}
