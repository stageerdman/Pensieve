// @vitest-environment node
// The kill test, real-process form: a separate Node process runs an app start on a real
// folder and is SIGKILLed (no cleanup, no finally, no flush) right after its n-th write.
// A second process then starts on the same folder and must finish the job — every batch
// done exactly once, the same Memories as an uninterrupted run, nothing lost or torn.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanRun, problemsIn, seedBatches } from "./testkit/scenario";
import { nodeFiles, readTree } from "./testkit/nodeFiles.node";

const here = path.dirname(fileURLToPath(import.meta.url));
let work: string;
let child: string;
let reference: Awaited<ReturnType<typeof cleanRun>>;

beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "pensieve-kill-"));
  child = path.join(work, "killChild.mjs");
  await build({
    entryPoints: [path.join(here, "testkit/killChild.node.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: child,
    logLevel: "silent",
  });
  reference = await cleanRun();
});

afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

/** Start the child on `vault`; SIGKILL it once it reports write #killAfter (if given). */
function runChild(vault: string, killAfter?: number): Promise<{ code: number | null; signal: NodeJS.Signals | null; out: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [child, vault], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (killAfter !== undefined && out.includes(`@@W ${killAfter}\n`)) p.kill("SIGKILL");
    });
    p.stderr.on("data", (chunk: Buffer) => (out += chunk.toString()));
    p.on("error", reject);
    p.on("exit", (code, signal) => resolve({ code, signal, out }));
  });
}

async function freshVault(name: string): Promise<string> {
  const vault = path.join(work, name);
  await seedBatches(nodeFiles(vault));
  return vault;
}

describe("crash-safe processing — real process SIGKILLed mid-batch", () => {
  it("an uninterrupted child run matches the in-memory reference", async () => {
    const vault = await freshVault("clean");
    const run = await runChild(vault);
    expect(run.out).toContain("@@DONE");
    expect(problemsIn(readTree(vault), reference.outputs)).toEqual([]);
  }, 30_000);

  it("killed at several points → the restart finishes, every batch done exactly once", async () => {
    // spread across the whole run: job start, snapshot, describe checkpoints, Memory
    // writes, the commit point, cleanup — and into the second batch
    const n = reference.writes;
    const points = [...new Set([1, 2, 4, 7, 10, 14, Math.floor(n / 2), n - 6, n - 3, n - 1].filter((k) => k >= 1 && k < n))];
    for (const k of points) {
      const vault = await freshVault(`kill-${k}`);
      const killed = await runChild(vault, k);
      expect(killed.signal, `kill after write #${k}`).toBe("SIGKILL");
      expect(killed.out).not.toContain("@@DONE");

      const restart = await runChild(vault);
      expect(restart.out, `restart after kill #${k}`).toContain("@@DONE");
      expect(problemsIn(readTree(vault), reference.outputs), `killed after write #${k}`).toEqual([]);
    }
  }, 120_000);
});
