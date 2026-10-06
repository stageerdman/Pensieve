// The boolean engine: does a note satisfy a filter (and a tree of filters)? Pure and
// synchronous. Text/title matching uses whatever searchable text the caller supplies
// (title + tags always; body only if loaded) — full-text ranking/snippets live in
// match.ts; here we only answer yes/no.

import type { Filter, FilterNode } from "./types";
import { isGroup } from "./types";

/** The note shape the engine needs. `body` is optional (lazy-loaded). */
export interface SearchableNote {
  id: string;
  title: string;
  tags: string[];
  categories: string[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  body?: string;
}

/** Normalize a tag for comparison: drop a leading "#", trim, lowercase. */
export function normTag(s: string): string {
  return s.trim().replace(/^#/, "").toLowerCase();
}

function anyTag(noteTags: string[], wanted: string[]): boolean {
  const have = new Set(noteTags.map(normTag));
  return wanted.some((w) => have.has(normTag(w)));
}

function anyCategory(noteCats: string[], wanted: string[]): boolean {
  const have = new Set(noteCats.map((c) => c.trim().toLowerCase()));
  return wanted.some((w) => have.has(w.trim().toLowerCase()));
}

/** Does a single filter match the note? `now` is unused today but kept for symmetry
 *  with date resolution happening upstream (ranges are pre-resolved). */
export function matchFilter(filter: Filter, note: SearchableNote): boolean {
  switch (filter.kind) {
    case "tag":
      return anyTag(note.tags, filter.tags);
    case "category":
      return anyCategory(note.categories, filter.categories);
    case "date": {
      const ts = filter.field === "updated" ? note.updatedAt : note.createdAt;
      return ts >= filter.range.start && ts <= filter.range.end;
    }
    case "flag":
      return filter.flag === "pinned" ? note.pinned : false;
    case "title":
      return note.title.toLowerCase().includes(filter.text.toLowerCase());
    case "text": {
      const q = filter.text.toLowerCase();
      if (!q) return true;
      const hay = (
        note.title +
        " " +
        note.tags.join(" ") +
        " " +
        (note.body ?? "")
      ).toLowerCase();
      return hay.includes(q);
    }
  }
}

function matchNode(node: FilterNode, note: SearchableNote): boolean {
  if (isGroup(node)) {
    if (node.children.length === 0) return true;
    return node.relation === "or"
      ? node.children.some((c) => matchNode(c, note))
      : node.children.every((c) => matchNode(c, note));
  }
  return matchFilter(node.filter, note);
}

/** Top-level items are AND-combined (the default relation between stacked chips). */
export function matchTree(items: FilterNode[], note: SearchableNote): boolean {
  return items.every((n) => matchNode(n, note));
}
