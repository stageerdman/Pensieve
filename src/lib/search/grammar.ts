// The "smart" parser: turn the raw Summon input into concrete, selectable filter
// suggestions + the leftover free text that stays live in the bar. Fully local and
// deterministic — no AI. The phrase vocabulary (see wiki.md) expands over time by adding
// recognizers here; each recognizer claims a character span so leftover text is simply
// everything unclaimed.
//
// It also exposes the active tag-whisper: when the caret sits in a "#…" token, we offer
// matching known tags. A space right after "#" escapes it to a literal "#" text search.

import type { Filter } from "./types";
import { resolveDatePhrase, DATE_PHRASES } from "./dates";
import { normTag } from "./evaluate";

/** Context the parser needs: the vocabulary in use (for tag + category matching). */
export interface ParseContext {
  tags: string[]; // tags in use, e.g. "#Weekly Review" or "planning"
  categories: string[]; // category names, e.g. "Notes & Lessons"
}

/** One proposed filter the user can confirm into a chip. */
export interface Suggestion {
  key: string; // stable within a parse (for React keys / de-dupe)
  filter: Filter;
  label: string; // chip/display label
  hint: string; // "date" | "tag" | "tags" | "category" | "flag"
  source?: [number, number]; // span in the input this came from (so confirm can splice
  // it out). Omitted for prefix suggestions that don't consume text (e.g. partial category).
}

export interface TagWhisper {
  prefix: string; // text after the "#", lowercased
  matches: string[]; // known tags that match, original form
  start: number; // span of the live "#…" token in the input …
  end: number; // … so callers can mask/replace it on selection
}

export interface ParseResult {
  suggestions: Suggestion[];
  text: string; // leftover free full-text (claimed spans removed)
  whisper?: TagWhisper; // present only while the caret is in a live "#…" token
}

interface Claim {
  start: number;
  end: number; // exclusive
  suggestion: Suggestion;
}

const FIELD_WORDS: Record<string, "created" | "updated"> = {
  created: "created",
  added: "created",
  updated: "updated",
  edited: "updated",
  modified: "updated",
};

/** Build the date-phrase matcher: optional field word + (known phrase | "last N unit"). */
function buildDateRegex(): RegExp {
  const phrases = DATE_PHRASES.map((p) => p.replace(/\s+/g, "\\s+")).join("|");
  const fields = Object.keys(FIELD_WORDS).join("|");
  // e.g. "created last month", "last 30 days", "this week"
  return new RegExp(
    `\\b(?:(${fields})\\s+)?(${phrases}|(?:last|past)\\s+\\d{1,4}\\s+(?:day|days|week|weeks|month|months))\\b`,
    "gi",
  );
}

function detectDates(input: string, now: number, claims: Claim[]): void {
  const re = buildDateRegex();
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const whole = m[0];
    const fieldWord = m[1]?.toLowerCase();
    const phrase = m[2];
    const resolved = resolveDatePhrase(phrase, now);
    if (!resolved) continue;
    const field = fieldWord ? FIELD_WORDS[fieldWord] : "created";
    const start = m.index;
    const end = start + whole.length;
    claims.push({
      start,
      end,
      suggestion: {
        key: `date:${field}:${resolved.label}`,
        filter: { kind: "date", field, range: resolved.range, phrase: resolved.label },
        label: `${field === "updated" ? "Updated" : "Created"} · ${resolved.label}`,
        hint: "date",
        source: [start, end],
      },
    });
  }
}

/** "tag(s) contains/one of/any of/is/are/in/: #A, #B" → one tag-set filter. List runs to
 *  end of input (owner convention: the list trails). */
function detectTagSet(input: string, ctx: ParseContext, claims: Claim[]): void {
  const re = /\btags?\s+(?:contains?\s+)?(?:(?:one|any)\s+of|is|are|in)\s+(.+)$|\btags?\s*:\s*(.+)$/i;
  const m = re.exec(input);
  if (!m) return;
  const listStr = (m[1] ?? m[2] ?? "").trim();
  if (!listStr) return;
  const parts = listStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return;
  // Resolve each part to a known tag (by normalized match) else keep the literal text.
  const tags = parts.map((p) => resolveKnownTag(p, ctx) ?? p.replace(/^#/, ""));
  claims.push({
    start: m.index,
    end: input.length,
    suggestion: {
      key: `tags:${tags.map(normTag).sort().join("|")}`,
      filter: { kind: "tag", tags },
      label: tags.map((t) => `#${t}`).join(" or "),
      hint: "tags",
      source: [m.index, input.length],
    },
  });
}

/** Longest known tag whose normalized form equals the normalized candidate. */
function resolveKnownTag(candidate: string, ctx: ParseContext): string | null {
  const want = normTag(candidate);
  let best: string | null = null;
  for (const t of ctx.tags) {
    if (normTag(t) === want) {
      const bare = t.replace(/^#/, "");
      if (!best || bare.length > best.length) best = bare;
    }
  }
  return best;
}

/** Single "#tag" tokens. Greedy: match the longest known tag starting at the "#". A "# "
 *  (space right after) is a literal escape and is left as text. */
function detectHashTags(input: string, ctx: ParseContext, claims: Claim[]): void {
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== "#") continue;
    // escape: "#" followed by whitespace or end → literal, skip.
    if (i + 1 >= input.length || /\s/.test(input[i + 1])) continue;
    const rest = input.slice(i + 1);
    // Try the longest known tag that is a case-insensitive prefix of `rest` on a word
    // boundary; else fall back to the first whitespace/comma-delimited word.
    const known = longestKnownTagPrefix(rest, ctx);
    const bare = known ?? rest.match(/^[^\s,]+/)?.[0] ?? "";
    if (!bare) continue;
    const end = i + 1 + bare.length;
    claims.push({
      start: i,
      end,
      suggestion: {
        key: `tag:${normTag(bare)}`,
        filter: { kind: "tag", tags: [bare] },
        label: `#${bare}`,
        hint: "tag",
        source: [i, end],
      },
    });
    i = end - 1;
  }
}

function longestKnownTagPrefix(rest: string, ctx: ParseContext): string | null {
  const lowerRest = rest.toLowerCase();
  let best: string | null = null;
  for (const t of ctx.tags) {
    const bare = t.replace(/^#/, "");
    const lb = bare.toLowerCase();
    if (lowerRest.startsWith(lb)) {
      // must end on a word boundary (end of string or a non-word char follows)
      const after = rest[bare.length];
      if (after === undefined || /[\s,]/.test(after)) {
        if (!best || bare.length > best.length) best = rest.slice(0, bare.length);
      }
    }
  }
  return best;
}

function detectFlags(input: string, claims: Claim[]): void {
  const re = /\bpinned\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    claims.push({
      start: m.index,
      end: m.index + m[0].length,
      suggestion: {
        key: "flag:pinned",
        filter: { kind: "flag", flag: "pinned" },
        label: "Pinned",
        hint: "flag",
        source: [m.index, m.index + m[0].length],
      },
    });
  }
}

function detectCategories(input: string, ctx: ParseContext, claims: Claim[]): void {
  const lower = input.toLowerCase();
  for (const c of ctx.categories) {
    const name = c.toLowerCase();
    if (!name) continue;
    let from = 0;
    let idx: number;
    while ((idx = lower.indexOf(name, from)) !== -1) {
      const before = input[idx - 1];
      const after = input[idx + name.length];
      const boundaryBefore = before === undefined || /[\s]/.test(before);
      const boundaryAfter = after === undefined || /[\s]/.test(after);
      if (boundaryBefore && boundaryAfter) {
        claims.push({
          start: idx,
          end: idx + name.length,
          suggestion: {
            key: `category:${name}`,
            filter: { kind: "category", categories: [c] },
            label: c,
            hint: "category",
            source: [idx, idx + name.length],
          },
        });
      }
      from = idx + name.length;
    }
  }
}

/** Category suggestions from a free-text fragment: any category whose name contains the
 *  fragment (case-insensitive, fragment ≥ 2 chars). These are *suggested*, not claimed —
 *  the text stays live so plain Enter still searches it; Tab+Enter picks the category. */
function categoryMatchesFor(fragment: string, ctx: ParseContext): Suggestion[] {
  const f = fragment.trim().toLowerCase();
  if (f.length < 2) return [];
  const out: Suggestion[] = [];
  for (const c of ctx.categories) {
    const name = c.toLowerCase();
    if (name === f) continue; // exact → already handled as a full claim
    if (name.includes(f)) {
      out.push({
        key: `category:${name}`,
        filter: { kind: "category", categories: [c] },
        label: c,
        hint: "category",
      });
    }
  }
  return out;
}

/** The active tag-whisper: if the caret sits inside a live "#…" token (the token under
 *  the caret starts with "#" and has no space after the #), offer matching known tags. */
export function tagWhisperAt(input: string, caret: number, ctx: ParseContext): TagWhisper | undefined {
  // find the token boundaries around the caret
  let start = caret;
  while (start > 0 && !/\s/.test(input[start - 1])) start--;
  let end = caret;
  while (end < input.length && !/\s/.test(input[end])) end++;
  const token = input.slice(start, end);
  if (!token.startsWith("#")) return undefined;
  const prefix = token.slice(1); // text after '#'
  // a literal escape ("# ") never reaches here (space breaks the token)
  const pl = prefix.toLowerCase();
  const matches = ctx.tags.filter((t) => {
    const bare = normTag(t);
    return pl === "" ? true : bare.includes(pl);
  });
  // de-dupe by normalized form, keep original, cap for UI
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const t of matches) {
    const n = normTag(t);
    if (seen.has(n)) continue;
    seen.add(n);
    uniq.push(t);
    if (uniq.length >= 8) break;
  }
  return { prefix: pl, matches: uniq, start, end };
}

/** Remove the given spans and collapse whitespace → the leftover free text. */
function leftoverText(input: string, spans: Array<{ start: number; end: number }>): string {
  if (spans.length === 0) return input.trim();
  const chars = input.split("");
  for (const s of spans) {
    for (let i = s.start; i < s.end && i < chars.length; i++) chars[i] = " ";
  }
  return chars.join("").replace(/\s+/g, " ").trim();
}

/** Drop claims that overlap an earlier (lower-start, or longer) claim. */
function resolveOverlaps(claims: Claim[]): Claim[] {
  const sorted = [...claims].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Claim[] = [];
  let lastEnd = -1;
  for (const c of sorted) {
    if (c.start >= lastEnd) {
      kept.push(c);
      lastEnd = c.end;
    }
  }
  return kept;
}

/**
 * Parse the full input into filter suggestions + leftover live text. `caret` (default:
 * end of input) drives the active tag-whisper. `now` is injectable for tests.
 */
export function parseQuery(
  input: string,
  ctx: ParseContext,
  now: number = Date.now(),
  caret: number = input.length,
): ParseResult {
  const raw: Claim[] = [];
  // Order matters only for overlap resolution (earlier-start / longer wins); the tag-set
  // phrase is most specific so detect it first, then dates, hashtags, flags, categories.
  detectTagSet(input, ctx, raw);
  detectDates(input, now, raw);
  detectHashTags(input, ctx, raw);
  detectFlags(input, raw);
  detectCategories(input, ctx, raw);

  const resolved = resolveOverlaps(raw);

  // A tag-set list ("tag one of #A, #B") owns its "#" tokens — don't let the trailing one
  // trigger a single-tag whisper. Otherwise the whisper claims the live "#…" token.
  const candidate = tagWhisperAt(input, caret, ctx);
  const inTagSet =
    candidate &&
    resolved.some(
      (c) => c.suggestion.hint === "tags" && c.start < candidate.end && c.end > candidate.start,
    );
  const whisper = inTagSet ? undefined : candidate;

  // The token being actively typed as a tag is owned by the whisper: drop any committed
  // suggestion overlapping it and mask it out of the leftover live text.
  const inWhisper = (c: Claim) =>
    whisper ? c.start < whisper.end && c.end > whisper.start : false;

  const claims = resolved.filter((c) => !inWhisper(c));
  // de-dupe suggestions by key, preserving order
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const c of claims) {
    if (seen.has(c.suggestion.key)) continue;
    seen.add(c.suggestion.key);
    suggestions.push(c.suggestion);
  }

  const spans: Array<{ start: number; end: number }> = claims.map((c) => ({ start: c.start, end: c.end }));
  if (whisper) spans.push({ start: whisper.start, end: whisper.end });
  const text = leftoverText(input, spans);

  // Prefix/substring category suggestions from the leftover text (don't consume it).
  if (!whisper && text) {
    for (const s of categoryMatchesFor(text, ctx)) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        suggestions.push(s);
      }
    }
  }

  return { suggestions, text, whisper };
}
