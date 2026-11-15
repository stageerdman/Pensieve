// The tag vocabulary — what a tag IS in Pensieve: a THREAD, a promise to retrieve.
// A tag names something the owner will deliberately pull up later (a project like
// @CANI, a practice like @Success Bag, a focus to study one day like @Sales Mindset).
// It is never a description: words in the text are found by search, the kind of note
// is its category, importance is starred/pinned. See UX.md "Tags are threads".
//
// The vocabulary (<vault>/tags.json) holds each thread's name + an optional one-line
// definition ("what belongs here"), so threads exist before any note uses them and AI
// (desktop, only when asked) can reuse the right one instead of inventing a near-dup.
// Pure helpers only — persistence is in ./store, React state in hooks/useTagVocab.

export interface TagDef {
  name: string;
  /** One line: what belongs in this thread. Shown in the whisper, read by AI. */
  definition?: string;
}

/** Comparison key: case-, space- and leading-#-insensitive ("@sales  mindset" ≡ "@Sales Mindset"). */
export function tagKey(name: string): string {
  return name.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase();
}

/** Tidy a typed tag: trim, collapse spaces, drop a trailing comma / leading '#'. */
export function cleanTag(raw: string): string {
  return raw.trim().replace(/,+$/, "").replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

/** The existing spelling of `name` (from the vocabulary or tags in use), else null. */
export function canonicalTag(name: string, known: string[]): string | null {
  const k = tagKey(name);
  return known.find((t) => tagKey(t) === k) ?? null;
}

export function sanitizeVocab(parsed: unknown): TagDef[] {
  const list = (parsed as { tags?: unknown })?.tags ?? parsed;
  if (!Array.isArray(list)) return [];
  const out: TagDef[] = [];
  for (const d of list) {
    const name = typeof d?.name === "string" ? cleanTag(d.name) : "";
    if (!name || name.includes(",") || out.some((x) => tagKey(x.name) === tagKey(name))) continue;
    const definition = typeof d?.definition === "string" && d.definition.trim() ? d.definition.trim() : undefined;
    out.push(definition ? { name, definition } : { name });
  }
  return out;
}

export interface TagSuggestion {
  name: string;
  definition?: string;
  uses: number;
}

/**
 * Everything the whisper can offer: vocabulary threads ∪ tags in use on notes,
 * merged case-insensitively (vocabulary spelling wins), ranked by how many notes use
 * them (a live thread floats up), then name.
 */
export function buildSuggestions(vocab: TagDef[], noteTags: string[][]): TagSuggestion[] {
  const byKey = new Map<string, TagSuggestion>();
  for (const d of vocab) byKey.set(tagKey(d.name), { name: d.name, definition: d.definition, uses: 0 });
  for (const tags of noteTags) {
    for (const t of new Set(tags.map(tagKey))) {
      const hit = byKey.get(t);
      if (hit) hit.uses += 1;
    }
    for (const t of tags) {
      const k = tagKey(t);
      if (!byKey.has(k)) byKey.set(k, { name: t, uses: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}

/**
 * The whisper list for a draft: substring match on name (or definition), excluding
 * tags already on the note. An empty draft offers the top threads, so the small
 * vocabulary is one glance away.
 */
export function whisper(suggestions: TagSuggestion[], draft: string, onNote: string[], limit = 6): TagSuggestion[] {
  const taken = new Set(onNote.map(tagKey));
  const q = tagKey(draft);
  return suggestions
    .filter((s) => !taken.has(tagKey(s.name)))
    .filter((s) => !q || tagKey(s.name).includes(q) || (s.definition?.toLowerCase().includes(q) ?? false))
    .slice(0, limit);
}
