// Load/save the tag vocabulary (see ./vocab). Workspace data, so it lives in the vault
// at <vault>/tags.json via the same read_text/write_text commands as categories.json;
// the desktop MCP server (src-tauri/src/mcp/tools.rs) reads + appends to the same file.
// In the browser (dev) it mirrors to localStorage. A missing file = empty vocabulary.

import { sanitizeVocab, type TagDef } from "./vocab";
import { log } from "../logger";

const FILE = "tags.json";
const LS_KEY = "pensieve:tags";
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function loadTagVocab(): Promise<TagDef[]> {
  try {
    if (inTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string | null>("read_text", { rel: FILE });
      return raw ? sanitizeVocab(JSON.parse(raw)) : [];
    }
    const raw = localStorage.getItem(LS_KEY);
    return raw ? sanitizeVocab(JSON.parse(raw)) : [];
  } catch {
    log.warn("tags", "vocab.load.failed");
    return [];
  }
}

export async function saveTagVocab(defs: TagDef[]): Promise<void> {
  const payload = JSON.stringify({ version: 1, tags: defs }, null, 2);
  try {
    if (inTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_text", { rel: FILE, contents: payload });
    } else {
      localStorage.setItem(LS_KEY, payload);
    }
    log.debug("tags", "vocab.save", { count: defs.length });
  } catch {
    log.warn("tags", "vocab.save.failed");
  }
}
