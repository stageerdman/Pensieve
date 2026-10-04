// The sidebar "view" — how the notes list is ordered, divided, and what each row
// shows. The app keeps a small collection of named views and one active id, so the
// owner can save several lenses and switch between them.

/** How the list is ordered. Keys map directly onto NoteMeta fields. */
export type SortKey = "updatedAt" | "createdAt" | "title";
export type SortDir = "asc" | "desc";

/** How the list is divided into sections. Pinning is NOT a mode — it is an
 *  always-on band applied on top of whichever mode is active (see arrange.ts). */
export type GroupMode =
  | "none" // flat list
  | "date" // Today / Yesterday / This week / This month / Earlier
  | "category"; // one section per Category, plus "Uncategorised"

/** Which per-note fields render under the title. Pure display toggles; the title
 *  itself is always shown and is not a field here. */
export interface SidebarFields {
  relativeUpdated: boolean; // "2h ago" (from updatedAt)
  relativeCreated: boolean; // "3d ago" (from createdAt)
  updatedAbs: boolean; // "Oct 3"
  createdAbs: boolean; // "Sep 28"
  category: boolean; // category colour dot(s)
  tags: boolean; // tag chips
  preview: boolean; // first lines of the body (from NoteMeta.excerpt)
}

/** How many lines the preview snippet may occupy. */
export type PreviewLines = 1 | 2 | 3;

/** A complete sidebar configuration. One of these is always active. */
export interface SidebarView {
  id: string; // "default" for the built-in; a generated id for user-saved views
  name: string; // "Notes" for default; a user label otherwise
  sortKey: SortKey;
  sortDir: SortDir;
  group: GroupMode;
  fields: SidebarFields;
  previewLines: PreviewLines;
}

/** The persisted state: the set of saved views and which one is active. */
export interface SidebarState {
  views: SidebarView[];
  activeId: string;
}

/** The calm default — a flat list, newest-updated first, showing only the relative
 *  update time under the title. */
export const DEFAULT_VIEW: SidebarView = {
  id: "default",
  name: "Notes",
  sortKey: "updatedAt",
  sortDir: "desc",
  group: "none",
  fields: {
    relativeUpdated: true,
    relativeCreated: false,
    updatedAbs: false,
    createdAbs: false,
    category: false,
    tags: false,
    preview: false,
  },
  previewLines: 2,
};

export const DEFAULT_STATE: SidebarState = {
  views: [DEFAULT_VIEW],
  activeId: "default",
};

/** The grouping actually used for rendering. Sorting by name inside date buckets
 *  reads as broken, so name-sort + date-grouping collapses to a flat A–Z list. The
 *  stored `group` is left intact so switching back to a date sort restores buckets. */
export function effectiveGroup(view: SidebarView): GroupMode {
  if (view.sortKey === "title" && view.group === "date") return "none";
  return view.group;
}

/** The active view from a state (falls back to the first view, then the default). */
export function activeView(state: SidebarState): SidebarView {
  return (
    state.views.find((v) => v.id === state.activeId) ?? state.views[0] ?? DEFAULT_VIEW
  );
}
