// Load/save the sidebar state (saved views + active id). This is a device-local UI
// preference, not note data, so it lives in localStorage and never in the vault.
// Loaded views are merged over DEFAULT_VIEW so a view saved before a field existed
// still opens cleanly, and the pre-saved-views single-view format is migrated.

import { log } from "../logger";
import {
  DEFAULT_STATE,
  DEFAULT_VIEW,
  type PreviewLines,
  type SidebarState,
  type SidebarView,
} from "./view";

const KEY = "pensieve:sidebar:state";
const LEGACY_KEY = "pensieve:sidebar:view"; // single-view format (pre saved-views)

/** Fill a partial/legacy view over the defaults, migrating renamed fields. */
function normalizeView(raw: Record<string, unknown>): SidebarView {
  const r = raw as Partial<SidebarView>;
  const f = { ...((raw.fields as Record<string, unknown>) ?? {}) };
  // Legacy: `relativeTime` was the updated-relative toggle before it was split.
  if (f.relativeTime !== undefined && f.relativeUpdated === undefined) {
    f.relativeUpdated = f.relativeTime;
  }
  const lines = r.previewLines;
  const previewLines: PreviewLines = lines === 1 || lines === 2 || lines === 3 ? lines : DEFAULT_VIEW.previewLines;
  return {
    ...DEFAULT_VIEW,
    ...r,
    fields: { ...DEFAULT_VIEW.fields, ...(f as Partial<SidebarView["fields"]>) },
    previewLines,
    id: r.id ?? DEFAULT_VIEW.id,
    name: r.name ?? DEFAULT_VIEW.name,
  };
}

export function loadState(): SidebarState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarState>;
      const views = ((parsed.views ?? []) as unknown[]).map((v) =>
        normalizeView(v as Record<string, unknown>),
      );
      if (!views.length) return DEFAULT_STATE;
      const activeId = views.some((v) => v.id === parsed.activeId)
        ? parsed.activeId!
        : views[0].id;
      return { views, activeId };
    }
    // Migrate the old single-view config into a one-view state.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const view = normalizeView({ ...JSON.parse(legacy), id: "default", name: "Notes" });
      return { views: [view], activeId: "default" };
    }
    return DEFAULT_STATE;
  } catch {
    log.warn("sidebar", "state.load.failed");
    return DEFAULT_STATE;
  }
}

export function saveState(state: SidebarState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  log.debug("sidebar", "state.save", {
    views: state.views.length,
    active: state.activeId,
  });
}
