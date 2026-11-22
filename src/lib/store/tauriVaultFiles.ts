// The vault's raw file operations over the Tauri commands (src-tauri/src/lib.rs) — for the
// few local-only areas that aren't notes (processing jobs, snapshots). Every write and
// copy is atomic on the Rust side (temp file + rename).
import { invoke } from "@tauri-apps/api/core";
import type { VaultFiles } from "../raw/job/vaultFiles";

export const tauriVaultFiles: VaultFiles = {
  readText: (rel) => invoke<string | null>("read_text", { rel }),
  writeText: (rel, contents) => invoke<void>("write_text", { rel, contents }),
  copyFile: (from, to) => invoke<void>("copy_file", { from, to }),
  list: (rel) => invoke<string[]>("list_dir", { rel }),
  remove: (rel) => invoke<void>("remove_path", { rel }),
};
