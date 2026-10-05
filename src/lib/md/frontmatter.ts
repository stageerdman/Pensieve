// YAML frontmatter for note metadata. We own a tiny, deliberate subset — three
// keys (category, tags, links) — rather than pull a full YAML library, keeping the
// app lightweight. The body below the frontmatter is the Markdown source of truth.
//
//   ---
//   categories: [Notes & Lessons, In my mind]
//   tags: [goals, health]
//   links: [mut123-abc, mut456-def]
//   icon: round/blue
//   ---
//
//   # the note body…
//
// A file with no frontmatter loads with empty defaults (back-compat), and a note
// with no metadata is written WITHOUT a frontmatter block, so plain notes stay plain.

import { EMPTY_FIELDS, type NoteFields } from "../types";
import { encodeIcon, parseIcon } from "../flasks/icon";

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

/** Split raw file text into metadata fields + the Markdown body. */
export function parseFrontmatter(raw: string): { fields: NoteFields; body: string } {
  const m = raw.match(FENCE);
  if (!m) return { fields: { ...EMPTY_FIELDS }, body: raw };

  const fields: NoteFields = { categories: [], tags: [], links: [] };
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "categories") fields.categories = parseList(value);
    else if (key === "category") {
      const single = value.replace(/^["']|["']$/g, ""); // legacy single-category key
      if (single) fields.categories = [single];
    }
    else if (key === "tags") fields.tags = parseList(value);
    else if (key === "links") fields.links = parseList(value);
    else if (key === "icon") {
      const icon = parseIcon(value.replace(/^["']|["']$/g, ""));
      if (icon) fields.icon = icon;
    }
  }
  return { fields, body: raw.slice(m[0].length) };
}

function hasMeta(f: NoteFields): boolean {
  return (
    f.categories.length > 0 || f.tags.length > 0 || f.links.length > 0 || !!f.icon
  );
}

/** Compose metadata + body into file text. No metadata → body unchanged (plain). */
export function composeFrontmatter(fields: NoteFields, body: string): string {
  if (!hasMeta(fields)) return body;
  const lines: string[] = ["---"];
  if (fields.categories.length) lines.push(`categories: [${fields.categories.join(", ")}]`);
  lines.push(`tags: [${fields.tags.join(", ")}]`);
  lines.push(`links: [${fields.links.join(", ")}]`);
  if (fields.icon) lines.push(`icon: ${encodeIcon(fields.icon)}`);
  lines.push("---", "");
  return lines.join("\n") + "\n" + body;
}
