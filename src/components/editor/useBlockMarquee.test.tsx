import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRef } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useBlockMarquee } from "./useBlockMarquee";

// Give an element a fixed on-screen box (jsdom has no layout, so we stub it).
function box(el: HTMLElement, top: number, bottom: number) {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left: 100, right: 400, width: 300, height: bottom - top, x: 100, y: top, toJSON: () => ({}) }) as DOMRect;
}

// Build an editor-shaped DOM: a wrapper (where the marquee listens) containing a
// .bn-editor with three stacked top-level rows a/b/c, plus a stub BlockNote editor.
function setup() {
  const wrap = document.createElement("div");
  wrap.className = "pensieve-editor";
  const editorDom = document.createElement("div");
  editorDom.className = "bn-editor";
  wrap.appendChild(editorDom);

  const rows = ["a", "b", "c"].map((id, i) => {
    const el = document.createElement("div");
    el.setAttribute("data-node-type", "blockContainer");
    el.setAttribute("data-id", id);
    el.innerHTML = `<div class="bn-block"><div class="bn-block-content"><p class="bn-inline-content">row ${id}</p></div></div>`;
    editorDom.appendChild(el);
    box(el, i * 20, i * 20 + 20); // a:0–20, b:20–40, c:40–60
    return el;
  });
  document.body.appendChild(wrap);

  const setSelection = vi.fn();
  const focus = vi.fn();
  const editor = {
    setSelection,
    prosemirrorView: { dom: editorDom, state: {}, dispatch: vi.fn(), posAtDOM: () => 0, focus } as never,
  };
  return { wrap, rows, editor, setSelection, focus };
}

function Harness({ editor, wrap }: { editor: Parameters<typeof useBlockMarquee>[0]; wrap: HTMLElement }) {
  const ref = useRef<HTMLElement | null>(wrap);
  useBlockMarquee(editor, ref);
  return null;
}

describe("useBlockMarquee", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    cleanup();
    document.querySelector(".pensieve-marquee")?.remove();
    document.body.innerHTML = "";
  });

  it("drag from the blank margin across rows selects first→last", () => {
    const { wrap, editor, setSelection } = setup();
    render(<Harness editor={editor} wrap={wrap} />);

    fireEvent.pointerDown(wrap, { clientX: 20, clientY: 5, button: 0 }); // blank, inside row a
    fireEvent.pointerMove(window, { clientX: 40, clientY: 50 }); // past threshold, down into row c
    expect(setSelection).toHaveBeenCalledWith("a", "c");

    fireEvent.pointerUp(window, { clientX: 40, clientY: 50 });
    expect(document.querySelector(".pensieve-marquee")).toBeNull(); // band cleaned up
  });

  it("focuses the editor when a marquee ends, so Delete/Copy reach ProseMirror", () => {
    const { wrap, editor, focus } = setup();
    render(<Harness editor={editor} wrap={wrap} />);

    fireEvent.pointerDown(wrap, { clientX: 20, clientY: 5, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 50 }); // real drag a→c
    fireEvent.pointerUp(window, { clientX: 40, clientY: 50 });
    expect(focus).toHaveBeenCalled();
  });

  it("does NOT focus the editor on a plain click (no drag)", () => {
    const { wrap, editor, focus } = setup();
    render(<Harness editor={editor} wrap={wrap} />);

    fireEvent.pointerDown(wrap, { clientX: 20, clientY: 5, button: 0 });
    fireEvent.pointerMove(window, { clientX: 22, clientY: 7 }); // < DRAG_THRESHOLD
    fireEvent.pointerUp(window, { clientX: 22, clientY: 7 });
    expect(focus).not.toHaveBeenCalled();
  });

  it("shrinks the band selection when dragged back up", () => {
    const { wrap, editor, setSelection } = setup();
    render(<Harness editor={editor} wrap={wrap} />);
    fireEvent.pointerDown(wrap, { clientX: 20, clientY: 5, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 50 }); // a→c
    fireEvent.pointerMove(window, { clientX: 40, clientY: 25 }); // back up to b
    expect(setSelection).toHaveBeenLastCalledWith("a", "b");
    fireEvent.pointerUp(window, { clientX: 40, clientY: 25 });
  });

  it("does NOT marquee when the press starts on real text (text drag stays text)", () => {
    const { wrap, editor, setSelection } = setup();
    render(<Harness editor={editor} wrap={wrap} />);
    const text = wrap.querySelector(".bn-inline-content") as HTMLElement;
    fireEvent.pointerDown(text, { clientX: 20, clientY: 5, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 50 });
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("a press that never crosses the threshold is a plain click (no selection)", () => {
    const { wrap, editor, setSelection } = setup();
    render(<Harness editor={editor} wrap={wrap} />);
    fireEvent.pointerDown(wrap, { clientX: 20, clientY: 5, button: 0 });
    fireEvent.pointerMove(window, { clientX: 22, clientY: 7 }); // < DRAG_THRESHOLD
    fireEvent.pointerUp(window, { clientX: 22, clientY: 7 });
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("ignores non-primary buttons", () => {
    const { wrap, editor, setSelection } = setup();
    render(<Harness editor={editor} wrap={wrap} />);
    fireEvent.pointerDown(wrap, { clientX: 20, clientY: 5, button: 2 }); // right-click
    fireEvent.pointerMove(window, { clientX: 40, clientY: 50 });
    expect(setSelection).not.toHaveBeenCalled();
  });
});
