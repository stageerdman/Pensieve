// inherit.ts — a memory made from a form carries the form's labels (categories + tags).
// A union, never a copy: whatever the memory already had stays, the form's labels are added
// after it, de-duplicated (tags case-insensitively, ignoring a leading "#").
//
// Pure + dependency-free (shared with the phone PWA).

export interface Labels {
  categories: string[];
  tags: string[];
}

const tagKey = (t: string) => t.trim().replace(/^#/, "").toLowerCase();
const categoryKey = (c: string) => c.trim().toLowerCase();

function union(own: string[], inherited: string[], key: (s: string) => string): string[] {
  const seen = new Set(own.map(key));
  const out = [...own];
  for (const v of inherited) {
    const k = key(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** `note` with the form template's categories and tags added to its own. */
export function inheritLabels<T extends Labels>(note: T, template: Partial<Labels>): T {
  return {
    ...note,
    categories: union(note.categories, template.categories ?? [], categoryKey),
    tags: union(note.tags, template.tags ?? [], tagKey),
  };
}
