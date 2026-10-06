import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { GutterHandle } from "./GutterHandle";

function box(el: HTMLElement, top: number, bottom: number, left = 100) {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left, right: left + 300, width: 300, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

function setup(selection?: Array<{ id: string }>) {
  const wrap = document.createElement("div");
  wrap.className = "pensieve-editor";
  const dom = document.createElement("div");
  dom.className = "bn-editor";
  wrap.appendChild(dom);
  ["a", "b", "c"].forEach((id, i) => {
    const bc = document.createElement("div");
    bc.setAttribute("data-node-type", "blockContainer");
    bc.setAttribute("data-id", id);
    bc.className = "bn-block";
    const content = document.createElement("div");
    content.className = "bn-block-content";
    bc.appendChild(content);
    dom.appendChild(bc);
    box(content, i * 20, i * 20 + 20);
  });
  document.body.appendChild(wrap);

  const startDrag = vi.fn();
  const editor = { prosemirrorView: { dom }, getSelection: () => (selection ? { blocks: selection } : undefined) };
  return { wrap, editor, startDrag };
}

describe("GutterHandle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("shows the handle on the hovered row and drags just that row", () => {
    const { wrap, editor, startDrag } = setup();
    render(<GutterHandle editor={editor as never} wrapRef={{ current: wrap }} startDrag={startDrag} />);
    fireEvent.pointerMove(wrap, { clientX: 120, clientY: 30 }); // over row b

    const handle = document.querySelector<HTMLElement>(".pensieve-drag-handle");
    expect(handle).not.toBeNull();
    expect(handle!.style.left).toBe("72px"); // 100 - 28
    expect(handle!.style.top).toBe("20px"); // b's content top

    fireEvent.pointerDown(handle!, { button: 0, clientX: 72, clientY: 25 });
    expect(startDrag).toHaveBeenCalledTimes(1);
    expect(startDrag.mock.calls[0][1]).toEqual(["b"]);
  });

  it("anchors to the TOP selected row and drags the whole group during a multi-selection", () => {
    const { wrap, editor, startDrag } = setup([{ id: "a" }, { id: "b" }]);
    render(<GutterHandle editor={editor as never} wrapRef={{ current: wrap }} startDrag={startDrag} />);
    fireEvent.pointerMove(wrap, { clientX: 120, clientY: 30 }); // hovering b, which is selected

    const handle = document.querySelector<HTMLElement>(".pensieve-drag-handle");
    expect(handle!.style.top).toBe("0px"); // anchored to a (the top selected row)

    fireEvent.pointerDown(handle!, { button: 0, clientX: 72, clientY: 5 });
    expect(startDrag.mock.calls[0][1]).toEqual(["a", "b"]);
  });

  it("hides when the pointer isn't over any row", () => {
    const { wrap, editor, startDrag } = setup();
    render(<GutterHandle editor={editor as never} wrapRef={{ current: wrap }} startDrag={startDrag} />);
    fireEvent.pointerMove(wrap, { clientX: 120, clientY: 500 }); // below every row
    expect(document.querySelector(".pensieve-drag-handle")).toBeNull();
  });
});
