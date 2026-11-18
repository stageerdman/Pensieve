import { describe, it, expect } from "vitest";
import { listUnprocessedRawBatches, listPackagesToResolve, type RawBatchStore } from "./queue";
import type { RawMemory } from "../types";

function storeWith(rms: RawMemory[]): RawBatchStore {
  return { listRawMemories: async () => rms };
}

const rm = (id: string, status: RawMemory["status"], pages: string[]): RawMemory => ({
  id,
  status,
  createdAt: 0,
  pages,
});

describe("listUnprocessedRawBatches", () => {
  it("only offers synced, non-empty batches", async () => {
    const store = storeWith([
      rm("r1", "synced", ["a", "b"]),
      rm("r2", "capturing", ["c"]), // still being shot on the phone — not ready
      rm("r3", "processing", ["d"]), // already being handled
      rm("r4", "done", ["e"]), // finished — shouldn't still exist, but defensive anyway
      rm("r5", "synced", []), // empty — nothing to process
    ]);
    const out = await listUnprocessedRawBatches(store);
    expect(out).toEqual([{ id: "r1", pageCount: 2 }]);
  });

  it("empty vault → empty list", async () => {
    expect(await listUnprocessedRawBatches(storeWith([]))).toEqual([]);
  });
});

// 2026-11-18: the record arrived before its 21-min WAV → Patronus ran → "audio not found".
describe("media-ready gate", () => {
  const pkg = (id: string, media: string[]): RawMemory => ({
    id,
    status: "synced",
    createdAt: 0,
    pages: [],
    kind: "form",
    markdown: "# form",
    media,
  } as RawMemory);

  it("holds a package back until all its media is on disk", async () => {
    const rms = [pkg("p1", ["media/p1/a.wav"]), pkg("p2", ["media/p2/b.wav"])];
    const store: RawBatchStore = { listRawMemories: async () => rms, listMedia: async () => ["media/p2/b.wav"] };
    expect((await listPackagesToResolve(store)).map((p) => p.id)).toEqual(["p2"]);
  });

  it("holds a journal batch back until all its pages are on disk", async () => {
    const store: RawBatchStore = {
      listRawMemories: async () => [rm("r1", "synced", ["media/r1/a.jpg", "media/r1/b.jpg"])],
      listMedia: async () => ["media/r1/a.jpg"],
    };
    expect(await listUnprocessedRawBatches(store)).toEqual([]);
  });
});
