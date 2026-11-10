import { describe, it, expect, beforeEach } from "vitest";
import {
  createRawBatch,
  deleteRawBatchRecord,
  loadRawBatch,
  loadRawBatches,
  persistRawBatches,
  reorderBatchPages,
  saveRawBatch,
  type RawMemory,
} from "./rawMemoryStore";

beforeEach(() => localStorage.clear());

describe("createRawBatch", () => {
  it("mints a fresh id, starts capturing, no pages yet", () => {
    const b = createRawBatch();
    expect(b.status).toBe("capturing");
    expect(b.pages).toEqual([]);
    expect(b.id).toBeTruthy();
  });

  it("two batches never collide", () => {
    const a = createRawBatch();
    const b = createRawBatch();
    expect(a.id).not.toBe(b.id);
  });

  it("stamps updatedAt alongside createdAt", () => {
    const b = createRawBatch();
    expect(b.updatedAt).toBe(b.createdAt);
  });
});

describe("reorderBatchPages", () => {
  it("moves a page to a new position, others shift", () => {
    const b: RawMemory = { id: "r1", status: "capturing", createdAt: 0, pages: ["a", "b", "c"] };
    expect(reorderBatchPages(b, 2, 0).pages).toEqual(["c", "a", "b"]);
    expect(reorderBatchPages(b, 0, 2).pages).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the original batch", () => {
    const b: RawMemory = { id: "r1", status: "capturing", createdAt: 0, pages: ["a", "b"] };
    reorderBatchPages(b, 0, 1);
    expect(b.pages).toEqual(["a", "b"]);
  });

  it("bumps updatedAt", () => {
    const b: RawMemory = { id: "r1", status: "capturing", createdAt: 0, updatedAt: 0, pages: ["a", "b"] };
    expect(reorderBatchPages(b, 0, 1).updatedAt).toBeGreaterThan(0);
  });
});

describe("loadRawBatches / persistRawBatches (one localStorage key per batch)", () => {
  it("round-trips a list", () => {
    const batches: RawMemory[] = [{ id: "r1", status: "synced", createdAt: 1, updatedAt: 1, pages: ["media/r1/a.jpg"] }];
    persistRawBatches(batches);
    expect(loadRawBatches()).toEqual(batches);
  });

  it("writes each batch under its own key, not one shared blob", () => {
    persistRawBatches([{ id: "r1", status: "synced", createdAt: 1, updatedAt: 1, pages: [] }]);
    expect(localStorage.getItem("pensieve.phone.raw.r1")).not.toBeNull();
  });

  it("empty/missing storage → empty list, never throws", () => {
    expect(loadRawBatches()).toEqual([]);
  });

  it("corrupt JSON on one key is skipped, doesn't take down the rest", () => {
    persistRawBatches([{ id: "good", status: "synced", createdAt: 1, updatedAt: 1, pages: [] }]);
    localStorage.setItem("pensieve.phone.raw.bad", "{not json");
    expect(loadRawBatches().map((b) => b.id)).toEqual(["good"]);
  });

  it("a malformed record (no pages array) is skipped, not partially trusted", () => {
    localStorage.setItem("pensieve.phone.raw.r1", JSON.stringify({ id: "r1" }));
    expect(loadRawBatches()).toEqual([]);
  });

  it("persisting a SMALLER list removes the dropped batch's key entirely", () => {
    persistRawBatches([
      { id: "r1", status: "synced", createdAt: 1, updatedAt: 1, pages: [] },
      { id: "r2", status: "synced", createdAt: 1, updatedAt: 1, pages: [] },
    ]);
    persistRawBatches([{ id: "r1", status: "synced", createdAt: 1, updatedAt: 1, pages: [] }]);
    expect(localStorage.getItem("pensieve.phone.raw.r2")).toBeNull();
    expect(loadRawBatches().map((b) => b.id)).toEqual(["r1"]);
  });
});

describe("loadRawBatch / saveRawBatch / deleteRawBatchRecord — per-id access for the sync engine", () => {
  it("saveRawBatch then loadRawBatch round-trips that one record", () => {
    const b: RawMemory = { id: "r1", status: "synced", createdAt: 1, updatedAt: 1, pages: ["media/r1/a.jpg"] };
    saveRawBatch(b);
    expect(loadRawBatch("r1")).toEqual(b);
  });

  it("loadRawBatch returns null for an id that was never saved", () => {
    expect(loadRawBatch("nope")).toBeNull();
  });

  it("deleteRawBatchRecord removes just that one key", () => {
    saveRawBatch({ id: "r1", status: "synced", createdAt: 1, updatedAt: 1, pages: [] });
    saveRawBatch({ id: "r2", status: "synced", createdAt: 1, updatedAt: 1, pages: [] });
    deleteRawBatchRecord("r1");
    expect(loadRawBatch("r1")).toBeNull();
    expect(loadRawBatch("r2")).not.toBeNull();
  });
});
