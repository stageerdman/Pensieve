// Test-only: an in-memory vault disk that can be "killed" at the n-th write. After the
// kill every further operation fails too — the process is gone, so not even an error
// handler gets to write. Each write is all-or-nothing, like the real atomic writes.
import type { VaultFiles } from "../vaultFiles";

export class ProcessKilled extends Error {
  constructor(step: number) {
    super(`process killed at write #${step}`);
    this.name = "ProcessKilled";
  }
}

export function memoryFiles(disk = new Map<string, string>()) {
  let writes = 0;
  let killAt = Infinity;
  let dead = false;

  const mutate = (apply: () => void) => {
    if (dead) throw new ProcessKilled(writes);
    writes += 1;
    if (writes === killAt) {
      dead = true;
      throw new ProcessKilled(writes);
    }
    apply();
  };
  const alive = () => {
    if (dead) throw new ProcessKilled(writes);
  };

  const files: VaultFiles = {
    async readText(rel) {
      alive();
      return disk.get(rel) ?? null;
    },
    async writeText(rel, contents) {
      mutate(() => disk.set(rel, contents));
    },
    async copyFile(from, to) {
      const v = disk.get(from);
      if (v === undefined) throw new Error(`copy: missing ${from}`);
      mutate(() => disk.set(to, v));
    },
    async list(rel) {
      alive();
      const prefix = rel + "/";
      return [...disk.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).map((k) => k.slice(prefix.length));
    },
    async remove(rel) {
      mutate(() => disk.delete(rel));
    },
  };

  return {
    disk,
    files,
    /** Kill the "process" on the n-th write from now (1-based). */
    killAtWrite(n: number) {
      killAt = writes + n;
    },
    writesSoFar: () => writes,
  };
}
