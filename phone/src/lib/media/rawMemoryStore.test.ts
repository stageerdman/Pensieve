import { describe, it, expect, beforeEach } from "vitest";
import { createRawBatch, loadRawBatches, persistRawBatches, reorderBatchPages, type RawMemory } from "./rawMemoryStore";

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
});

describe("loadRawBatches / persistRawBatches", () => {
  it("round-trips a list", () => {
    const batches: RawMemory[] = [{ id: "r1", status: "synced", createdAt: 1, pages: ["media/r1/a.jpg"] }];
    persistRawBatches(batches);
    expect(loadRawBatches()).toEqual(batches);
  });

  it("empty/missing storage → empty list, never throws", () => {
    expect(loadRawBatches()).toEqual([]);
  });

  it("corrupt JSON → empty list, never throws", () => {
    localStorage.setItem("pensieve.phone.raw", "{not json");
    expect(loadRawBatches()).toEqual([]);
  });

  it("malformed records (no pages array) are rejected wholesale, not partially trusted", () => {
    localStorage.setItem("pensieve.phone.raw", JSON.stringify([{ id: "r1" }]));
    expect(loadRawBatches()).toEqual([]);
  });
});
