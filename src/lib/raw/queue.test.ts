import { describe, it, expect } from "vitest";
import { listUnprocessedRawBatches, type RawBatchStore } from "./queue";
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
