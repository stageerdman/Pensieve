// Load/save the active sidebar view. This is a device-local UI preference, not note
// data, so it lives in localStorage (identical in browser dev and the Tauri webview)
// and never in the portable .md vault. Loaded config is merged over DEFAULT_VIEW so
// a config saved before a new field existed still opens cleanly (forward-compat).

import { log } from "../logger";
import { DEFAULT_VIEW, type SidebarView } from "./view";

const KEY = "pensieve:sidebar:view";

export function loadView(): SidebarView {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw) as Partial<SidebarView>;
    return {
      ...DEFAULT_VIEW,
      ...parsed,
      fields: { ...DEFAULT_VIEW.fields, ...(parsed.fields ?? {}) },
    };
  } catch {
    log.warn("sidebar", "view.load.failed");
    return DEFAULT_VIEW;
  }
}

export function saveView(view: SidebarView): void {
  localStorage.setItem(KEY, JSON.stringify(view));
  log.debug("sidebar", "view.save", {
    sortKey: view.sortKey,
    dir: view.sortDir,
    group: view.group,
  });
}
