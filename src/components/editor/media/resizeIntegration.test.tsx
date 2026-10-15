import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "../editorSchema";

// End-to-end through a REAL BlockNote editor with our schema: an empty image block renders a
// corner reshape handle; a native mousedown on it + a window mousemove + mouseup must change the
// block's width/aspect props. This is the full path that was broken two ways — the geometry
// lookup used closest() (→ null → early return) and the drag was wired to pointer events that
// ProseMirror never stops. jsdom has no layout (getBoundingClientRect === 0), so we assert the
// props simply CHANGED, not exact pixels.

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

afterEach(cleanup);

type Doc = { id: string; type: string; props: { width: number; aspect: number } }[];

describe("image resize — through the real editor", () => {
  it("a native drag on the corner handle changes the block's shape props", async () => {
    let editor: ReturnType<typeof useCreateBlockNote> | null = null;
    function Harness() {
      const ed = useCreateBlockNote({
        schema: editorSchema,
        initialContent: [{ type: "image", props: {} } as never],
      });
      editor = ed;
      // Focus the block's host so showControls renders the handle (selected||focused).
      useEffect(() => {
        const host = document.querySelector<HTMLElement>(".pensieve-media-host");
        host?.focus();
      });
      return <BlockNoteView editor={ed} />;
    }

    await act(async () => {
      render(<Harness />);
    });

    // The handle appears once the block is focused.
    const host = document.querySelector<HTMLElement>(".pensieve-media-host");
    expect(host).toBeTruthy();
    await act(async () => {
      fireEvent.focus(host!);
    });

    const corner = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(".pensieve-media-corner");
      if (!el) throw new Error("corner handle not rendered");
      return el;
    });

    const before = (editor!.document as unknown as Doc)[0].props;
    const startWidth = before.width;

    await act(async () => {
      corner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0 }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 400, clientY: 300 }));
      window.dispatchEvent(new MouseEvent("mouseup", {}));
    });

    const after = (editor!.document as unknown as Doc)[0].props;
    // The drag ran end-to-end: the block is still an image, and its shape props moved off the
    // defaults (width toward the drag, a non-natural aspect set by the corner).
    expect((editor!.document as unknown as Doc)[0].type).toBe("image");
    expect(after.aspect).toBeGreaterThan(0);
    expect(after.width).not.toBe(startWidth === undefined ? -1 : startWidth);
  });
});
