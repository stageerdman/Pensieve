// The job rules one by one: snapshot first, resume from the checkpoint, no double run,
// set aside after MAX_ATTEMPTS, recovery on start, and rollback from the snapshot.
import { describe, it, expect, vi } from "vitest";
import { memoryFiles } from "./testkit/memoryFiles";
import { appStart, describePage, jobDeps, seedBatches } from "./testkit/scenario";
import { vaultStore } from "./testkit/vaultStore";
import { listUnprocessedRawBatches } from "../queue";
import { jobStore, MAX_ATTEMPTS, recoverInterrupted, restoreSnapshot, runJournalJob, JobAlreadyRunningError, JobFailedError, JobSetAsideError } from ".";
import type { RawMemory } from "../../types";

async function seeded() {
  const m = memoryFiles();
  await seedBatches(m.files);
  return m;
}

const rawOf = (disk: Map<string, string>, id: string) => {
  const raw = disk.get(`raw/${id}.json`);
  return raw ? (JSON.parse(raw) as RawMemory) : null;
};

const failingAt = (badRef: string) =>
  vi.fn(async (ref: string, abs: string) => {
    if (ref === badRef) throw new Error("AI said no");
    return describePage(ref, abs);
  });

describe("runJournalJob", () => {
  it("snapshots the batch before anything else touches it", async () => {
    const m = await seeded();
    let snapshotAtFirstDescribe = false;
    await runJournalJob("r1", jobDeps(m.files, async (ref, abs) => {
      snapshotAtFirstDescribe ||= m.disk.has("snapshots/raw/r1/record.json");
      expect(rawOf(m.disk, "r1")!.status).toBe("processing");
      return describePage(ref, abs);
    }));
    expect(snapshotAtFirstDescribe).toBe(true);
    expect(JSON.parse(m.disk.get("snapshots/raw/r1/record.json")!).status).toBe("synced");
  });

  it("a failed try puts the batch back to synced, keeps the checkpoint, and the next try resumes from it", async () => {
    const m = await seeded();
    const flaky = failingAt("media/r1/c.jpg");
    await expect(runJournalJob("r1", jobDeps(m.files, flaky))).rejects.toBeInstanceOf(JobFailedError);
    expect(rawOf(m.disk, "r1")!.status).toBe("synced");
    const job = (await jobStore(m.files).read("r1"))!;
    expect(Object.keys(job.pages)).toEqual(["media/r1/a.jpg", "media/r1/b.jpg"]);
    expect(job.lastError).toBe("AI said no");

    const describe = vi.fn(describePage);
    await runJournalJob("r1", jobDeps(m.files, describe));
    expect(describe.mock.calls.map((c) => c[0])).toEqual(["media/r1/c.jpg", "media/r1/d.jpg"]); // a, b reused
    expect(m.disk.has("raw/r1.json")).toBe(false);
    expect(m.disk.has("jobs/r1.json")).toBe(false);
  });

  it("refuses to run the same batch twice at once", async () => {
    const m = await seeded();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = runJournalJob("r1", jobDeps(m.files, async (ref, abs) => {
      await gate;
      return describePage(ref, abs);
    }));
    await expect(runJournalJob("r1", jobDeps(m.files))).rejects.toBeInstanceOf(JobAlreadyRunningError);
    release();
    await first;
    expect(m.disk.has("notes/r1-1.md")).toBe(true);
  });

  it(`sets a batch aside after ${MAX_ATTEMPTS} failed tries; the queue shows why; Run releases it`, async () => {
    const m = await seeded();
    const broken = failingAt("media/r1/a.jpg");
    for (let i = 1; i < MAX_ATTEMPTS; i++) await expect(runJournalJob("r1", jobDeps(m.files, broken))).rejects.toBeInstanceOf(JobFailedError);
    await expect(runJournalJob("r1", jobDeps(m.files, broken))).rejects.toBeInstanceOf(JobSetAsideError);

    const listed = await listUnprocessedRawBatches(vaultStore(m.files), jobStore(m.files));
    expect(listed.find((i) => i.id === "r1")!.setAside).toMatch(/Set aside after 3 failed tries.*AI said no/);
    expect(listed.find((i) => i.id === "r2")!.setAside).toBeUndefined();
    expect(rawOf(m.disk, "r1")!.status).toBe("synced"); // untouched, still unprocessed

    await appStart(m.files, broken); // an app start does NOT loop on it…
    expect(broken.mock.calls.filter((c) => c[0] === "media/r1/a.jpg")).toHaveLength(MAX_ATTEMPTS);
    expect(m.disk.has("notes/r2-1.md")).toBe(true); // …and the other batch still gets done

    await runJournalJob("r1", jobDeps(m.files)); // the owner pressed Run, and the AI works now
    expect(m.disk.has("notes/r1-1.md")).toBe(true);
    expect(m.disk.has("raw/r1.json")).toBe(false);
  });

  it("a batch that keeps crashing the app is set aside too — each interrupted run counts as a try", async () => {
    const m = await seeded();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const run = memoryFiles(m.disk);
      run.killAtWrite(3); // job.attempts saved, snapshot started, then the process dies
      await runJournalJob("r1", jobDeps(run.files)).catch(() => undefined);
      await recoverInterrupted({ raws: vaultStore(m.files), files: m.files });
    }
    await expect(runJournalJob("r1", jobDeps(m.files))).rejects.toBeInstanceOf(JobSetAsideError);
    expect((await jobStore(m.files).read("r1"))!.lastError).toMatch(/interrupted/);
  });
});

describe("recoverInterrupted", () => {
  it("puts a batch left 'processing' back to 'synced' so the queue offers it again", async () => {
    const m = await seeded();
    const rm = rawOf(m.disk, "r1")!;
    await vaultStore(m.files).saveRawMemory({ ...rm, status: "processing" });
    expect((await listUnprocessedRawBatches(vaultStore(m.files))).map((i) => i.id)).toEqual(["r2"]);

    const { requeued } = await recoverInterrupted({ raws: vaultStore(m.files), files: m.files });
    expect(requeued).toEqual(["r1"]);
    expect((await listUnprocessedRawBatches(vaultStore(m.files))).map((i) => i.id)).toEqual(["r1", "r2"]);
  });
});

describe("restoreSnapshot", () => {
  it("rolls a processed batch back to exactly how it arrived", async () => {
    const m = await seeded();
    const before = new Map(m.disk);
    await runJournalJob("r1", jobDeps(m.files));
    expect(m.disk.has("raw/r1.json")).toBe(false);

    const restored = await restoreSnapshot(m.files, vaultStore(m.files), "r1");
    expect(restored!.status).toBe("synced");
    // Same record — only updatedAt is re-stamped, on purpose, so sync sees it as changed.
    expect({ ...rawOf(m.disk, "r1"), updatedAt: 1 }).toEqual(JSON.parse(before.get("raw/r1.json")!));
    expect(rawOf(m.disk, "r1")!.updatedAt).toBeGreaterThan(1);
    for (const p of ["a", "b", "c", "d"]) expect(m.disk.get(`media/r1/${p}.jpg`)).toBe(before.get(`media/r1/${p}.jpg`));
  });

  it("returns null when there is no snapshot", async () => {
    const m = await seeded();
    expect(await restoreSnapshot(m.files, vaultStore(m.files), "nope")).toBeNull();
  });
});
