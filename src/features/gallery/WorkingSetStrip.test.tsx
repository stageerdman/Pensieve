import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { WorkingSetStrip } from "./WorkingSetStrip";
import { DEFAULT_GALLERY_STATE } from "../../lib/gallery/view";
import { DEFAULT_CATEGORIES } from "../../lib/categories/defs";
import type { NoteMeta } from "../../lib/types";

// Give an element a fixed on-screen box (jsdom has no layout, so we stub it) —
// same technique as the editor drag/marquee sibling tests.
function box(el: HTMLElement, left: number, right: number, top = 0, bottom = 20) {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

// Three 200px-wide items laid out left→right with a gap, so each has a distinct
// midpoint the drop-slot math (measure()) can be driven against:
//   a: [0, 200]  mid 100
//   b: [216, 416] mid 316
//   c: [432, 632] mid 532
function layout(items: HTMLElement[]) {
  box(items[0], 0, 200);
  box(items[1], 216, 416);
  box(items[2], 432, 632);
}

function note(id: string): NoteMeta {
  return { id, title: `Note ${id}`, createdAt: 1, updatedAt: 1 };
}

function baseProps(items: NoteMeta[]) {
  return {
    items,
    fields: DEFAULT_GALLERY_STATE.fields,
    categoryDefs: DEFAULT_CATEGORIES,
    now: Date.now(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    onHoverChange: vi.fn(),
    onPeekToggle: vi.fn(),
    onToggleWorkingSet: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
    onReorder: vi.fn(),
  };
}

function renderStrip(items: NoteMeta[], overrides: Partial<ReturnType<typeof baseProps>> = {}) {
  const props = { ...baseProps(items), ...overrides };
  render(<WorkingSetStrip {...props} />);
  const rows = screen.getAllByRole("listitem");
  layout(rows);
  return { props, rows };
}

describe("WorkingSetStrip", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders nothing when the working set is empty", () => {
    render(<WorkingSetStrip {...baseProps([])} />);
    expect(screen.queryByRole("list", { name: "Working set" })).toBeNull();
  });

  it("renders items left to right in the given order", () => {
    renderStrip([note("a"), note("b"), note("c")]);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Note a");
    expect(rows[1]).toHaveTextContent("Note b");
    expect(rows[2]).toHaveTextContent("Note c");
  });

  it("drags the first item past the last → reorders first to last", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.pointerDown(rows[0], { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[0], { clientX: 600, clientY: 10 }); // past c's midpoint (532)
    fireEvent.pointerUp(rows[0], { clientX: 600, clientY: 10 });
    expect(props.onReorder).toHaveBeenCalledTimes(1);
    expect(props.onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("drags the last item before the first → reorders last to first", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.pointerDown(rows[2], { clientX: 532, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[2], { clientX: 0, clientY: 10 }); // before a's midpoint (100)
    fireEvent.pointerUp(rows[2], { clientX: 0, clientY: 10 });
    expect(props.onReorder).toHaveBeenCalledTimes(1);
    expect(props.onReorder).toHaveBeenCalledWith(2, 0);
  });

  it("is a no-op when a real drag ends back in the item's own slot", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    // Drag item b (index 1) far enough to cross the threshold, but stop before
    // crossing into a neighbouring slot: clientX=200 is past a's midpoint (100,
    // slot→1) but short of b's own midpoint (316), so measure() still resolves to
    // slot 1 → to === from.
    fireEvent.pointerDown(rows[1], { clientX: 316, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[1], { clientX: 200, clientY: 10 });
    fireEvent.pointerUp(rows[1], { clientX: 200, clientY: 10 });
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("a press that never crosses the drag threshold does not reorder", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.pointerDown(rows[0], { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[0], { clientX: 102, clientY: 11 }); // < DRAG_THRESHOLD (5)
    fireEvent.pointerUp(rows[0], { clientX: 102, clientY: 11 });
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("ignores non-primary buttons (right-click doesn't start a drag)", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.pointerDown(rows[0], { clientX: 100, clientY: 10, button: 2 });
    fireEvent.pointerMove(rows[0], { clientX: 600, clientY: 10 });
    fireEvent.pointerUp(rows[0], { clientX: 600, clientY: 10 });
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("shows the floating drag indicator and bottle only while actively dragging", () => {
    const { rows } = renderStrip([note("a"), note("b"), note("c")]);
    expect(document.querySelector(".bg-accent")).toBeNull();
    fireEvent.pointerDown(rows[0], { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[0], { clientX: 600, clientY: 10 });
    expect(document.querySelector(".bg-accent")).not.toBeNull();
    fireEvent.pointerUp(rows[0], { clientX: 600, clientY: 10 });
    expect(document.querySelector(".bg-accent")).toBeNull();
  });

  it("dims the dragged item (opacity-30) only while it is the one being dragged", () => {
    const { rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.pointerDown(rows[0], { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[0], { clientX: 600, clientY: 10 });
    expect(rows[0].className).toContain("opacity-30");
    expect(rows[1].className).not.toContain("opacity-30");
    fireEvent.pointerUp(rows[0], { clientX: 600, clientY: 10 });
    expect(rows[0].className).not.toContain("opacity-30");
  });

  it("a pointer cancel aborts the drag with no reorder, even if pointerup follows", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.pointerDown(rows[0], { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerMove(rows[0], { clientX: 600, clientY: 10 });
    fireEvent.pointerCancel(rows[0]);
    expect(document.querySelector(".bg-accent")).toBeNull();
    fireEvent.pointerUp(rows[0], { clientX: 600, clientY: 10 });
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("suppresses the trailing click after a real drag so it doesn't also open the note", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    const innerButton = rows[0].querySelector("button")!;
    // Pointer down/move/up bubble from the card's own button up to the row's
    // handlers, exactly as a real press-and-drag on the card would.
    fireEvent.pointerDown(innerButton, { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerMove(innerButton, { clientX: 600, clientY: 10 });
    fireEvent.pointerUp(innerButton, { clientX: 600, clientY: 10 });
    // The browser fires a click right after pointerup; it must be swallowed
    // before it reaches the card's button (which would open the note).
    fireEvent.click(innerButton);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("does not suppress a plain click (no drag) — opening still works", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    const innerButton = rows[0].querySelector("button")!;
    fireEvent.pointerDown(innerButton, { clientX: 100, clientY: 10, button: 0 });
    fireEvent.pointerUp(innerButton, { clientX: 100, clientY: 10 });
    fireEvent.click(innerButton);
    expect(props.onOpen).toHaveBeenCalledWith("a", false);
  });

  it("Alt+ArrowRight on a focused item calls onMove(id, 1)", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.keyDown(rows[0], { key: "ArrowRight", altKey: true });
    expect(props.onMove).toHaveBeenCalledWith("a", 1);
  });

  it("Alt+ArrowLeft on a focused item calls onMove(id, -1)", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.keyDown(rows[2], { key: "ArrowLeft", altKey: true });
    expect(props.onMove).toHaveBeenCalledWith("c", -1);
  });

  it("Backspace/Delete on a focused item calls onRemove", () => {
    const { props, rows } = renderStrip([note("a"), note("b"), note("c")]);
    fireEvent.keyDown(rows[1], { key: "Backspace" });
    expect(props.onRemove).toHaveBeenCalledWith("b");
  });

  it("the × button removes without starting a drag", () => {
    const { props } = renderStrip([note("a"), note("b"), note("c")]);
    const removeBtn = screen.getAllByRole("button", { name: "Remove from working set" })[0];
    fireEvent.pointerDown(removeBtn, { clientX: 5, clientY: 5, button: 0 });
    fireEvent.click(removeBtn);
    expect(props.onRemove).toHaveBeenCalledWith("a");
    expect(props.onReorder).not.toHaveBeenCalled();
  });
});
