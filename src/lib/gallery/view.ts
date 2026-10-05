// The gallery "view" — what each memory shows under its flask, plus the device-local
// settings the gallery owns (working-set persistence). The gallery is always sorted by
// creation date and grouped into Apple-Photos-style relative date buckets (see
// buckets.ts), so — unlike the old sidebar view — sort and group are NOT configurable
// here; only the per-memory display fields are.

/** Which per-memory fields render under the always-shown title. */
export interface GalleryFields {
  snippet: boolean; // a little of the actual content (from NoteMeta.excerpt)
  category: boolean; // category colour dot(s)
  tags: boolean; // tag chips
  createdRelative: boolean; // "3d ago" (from createdAt)
  createdAbs: boolean; // "Sep 28" (from createdAt)
}

/** How many lines the content snippet may occupy. */
export type SnippetLines = 1 | 2 | 3;

/** Device-local gallery settings (not note data). */
export interface GallerySettings {
  // Keep the working set between sessions. When false the working set is cleared on
  // quit (session-only). Default true.
  workingSetPersist: boolean;
}

/** The complete gallery configuration + state the UI reads. */
export interface GalleryState {
  fields: GalleryFields;
  snippetLines: SnippetLines;
  settings: GallerySettings;
  // Note ids saved to the working-set strip, in display order. Persisted only when
  // settings.workingSetPersist is true (see persist.ts).
  workingSet: string[];
}

/** The calm default: flask + title + two lines of content + a category dot. */
export const DEFAULT_GALLERY_STATE: GalleryState = {
  fields: {
    snippet: true,
    category: true,
    tags: false,
    createdRelative: false,
    createdAbs: false,
  },
  snippetLines: 2,
  settings: { workingSetPersist: true },
  workingSet: [],
};
