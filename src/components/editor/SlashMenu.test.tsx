import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { makeSlashMenu, type SlashItem } from "./SlashMenu";

// Regression: the custom slash menu MUST run each item's own onItemClick (that handler is
// what inserts the block). A prior version routed through BlockNote's `onItemClick` prop
// instead, which didn't run the item — so /image and /gallery inserted nothing. Both Enter
// and a pointer click must call the item's handler directly. The menu is also responsible
// for clearing the "/…" trigger text before the handler runs (see the second describe block).

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

// Regression (the "/ima stays + weird blue dot" bug): activation MUST first delete the typed
// "/<query>" text, exactly as stock BlockNote's controller does. Otherwise the block is still
// non-empty, so insertOrUpdateBlockForSlashMenu inserts a block AFTER the paragraph instead of
// replacing it — leaving "/ima" behind and the fresh block in an odd empty/node-selected state.
describe("SlashMenu clears the trigger text on activation", () => {
  // A stub whose current block holds "/ima" before the cursor; records the delete range and
  // whether the delete was dispatched BEFORE the item handler ran.
  function trackingEditor() {
    const order: string[] = [];
    let deleted: { from: number; to: number } | null = null;
    const start = 1; // block content starts at pos 1
    const pos = 5; // cursor after "/ima"
    const editor = {
      prosemirrorView: {
        state: {
          selection: {
            $from: {
              parent: { textBetween: () => "/ima" },
              parentOffset: 4,
              start: () => start,
              pos,
            },
          },
          tr: {
            delete: (from: number, to: number) => {
              deleted = { from, to };
              return { __del: true };
            },
          },
        },
        dispatch: () => order.push("dispatch"),
        focus: () => {},
      },
    };
    return { editor, order, getDeleted: () => deleted };
  }

  it("Enter deletes the '/query' range, then runs the handler", () => {
    const { editor, order, getDeleted } = trackingEditor();
    const image = vi.fn(() => order.push("handler"));
    const SlashMenu = makeSlashMenu(editor as never);
    render(<SlashMenu items={[{ title: "Image", onItemClick: image }]} />);

    fireEvent.keyDown(document, { key: "Enter" });

    // The "/ima" text (from the slash at block-start to the cursor) is deleted…
    expect(getDeleted()).toEqual({ from: 1, to: 5 });
    // …and that deletion is dispatched BEFORE the insert handler runs.
    expect(order).toEqual(["dispatch", "handler"]);
    expect(image).toHaveBeenCalledOnce();
  });

  it("a pointer click also clears the trigger before the handler", () => {
    const { editor, order, getDeleted } = trackingEditor();
    const image = vi.fn(() => order.push("handler"));
    const SlashMenu = makeSlashMenu(editor as never);
    const { getByText } = render(<SlashMenu items={[{ title: "Image", onItemClick: image }]} />);

    fireEvent.pointerDown(getByText("Image"));

    expect(getDeleted()).toEqual({ from: 1, to: 5 });
    expect(order).toEqual(["dispatch", "handler"]);
  });
});
