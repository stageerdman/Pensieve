// Test-only: VaultFiles on a real folder, with the same temp-then-rename writes as the
// Rust side (src-tauri/src/util.rs: `.<name>.tmp`, fsync, rename). Used by the SIGKILL
// test's child process, and by the parent to read the folder back.
import * as fs from "node:fs";
import * as path from "node:path";
import type { VaultFiles } from "../vaultFiles";

function atomicWrite(abs: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.tmp`);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, abs);
}

/** `afterWrite` runs (synchronously) after every completed write — the kill hook. */
export function nodeFiles(root: string, afterWrite: () => void = () => undefined): VaultFiles {
  const abs = (rel: string) => path.join(root, rel);
  return {
    async readText(rel) {
      return fs.existsSync(abs(rel)) ? fs.readFileSync(abs(rel), "utf8") : null;
    },
    async writeText(rel, contents) {
      atomicWrite(abs(rel), Buffer.from(contents, "utf8"));
      afterWrite();
    },
    async copyFile(from, to) {
      atomicWrite(abs(to), fs.readFileSync(abs(from)));
      afterWrite();
    },
    async list(rel) {
      if (!fs.existsSync(abs(rel))) return [];
      return fs.readdirSync(abs(rel), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    },
    async remove(rel) {
      fs.rmSync(abs(rel), { force: true });
      afterWrite();
    },
  };
}

/** Every file under `root`, as vault-relative path → contents (what problemsIn checks). */
export function readTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of fs.readdirSync(root, { recursive: true }) as string[]) {
    const p = path.join(root, rel);
    if (fs.statSync(p).isFile()) out.set(rel.split(path.sep).join("/"), fs.readFileSync(p, "utf8"));
  }
  return out;
}
