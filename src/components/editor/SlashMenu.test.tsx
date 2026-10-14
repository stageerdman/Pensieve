import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { makeSlashMenu, type SlashItem } from "./SlashMenu";

// Regression: the custom slash menu MUST run each item's own onItemClick (that handler is
// what inserts the block + clears the "/…" query). A prior version routed through BlockNote's
// `onItemClick` prop instead, which didn't run the item — so /image and /gallery inserted
// nothing. Both Enter and a pointer click must call the item's handler directly.

// jsdom doesn't implement scrollIntoView (the keep-highlight-in-view effect calls it).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const editorStub = {
  prosemirrorView: {
    state: {
      selection: { $from: { parent: { textBetween: () => "" }, parentOffset: 0, start: () => 0, pos: 0 } },
      tr: { delete: () => ({}) },
    },
    dispatch: () => {},
    focus: () => {},
  },
};

function mount(items: SlashItem[]) {
  const SlashMenu = makeSlashMenu(editorStub as never);
  return render(<SlashMenu items={items} />);
}

afterEach(cleanup);

describe("SlashMenu activation", () => {
  it("Enter runs the highlighted item's own onItemClick", () => {
    const image = vi.fn();
    const gallery = vi.fn();
    mount([
      { title: "Image", onItemClick: image },
      { title: "Gallery", onItemClick: gallery },
    ]);
    // Highlight starts at 0 (Image). Enter should fire Image's handler.
    fireEvent.keyDown(document, { key: "Enter" });
    expect(image).toHaveBeenCalledOnce();
    expect(gallery).not.toHaveBeenCalled();
  });

  it("ArrowDown moves the highlight, then Enter runs that item", () => {
    const image = vi.fn();
    const gallery = vi.fn();
    mount([
      { title: "Image", onItemClick: image },
      { title: "Gallery", onItemClick: gallery },
    ]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(gallery).toHaveBeenCalledOnce();
    expect(image).not.toHaveBeenCalled();
  });

  it("a pointer click runs that item's onItemClick", () => {
    const image = vi.fn();
    const { getByText } = mount([{ title: "Image", onItemClick: image }]);
    fireEvent.pointerDown(getByText("Image"));
    expect(image).toHaveBeenCalledOnce();
  });
});
