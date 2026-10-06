import { describe, it, expect } from "vitest";
import { computeDrop, NEST_INDENT, type DropBlock } from "./blockDrag";

// Three stacked top-level blocks at indent x=100, each 20px tall.
const blocks: DropBlock[] = [
  { id: "a", top: 0, bottom: 20, left: 100, canNest: true },
  { id: "b", top: 20, bottom: 40, left: 100, canNest: true },
  { id: "c", top: 40, bottom: 60, left: 100, canNest: true },
];

describe("computeDrop", () => {
  const none = new Set<string>();

  it("drops before the first block when above everything", () => {
    expect(computeDrop(blocks, 100, -5, none)).toEqual({ referenceId: "a", placement: "before", nest: false });
  });

  it("drops after the block whose midpoint is above the pointer", () => {
    // y=30 is below a's mid (10) and b's mid (30=not <, so after a)… mid<=y: a(10)<=30, b(30)<=30 → after b
    expect(computeDrop(blocks, 100, 30, none)).toEqual({ referenceId: "b", placement: "after", nest: false });
  });

  it("drops after the last block when below everything", () => {
    expect(computeDrop(blocks, 100, 999, none)).toEqual({ referenceId: "c", placement: "after", nest: false });
  });

  it("nests under the reference when the pointer is indented past it", () => {
    expect(computeDrop(blocks, 100 + NEST_INDENT + 1, 15, none)).toEqual({ referenceId: "a", placement: "after", nest: true });
  });

  it("does not nest when the block cannot contain children", () => {
    const flat = blocks.map((b) => ({ ...b, canNest: false }));
    expect(computeDrop(flat, 100 + NEST_INDENT + 10, 15, none)).toEqual({ referenceId: "a", placement: "after", nest: false });
  });

  it("ignores moving blocks so you can't drop into the moving set", () => {
    // Moving a+b; only c is stationary. A drop anywhere lands relative to c.
    const moving = new Set(["a", "b"]);
    expect(computeDrop(blocks, 100, 30, moving)).toEqual({ referenceId: "c", placement: "before", nest: false });
    expect(computeDrop(blocks, 100, 55, moving)).toEqual({ referenceId: "c", placement: "after", nest: false });
  });

  it("returns null when everything is moving", () => {
    expect(computeDrop(blocks, 100, 30, new Set(["a", "b", "c"]))).toBeNull();
  });
});
