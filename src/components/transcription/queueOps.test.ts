import { describe, it, expect } from "vitest";
import {
  type ProcessItem,
  activeItem,
  clearErrorsForRetry,
  mergeNewItems,
  reorderItems,
  setItemModel,
  sortItems,
} from "./queueOps";
import type { AudioQueueItem } from "../../lib/transcripts/queue";

const item = (ref: string, order: number, over: Partial<ProcessItem> = {}): ProcessItem => ({
  ref,
  noteId: "n",
  title: "",
  audioName: `${ref}.mp3`,
  type: "audio",
  order,
  model: "czech-whisper",
  pct: 0,
  phase: null,
  error: false,
  ...over,
});

describe("queueOps", () => {
  it("reorder moves an item to a new position and renumbers 1..n", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const out = reorderItems(items, "c", 1); // c → top
    expect(sortItems(out).map((i) => i.ref)).toEqual(["c", "a", "b"]);
    expect(sortItems(out).map((i) => i.order)).toEqual([1, 2, 3]);
  });

  it("reorder clamps an out-of-range position", () => {
    const items = [item("a", 1), item("b", 2)];
    expect(sortItems(reorderItems(items, "a", 99)).map((i) => i.ref)).toEqual(["b", "a"]);
    expect(sortItems(reorderItems(items, "b", 0)).map((i) => i.ref)).toEqual(["b", "a"]);
  });

  it("active is the lowest-ordered non-errored item", () => {
    const items = [item("a", 1, { error: true }), item("b", 2), item("c", 3)];
    expect(activeItem(items)?.ref).toBe("b"); // a is errored → skipped
  });

  it("changing a model resets that row's progress", () => {
    const items = [item("a", 1, { pct: 42 })];
    const out = setItemModel(items, "a", "parakeet");
    expect(out[0].model).toBe("parakeet");
    expect(out[0].pct).toBe(0);
  });

  it("changing a model to the SAME value is a no-op (keeps progress)", () => {
    const items = [item("a", 1, { pct: 42 })];
    expect(setItemModel(items, "a", "czech-whisper")[0].pct).toBe(42);
  });

  it("merge appends only new refs, numbering after existing ones", () => {
    const prev = [item("a", 1)];
    const found: AudioQueueItem[] = [
      { ref: "a", noteId: "n", title: "", audioName: "a.mp3" }, // dup — skipped
      { ref: "z", noteId: "n2", title: "Z", audioName: "z.mp3" },
    ];
    const out = mergeNewItems(prev, found, "czech-whisper");
    expect(out.map((i) => i.ref)).toEqual(["a", "z"]);
    expect(out[1].order).toBe(2);
    expect(out[1].model).toBe("czech-whisper"); // auto path uses the default (Czech)
  });

  it("clearErrorsForRetry resets errored rows so Run retries them", () => {
    const items = [item("a", 1, { error: true, pct: 60 }), item("b", 2)];
    const out = clearErrorsForRetry(items);
    expect(out[0].error).toBe(false);
    expect(out[0].pct).toBe(0);
    expect(out[1]).toEqual(items[1]); // untouched
  });
});
