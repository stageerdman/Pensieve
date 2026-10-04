// The sidebar "view" — how the notes list is ordered, divided, and what each row
// shows. One active view is persisted per device (see persist.ts). It is pure
// configuration; the actual ordering/grouping happens in arrange.ts.
//
// The shape deliberately carries `id`/`name` so that a future "named saved views"
// feature is a purely additive change (wrap the single view in { views[], activeId }
// and add a switcher) — no field changes, no data migration.

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
  relativeTime: boolean; // "2h ago"
  updatedAbs: boolean; // "Oct 3"
  createdAbs: boolean; // "made Sep 28"
  category: boolean; // category colour dot(s)
  tags: boolean; // tag chips
  preview: boolean; // first line of the body (from NoteMeta.excerpt)
}

/** A complete sidebar configuration. One of these is always active. */
export interface SidebarView {
  id: string; // "default" for the built-in; a generated id for user-saved views
  name: string; // "Notes" for default; a user label otherwise
  sortKey: SortKey;
  sortDir: SortDir;
  group: GroupMode;
  fields: SidebarFields;
}

/** The calm default — deliberately equal to the pre-SIDEBAR-UX behaviour: a flat
 *  list, newest-updated first, showing only the relative time under the title. */
export const DEFAULT_VIEW: SidebarView = {
  id: "default",
  name: "Notes",
  sortKey: "updatedAt",
  sortDir: "desc",
  group: "none",
  fields: {
    relativeTime: true,
    updatedAbs: false,
    createdAbs: false,
    category: false,
    tags: false,
    preview: false,
  },
};

/** The grouping actually used for rendering. Sorting by name inside date buckets
 *  reads as broken ("why is Apple above Banana under Today?"), so name-sort +
 *  date-grouping collapses to a flat A–Z list. The stored `group` is left intact
 *  so switching back to a date sort restores the buckets. */
export function effectiveGroup(view: SidebarView): GroupMode {
  if (view.sortKey === "title" && view.group === "date") return "none";
  return view.group;
}
