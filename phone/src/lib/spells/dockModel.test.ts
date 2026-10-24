import { describe, it, expect } from "vitest";
import { HOME_DOCK, NOTE_DOCK, placeDock } from "./dockModel";
import type { DockLayout } from "./types";

describe("placeDock — the home layout", () => {
  it("puts the gold menu bottom-right and Accio across cells 0–2", () => {
    const placed = placeDock(HOME_DOCK);
    expect(placed).toContainEqual({ kind: "menu", cell: 3 });
    expect(placed).toContainEqual({ kind: "expanded", id: "accio", startCell: 0, span: 3 });
  });

  it("starts the expanded spell at cell 1 when the menu is in corner 0", () => {
    const placed = placeDock({ menuSlot: 0, spells: [{ kind: "expanded", id: "accio" }] });
    expect(placed).toContainEqual({ kind: "expanded", id: "accio", startCell: 1, span: 3 });
  });
});

describe("placeDock — collapsed spells", () => {
  it("fills the free cells left→right, skipping the menu slot", () => {
    const layout: DockLayout = {
      menuSlot: 3,
      spells: [
        { kind: "collapsed", id: "sync", icon: "sync" },
        { kind: "collapsed", id: "image", icon: "image" },
      ],
    };
    const placed = placeDock(layout);
    expect(placed.find((p) => p.kind === "collapsed" && p.id === "sync")).toMatchObject({ cell: 0 });
    expect(placed.find((p) => p.kind === "collapsed" && p.id === "image")).toMatchObject({ cell: 1 });
  });

  it("places a collapsed spell to the right of a mid-row menu button", () => {
    const placed = placeDock({ menuSlot: 1, spells: [{ kind: "collapsed", id: "image", icon: "image" }] });
    // free cells are 0,2,3 → first spell lands in cell 0
    expect(placed.find((p) => p.kind === "collapsed")).toMatchObject({ cell: 0 });
  });

  it("align:'end' puts a lone collapsed spell DIRECTLY beside the menu (not the far side)", () => {
    // menu bottom-right (cell 3) → Back must land in cell 2, the adjacent slot.
    const placed = placeDock({ menuSlot: 3, align: "end", spells: [{ kind: "collapsed", id: "back", icon: "back" }] });
    expect(placed).toContainEqual({ kind: "menu", cell: 3 });
    expect(placed.find((p) => p.kind === "collapsed" && p.id === "back")).toMatchObject({ cell: 2 });
  });
});

describe("NOTE_DOCK — the note / collection layout", () => {
  it("is the gold menu bottom-right with Back in the slot beside it", () => {
    const placed = placeDock(NOTE_DOCK);
    expect(placed).toContainEqual({ kind: "menu", cell: 3 });
    expect(placed.find((p) => p.kind === "collapsed" && p.id === "back")).toMatchObject({ cell: 2 });
  });
});

describe("placeDock — invariants", () => {
  it("rejects mixing an expanded spell with collapsed spells", () => {
    expect(() =>
      placeDock({
        menuSlot: 3,
        spells: [{ kind: "expanded", id: "accio" }, { kind: "collapsed", id: "image", icon: "image" }],
      }),
    ).toThrow(/mix/i);
  });

  it("rejects more than 3 collapsed spells", () => {
    expect(() =>
      placeDock({
        menuSlot: 3,
        spells: [
          { kind: "collapsed", id: "a", icon: "image" },
          { kind: "collapsed", id: "b", icon: "image" },
          { kind: "collapsed", id: "c", icon: "image" },
          { kind: "collapsed", id: "d", icon: "image" },
        ],
      }),
    ).toThrow(/at most 3/i);
  });

  it("rejects an expanded spell unless the menu is in a corner", () => {
    expect(() => placeDock({ menuSlot: 1, spells: [{ kind: "expanded", id: "accio" }] })).toThrow(/corner|0 or 3/i);
    expect(() => placeDock({ menuSlot: 2, spells: [{ kind: "expanded", id: "accio" }] })).toThrow();
  });

  it("rejects an out-of-range menu slot", () => {
    expect(() => placeDock({ menuSlot: 7 as 0, spells: [] })).toThrow(/range/i);
  });
});
