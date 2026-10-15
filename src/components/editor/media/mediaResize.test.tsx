import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useResizeHandle, runResizeDrag } from "./mediaResize";

// These exercise the REAL event plumbing that was broken: the resize drag must be driven by a
// NATIVE mousedown on the handle (React's synthetic handler fires too late to stop ProseMirror),
// and the move must be tracked on window. We dispatch genuine DOM events — not React synthetic
// ones — so a regression to onPointerDown/onMouseDown would fail here.

afterEach(cleanup);

function Handle({ onStart }: { onStart: (x: number, y: number) => void }) {
  const ref = useResizeHandle(onStart);
  return <div data-testid="handle" ref={ref} />;
}

describe("useResizeHandle", () => {
  it("starts the drag on a NATIVE mousedown and passes the press coords", () => {
    const start = vi.fn();
    const { getByTestId } = render(<Handle onStart={start} />);
    const handle = getByTestId("handle");

    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 120, clientY: 80 }));

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(120, 80);
  });

  it("preventDefaults the real mousedown (so ProseMirror ignores it)", () => {
    const { getByTestId } = render(<Handle onStart={() => {}} />);
    const handle = getByTestId("handle");

    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    handle.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
  });

  it("ignores non-primary mouse buttons", () => {
    const start = vi.fn();
    const { getByTestId } = render(<Handle onStart={start} />);
    const handle = getByTestId("handle");

    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2, clientX: 5, clientY: 5 }));

    expect(start).not.toHaveBeenCalled();
  });

  it("detaches its listener when the element unmounts", () => {
    const start = vi.fn();
    const { getByTestId, unmount } = render(<Handle onStart={start} />);
    const handle = getByTestId("handle");
    unmount();

    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(start).not.toHaveBeenCalled();
  });
});

describe("runResizeDrag", () => {
  it("reports every window mousemove until mouseup, then stops", () => {
    const moves: Array<[number, number]> = [];
    runResizeDrag((x, y) => moves.push([x, y]));

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 20 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 30, clientY: 40 }));
    window.dispatchEvent(new MouseEvent("mouseup", {}));
    // After release, further moves must NOT be reported.
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 99, clientY: 99 }));

    expect(moves).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(document.body.classList.contains("pensieve-resizing")).toBe(false);
  });

  it("marks the body as resizing during the drag", () => {
    runResizeDrag(() => {});
    expect(document.body.classList.contains("pensieve-resizing")).toBe(true);
    window.dispatchEvent(new MouseEvent("mouseup", {}));
    expect(document.body.classList.contains("pensieve-resizing")).toBe(false);
  });
});
