// Assembles the real (Tauri-only) I/O dependencies processRawBatch needs: copying a
// page photo into a new note's media folder and resolving its absolute path (for the
// vision subprocess to Read). Only ever imported where a Tauri context is already
// guaranteed (see useProcessQueue.ts) — no browser fallback, matching "AI is a
// desktop-only capability" (CLAUDE.md).
import { vaultRoot } from "../store/tauri";
import { tauriVaultFiles } from "../store/tauriVaultFiles";
import type { Store } from "../types";
import { describePageViaClaude } from "./describePageTauri";
import type { ProcessRawBatchDeps } from "./processRawBatch";

export function buildTauriRawBatchDeps(store: Pick<Store, "save" | "saveTranscript">): ProcessRawBatchDeps {
  return {
    store,
    describePage: describePageViaClaude,
    resolveAbsolutePath: async (ref: string) => `${await vaultRoot()}/${ref}`,
    copyMedia: (fromRef, toRef) => tauriVaultFiles.copyFile(fromRef, toRef),
  };
}
