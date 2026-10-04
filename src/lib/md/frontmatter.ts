// YAML frontmatter for note metadata. We own a tiny, deliberate subset — three
// keys (category, tags, links) — rather than pull a full YAML library, keeping the
// app lightweight. The body below the frontmatter is the Markdown source of truth.
//
//   ---
//   category: Notes & Lessons
//   tags: [goals, health]
//   links: [mut123-abc, mut456-def]
//   ---
//
//   # the note body…
//
// A file with no frontmatter loads with empty defaults (back-compat), and a note
// with no metadata is written WITHOUT a frontmatter block, so plain notes stay plain.

import { CATEGORIES, EMPTY_FIELDS, type Category, type NoteFields } from "../types";

// Matches the leading frontmatter block and the single blank line that separates
// it from the body, so the captured body starts at the first real content line.
const FENCE = /^---\n([\s\S]*?)\n---\n?\n?/;

function parseList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function asCategory(value: string): Category | undefined {
  const v = value.trim().replace(/^["']|["']$/g, "");
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : undefined;
}

/** Split raw file text into metadata fields + the Markdown body. */
export function parseFrontmatter(raw: string): { fields: NoteFields; body: string } {
  const m = raw.match(FENCE);
  if (!m) return { fields: { ...EMPTY_FIELDS }, body: raw };

  const fields: NoteFields = { ...EMPTY_FIELDS, tags: [], links: [] };
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "category") fields.category = asCategory(value);
    else if (key === "tags") fields.tags = parseList(value);
    else if (key === "links") fields.links = parseList(value);
  }
  return { fields, body: raw.slice(m[0].length) };
}

function hasMeta(f: NoteFields): boolean {
  return Boolean(f.category) || f.tags.length > 0 || f.links.length > 0;
}

/** Compose metadata + body into file text. No metadata → body unchanged (plain). */
export function composeFrontmatter(fields: NoteFields, body: string): string {
  if (!hasMeta(fields)) return body;
  const lines: string[] = ["---"];
  if (fields.category) lines.push(`category: ${fields.category}`);
  lines.push(`tags: [${fields.tags.join(", ")}]`);
  lines.push(`links: [${fields.links.join(", ")}]`);
  lines.push("---", "");
  return lines.join("\n") + "\n" + body;
}
