// The one file-level seam the processing job needs (job checkpoints, snapshots). Vault-
// relative paths. Contract every implementation must keep: writeText and copyFile never
// leave the target half-written (temp + rename); remove of a missing file is a no-op;
// list of a missing folder is []. Tauri impl: lib/store/tauriVaultFiles.ts.
export interface VaultFiles {
  readText(rel: string): Promise<string | null>;
  writeText(rel: string, contents: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  /** File names (not paths) directly inside `rel`. */
  list(rel: string): Promise<string[]>;
  remove(rel: string): Promise<void>;
}
