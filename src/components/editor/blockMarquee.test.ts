import { describe, it, expect } from "vitest";
import { blocksInBand, isBlankMarqueeTarget, nearestRowId, rectBetween } from "./blockMarquee";

describe("blocksInBand", () => {
  const blocks = [
    { id: "a", top: 0, bottom: 20 },
    { id: "b", top: 20, bottom: 40 },
    { id: "c", top: 40, bottom: 60 },
    { id: "d", top: 60, bottom: 80 },
  ];

  it("selects every row the band's vertical span touches", () => {
    expect(blocksInBand(blocks, { top: 25, bottom: 55 })).toEqual(["b", "c"]);
  });

  it("includes a row the band only grazes", () => {
    expect(blocksInBand(blocks, { top: 19, bottom: 21 })).toEqual(["a", "b"]);
  });

  it("works when the band is dragged upward (top > bottom)", () => {
    expect(blocksInBand(blocks, { top: 55, bottom: 25 })).toEqual(["b", "c"]);
  });

  it("ignores horizontal extent entirely (row-wise)", () => {
    // A zero-height band at y=50 still picks the row it sits inside.
    expect(blocksInBand(blocks, { top: 50, bottom: 50 })).toEqual(["c"]);
  });

  it("returns nothing when the band is above all rows", () => {
    expect(blocksInBand(blocks, { top: -30, bottom: -10 })).toEqual([]);
  });
});

describe("nearestRowId", () => {
  const rows = [
    { id: "a", top: 0, bottom: 20 },
    { id: "b", top: 20, bottom: 40 },
    { id: "c", top: 40, bottom: 60 },
  ];
  it("returns the row a position falls inside", () => {
    expect(nearestRowId(rows, 10)).toBe("a");
    expect(nearestRowId(rows, 50)).toBe("c");
  });
  it("snaps to the first row when above everything, last when below", () => {
    expect(nearestRowId(rows, -100)).toBe("a");
    expect(nearestRowId(rows, 999)).toBe("c");
  });
  it("returns null when there are no rows", () => {
    expect(nearestRowId([], 10)).toBeNull();
  });
});

describe("rectBetween", () => {
  it("normalises so width/height are positive regardless of drag direction", () => {
    expect(rectBetween(10, 10, 4, 25)).toEqual({ left: 4, top: 10, width: 6, height: 15 });
  });
});

describe("isBlankMarqueeTarget", () => {
  // Build a little editor-shaped DOM: a centred text column with margins around it.
  function build() {
    const root = document.createElement("div");
    root.className = "pensieve-editor";
    root.innerHTML = `
      <div class="bn-side-menu"><button class="handle">drag</button></div>
      <div class="bn-editor">
        <div class="bn-block-outer" data-node-type="blockContainer" data-id="x">
          <div class="bn-block">
            <div class="bn-block-content"><p class="bn-inline-content">hello world</p></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  it("is blank over margin / block padding (not on text)", () => {
    const root = build();
    expect(isBlankMarqueeTarget(root, root)).toBe(true);
    expect(isBlankMarqueeTarget(root.querySelector(".bn-editor"), root)).toBe(true);
    expect(isBlankMarqueeTarget(root.querySelector(".bn-block-content"), root)).toBe(true);
  });

  it("is NOT blank on real text (so text drags still select text)", () => {
    const root = build();
    expect(isBlankMarqueeTarget(root.querySelector(".bn-inline-content"), root)).toBe(false);
  });

  it("is NOT blank on the drag handle or its button", () => {
    const root = build();
    expect(isBlankMarqueeTarget(root.querySelector(".bn-side-menu"), root)).toBe(false);
    expect(isBlankMarqueeTarget(root.querySelector(".handle"), root)).toBe(false);
  });

  it("is NOT blank for elements outside the editor", () => {
    const root = build();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    expect(isBlankMarqueeTarget(outside, root)).toBe(false);
    expect(isBlankMarqueeTarget(null, root)).toBe(false);
  });
});
