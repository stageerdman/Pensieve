// The kill test, exhaustive form: the app dies at EVERY single write of a two-batch run,
// restarts, and must end with each batch done exactly once — same Memories, byte for byte,
// as a run that was never interrupted, nothing lost, nothing half-written, snapshots kept.
// (The real-process SIGKILL form is killProcess.node.test.ts.)
import { describe, it, expect } from "vitest";
import { memoryFiles, ProcessKilled } from "./testkit/memoryFiles";
import { appStart, cleanRun, problemsIn, seedBatches } from "./testkit/scenario";

/** Seed, then run app starts, killing the n-th write of each listed start. A late kill
 *  point may never be reached (a recovery run near the end has little left to do) — then
 *  that start simply finished, which is fine; any other error is a failure. */
async function runWithKills(killPoints: number[]) {
  const disk = new Map<string, string>();
  await seedBatches(memoryFiles(disk).files);
  for (const k of killPoints) {
    const m = memoryFiles(disk); // a fresh process on the same disk
    m.killAtWrite(k);
    const outcome = await appStart(m.files).then(() => "finished", (e: unknown) => e);
    if (outcome !== "finished") expect(outcome).toBeInstanceOf(ProcessKilled);
  }
  await appStart(memoryFiles(disk).files); // the restart that's allowed to finish
  return disk;
}

describe("crash-safe processing — killed at every write", async () => {
  const reference = await cleanRun();

  it("the uninterrupted reference makes 2 Memories per batch, nothing else", () => {
    const notes = Object.keys(reference.outputs).filter((p) => p.endsWith(".md"));
    expect(notes).toEqual(["notes/r1-1.md", "notes/r1-2.md", "notes/r2-1.md", "notes/r2-2.md"]);
    expect(reference.writes).toBeGreaterThan(30); // enough steps for the sweep to mean something
  });

  it("one kill at any write → after a restart every batch is done exactly once", async () => {
    for (let k = 1; k <= reference.writes; k++) {
      const disk = await runWithKills([k]);
      expect(problemsIn(disk, reference.outputs), `killed at write #${k}`).toEqual([]);
    }
  });

  it("two kills in a row (second one during the recovery run) → still exactly once", async () => {
    for (let k = 1; k <= reference.writes; k += 3) {
      for (const k2 of [1, 2, 5, 9]) {
        const disk = await runWithKills([k, k2]);
        expect(problemsIn(disk, reference.outputs), `killed at #${k}, then #${k2}`).toEqual([]);
      }
    }
  });
});
