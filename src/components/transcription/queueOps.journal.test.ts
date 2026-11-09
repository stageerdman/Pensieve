import { describe, it, expect } from "vitest";
import { mergeNewJournalItems, isJournalItem, type ProcessItem } from "./queueOps";
import type { RawBatchQueueItem } from "../../lib/raw/queue";

describe("mergeNewJournalItems", () => {
  it("appends only new batches, numbering after existing rows — same shape as mergeNewItems", () => {
    const prev: ProcessItem[] = [
      { ref: "a", type: "audio", noteId: "n", title: "", audioName: "a.mp3", order: 1, model: "czech-whisper", pct: 0, phase: null, error: false },
    ];
    const found: RawBatchQueueItem[] = [
      { id: "a", pageCount: 9 }, // collides with the audio ref — skipped (same `have` set)
      { id: "raw1", pageCount: 6 },
    ];
    const out = mergeNewJournalItems(prev, found);
    expect(out.map((i) => i.ref)).toEqual(["a", "raw1"]);
    const journalRow = out.find((i) => i.ref === "raw1")!;
    expect(isJournalItem(journalRow)).toBe(true);
    if (isJournalItem(journalRow)) {
      expect(journalRow.pageCount).toBe(6);
      expect(journalRow.order).toBe(2);
    }
  });

  it("restores a persisted order for a resumed batch", () => {
    const found: RawBatchQueueItem[] = [{ id: "raw1", pageCount: 3 }];
    const out = mergeNewJournalItems([], found, { raw1: { order: 7 } });
    expect(out[0].order).toBe(7);
  });

  it("nothing new → returns the same array reference (no needless re-render)", () => {
    const prev: ProcessItem[] = [{ ref: "raw1", type: "journal", pageCount: 3, order: 1, pct: 0, phase: null, error: false }];
    expect(mergeNewJournalItems(prev, [{ id: "raw1", pageCount: 3 }])).toBe(prev);
  });
});
