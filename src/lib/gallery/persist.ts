// Load/save the gallery state (display fields + settings + working set). These are
// device-local UI preferences, not note data, so they live in localStorage and never
// in the vault. Loaded fields are merged over the defaults so a state saved before a
// field existed still opens cleanly.
//
// The working set is stored under its own key and only when workingSetPersist is true;
// toggling persistence off clears it, so a session-only working set leaves no trace.

import { log } from "../logger";
import {
  DEFAULT_GALLERY_STATE,
  type GalleryState,
  type SnippetLines,
} from "./view";

const STATE_KEY = "pensieve:gallery:state"; // fields + settings
const WORKING_SET_KEY = "pensieve:gallery:workingset"; // note ids

function normalizeLines(v: unknown): SnippetLines {
  return v === 1 || v === 2 || v === 3 ? v : DEFAULT_GALLERY_STATE.snippetLines;
}

/** The persisted shape of everything except the working set. */
interface PersistedState {
  fields?: Partial<GalleryState["fields"]>;
  snippetLines?: unknown;
  settings?: Partial<GalleryState["settings"]>;
}

export function loadGalleryState(): GalleryState {
  let fields = DEFAULT_GALLERY_STATE.fields;
  let snippetLines = DEFAULT_GALLERY_STATE.snippetLines;
  let settings = DEFAULT_GALLERY_STATE.settings;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PersistedState;
      fields = { ...DEFAULT_GALLERY_STATE.fields, ...(p.fields ?? {}) };
      snippetLines = normalizeLines(p.snippetLines);
      settings = { ...DEFAULT_GALLERY_STATE.settings, ...(p.settings ?? {}) };
    }
  } catch {
    log.warn("gallery", "state.load.failed");
  }

  // The working set is only honoured when persistence is on.
  let workingSet: string[] = [];
  if (settings.workingSetPersist) {
    try {
      const raw = localStorage.getItem(WORKING_SET_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) workingSet = ids.filter((x) => typeof x === "string");
      }
    } catch {
      log.warn("gallery", "workingset.load.failed");
    }
  }

  return { fields, snippetLines, settings, workingSet };
}

/** Persist fields + settings (never the working set — see saveWorkingSet). */
export function saveGalleryState(state: GalleryState): void {
  const payload: PersistedState = {
    fields: state.fields,
    snippetLines: state.snippetLines,
    settings: state.settings,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  log.debug("gallery", "state.save", { ...state.fields, lines: state.snippetLines });
}

/** Persist the working set when persistence is on; clear its key when off. */
export function saveWorkingSet(ids: string[], persist: boolean): void {
  if (persist) {
    localStorage.setItem(WORKING_SET_KEY, JSON.stringify(ids));
    log.debug("gallery", "workingset.save", { count: ids.length });
  } else {
    localStorage.removeItem(WORKING_SET_KEY);
  }
}
