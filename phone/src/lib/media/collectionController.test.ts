// collectionController.test.ts — the drag-reorder data contract. The gesture layer (long-press
// lift, hit-testing, auto-scroll) is device-verified (jsdom has no layout/pointer capture), but
// the controller's index math and the onReorder delegation are pure and locked here.

import { describe, expect, it, vi } from "vitest";
import { phoneCollection } from "./collectionController";

const items = (...n: number[]) => n.map((i) => ({ url: `u${i}`, caption: `c${i}` }));

describe("phoneCollection.reorder", () => {
  it("moves items[from] to final index `to` and fires onReorder(from,to) with the original indices", () => {
    const onReorder = vi.fn();
    phoneCollection.open(items(0, 1, 2, 3), { editable: true, onReorder });

    phoneCollection.reorder(0, 2); // move the first photo to final index 2
    expect(phoneCollection.get().items.map((i) => i.url)).toEqual(["u1", "u2", "u0", "u3"]);
    expect(onReorder).toHaveBeenCalledWith(0, 2);

    phoneCollection.close();
  });

  it("is a no-op for from===to or out-of-range indices (no mutation, no onReorder)", () => {
    const onReorder = vi.fn();
    phoneCollection.open(items(0, 1, 2), { editable: true, onReorder });

    phoneCollection.reorder(1, 1);
    phoneCollection.reorder(0, 9);
    phoneCollection.reorder(-1, 1);
    expect(phoneCollection.get().items.map((i) => i.url)).toEqual(["u0", "u1", "u2"]);
    expect(onReorder).not.toHaveBeenCalled();

    phoneCollection.close();
  });

  it("does nothing when the board is closed", () => {
    const onReorder = vi.fn();
    phoneCollection.close();
    phoneCollection.reorder(0, 1);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
