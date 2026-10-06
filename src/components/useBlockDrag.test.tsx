import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useBlockDrag } from "./useBlockDrag";
import { NEST_INDENT } from "./blockDrag";

function box(el: HTMLElement, top: number, bottom: number, left = 100, right = 400) {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

function setup() {
  const dom = document.createElement("div");
  dom.className = "bn-editor";
  ["a", "b", "c"].forEach((id, i) => {
    const bc = document.createElement("div");
    bc.setAttribute("data-node-type", "blockContainer");
    bc.setAttribute("data-id", id);
    bc.className = "bn-block";
    const content = document.createElement("div");
    content.className = "bn-block-content";
    content.innerHTML = `<p class="bn-inline-content">row ${id}</p>`;
    bc.appendChild(content);
    dom.appendChild(bc);
    box(content, i * 20, i * 20 + 20); // a:0–20, b:20–40, c:40–60, left=100
  });
  document.body.appendChild(dom);

  const editor = {
    prosemirrorView: { dom },
    getBlock: vi.fn((id: string) => ({ id, children: [] as Array<{ id: string; children?: unknown[] }> })),
    insertBlocks: vi.fn((_blocks: unknown[], _ref: string, _placement: "before" | "after") => [{ id: "new1" }]),
    removeBlocks: vi.fn(),
    setSelection: vi.fn(),
    setTextCursorPosition: vi.fn(),
    nestBlock: vi.fn(),
  };
  return { dom, editor };
}

// Capture the startDrag the hook returns so the test can invoke it like a handle would.
let start: ReturnType<typeof useBlockDrag>;
function Harness({ editor, dom }: { editor: unknown; dom: HTMLElement }) {
  const ref = { current: dom } as React.RefObject<HTMLElement>;
  start = useBlockDrag(editor as Parameters<typeof useBlockDrag>[0], ref);
  return null;
}

describe("useBlockDrag", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    cleanup();
    document.querySelector(".pensieve-drop-indicator")?.remove();
  });

  it("drags a block below the last one → insert after c, remove original", () => {
    const { dom, editor } = setup();
    render(<Harness editor={editor} dom={dom} />);
    start({ clientX: 50, clientY: 5, button: 0 }, ["a"]);
    fireEvent.pointerMove(window, { clientX: 50, clientY: 55 }); // past threshold, below c
    fireEvent.pointerUp(window, { clientX: 50, clientY: 55 });

    expect(editor.insertBlocks).toHaveBeenCalledTimes(1);
    const [, ref, placement] = editor.insertBlocks.mock.calls[0];
    expect(ref).toBe("c");
    expect(placement).toBe("after");
    expect(editor.removeBlocks).toHaveBeenCalledWith(["a"]);
    expect(editor.nestBlock).not.toHaveBeenCalled();
    expect(document.querySelector(".pensieve-drop-indicator")).toBeNull(); // cleaned up
  });

  it("nests under a block when dropped indented to the right", () => {
    const { dom, editor } = setup();
    render(<Harness editor={editor} dom={dom} />);
    start({ clientX: 100, clientY: 5, button: 0 }, ["a"]);
    // Over b (y in b), indented past b's content edge → nest under b.
    fireEvent.pointerMove(window, { clientX: 100 + NEST_INDENT + 5, clientY: 30 });
    fireEvent.pointerUp(window, { clientX: 100 + NEST_INDENT + 5, clientY: 30 });

    // b has no children → insert after b as sibling, then nest.
    const [, ref, placement] = editor.insertBlocks.mock.calls[0];
    expect(ref).toBe("b");
    expect(placement).toBe("after");
    expect(editor.nestBlock).toHaveBeenCalledTimes(1);
    expect(editor.removeBlocks).toHaveBeenCalledWith(["a"]);
  });

  it("a press that never crosses the threshold does not move anything", () => {
    const { dom, editor } = setup();
    render(<Harness editor={editor} dom={dom} />);
    start({ clientX: 50, clientY: 5, button: 0 }, ["a"]);
    fireEvent.pointerMove(window, { clientX: 52, clientY: 7 }); // < threshold
    fireEvent.pointerUp(window, { clientX: 52, clientY: 7 });
    expect(editor.insertBlocks).not.toHaveBeenCalled();
    expect(editor.removeBlocks).not.toHaveBeenCalled();
  });

  it("nests as first children when the target already has a child group", () => {
    const { dom, editor } = setup();
    editor.getBlock = vi.fn((id: string) => (id === "b" ? { id, children: [{ id: "b1", children: [] }] } : { id, children: [] }));
    render(<Harness editor={editor} dom={dom} />);
    start({ clientX: 100, clientY: 5, button: 0 }, ["a"]);
    fireEvent.pointerMove(window, { clientX: 100 + NEST_INDENT + 5, clientY: 30 });
    fireEvent.pointerUp(window, { clientX: 100 + NEST_INDENT + 5, clientY: 30 });
    // Insert before b's first child, no nestBlock needed.
    const [, ref, placement] = editor.insertBlocks.mock.calls[0];
    expect(ref).toBe("b1");
    expect(placement).toBe("before");
    expect(editor.nestBlock).not.toHaveBeenCalled();
  });
});
