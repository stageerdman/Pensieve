// colorRuns.ts — the `{fg:… bg:…}text{/}` inline-colour sentinel (see extended.ts), as a
// pure, dependency-free module shared by the desktop codec, lib/forms and the phone.
//
// Only BlockNote's own palette NAMES are real Pensieve colours. Text pasted from another
// app (a web page, a dark-themed chat) arrives carrying that app's CSS colours —
// `rgb(26, 26, 26)`, `transparent` — which BlockNote keeps as textColor/backgroundColor.
// Those were once written to disk verbatim and, since no reader understood them, showed
// up as raw `{fg:rgb(…)}` text (owner report 2026-11-13). Now: never written, and any
// already on disk are dropped on read (the inner text is kept).

export const PALETTE: ReadonlySet<string> = new Set([
  "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink",
]);

export const isPaletteColor = (v: unknown): v is string => typeof v === "string" && PALETTE.has(v);

// A value is a CSS function (`rgb(1, 2, 3)`) or a bare word/hex (`red`, `#fff`, `transparent`).
const VAL = String.raw`(?:[\w-]+\([^)]*\)|[\w#.-]+)`;
const ATTRS = String.raw`(?:fg|bg):${VAL}(?:\s+(?:fg|bg):${VAL})?`;
/** Source of one colour run: group 1 = the attrs, group 2 = the text. */
export const COLOR_RUN_SOURCE = String.raw`\{(${ATTRS})\}([\s\S]*?)\{\/\}`;

/** The palette colours in an attr string; foreign values are left out. */
export function parseColorAttrs(attrs: string): { fg?: string; bg?: string } {
  const out: { fg?: string; bg?: string } = {};
  for (const m of attrs.matchAll(new RegExp(String.raw`(fg|bg):(${VAL})`, "g"))) {
    if (isPaletteColor(m[2])) out[m[1] as "fg" | "bg"] = m[2];
  }
  return out;
}

/** Rewrite a Markdown string so it carries only real colour runs: a run with no palette
 *  colour becomes its plain text; a mixed run keeps just its palette part. */
export function stripForeignColorRuns(text: string): string {
  if (!text.includes("{fg:") && !text.includes("{bg:")) return text;
  return text.replace(new RegExp(COLOR_RUN_SOURCE, "g"), (_all, attrs: string, inner: string) => {
    const { fg, bg } = parseColorAttrs(attrs);
    const kept = [fg && `fg:${fg}`, bg && `bg:${bg}`].filter(Boolean).join(" ");
    return kept ? `{${kept}}${inner}{/}` : inner;
  });
}

/** Plain text: every colour run → its inner text (palette or not). For titles, previews
 *  and other places that show no colour at all. */
export function plainColorRuns(text: string): string {
  if (!text.includes("{fg:") && !text.includes("{bg:")) return text;
  return text.replace(new RegExp(COLOR_RUN_SOURCE, "g"), (_all, _attrs: string, inner: string) => inner);
}
