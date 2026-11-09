// Assembles the real (Tauri-only) I/O dependencies processRawBatch needs: reading a
// page's bytes back out (for duplicating it into a new note's media folder) and
// resolving its absolute path (for the vision subprocess to Read). Only ever imported
// where a Tauri context is already guaranteed (see useProcessQueue.ts) — no browser
// fallback, matching "AI is a desktop-only capability" (CLAUDE.md).
import { vaultRoot } from "../store/tauri";
import { parseMediaPath } from "../media/ref";
import type { Store } from "../types";
import { describePageViaClaude } from "./describePageTauri";
import type { ProcessRawBatchDeps } from "./processRawBatch";

export function buildTauriRawBatchDeps(
  store: Pick<Store, "create" | "save" | "saveMedia" | "saveTranscript" | "loadMediaUrl">,
): ProcessRawBatchDeps {
  return {
    store,
    describePage: describePageViaClaude,
    resolveAbsolutePath: async (ref: string) => `${await vaultRoot()}/${ref}`,
    readMediaBytes: async (ref: string) => {
      const url = await store.loadMediaUrl(ref);
      if (!url) throw new Error(`page media missing: ${ref}`);
      const bytes = await (await fetch(url)).arrayBuffer();
      const ext = parseMediaPath(ref)?.ext ?? "jpg";
      return { bytes, ext };
    },
  };
}
