import { describe, it, expect, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "./editorSchema";
import { selectBlockRange } from "./blockRangeSelection";

// selectBlockRange against the REAL BlockNote editor + our schema. The point under test:
// a marquee that spans our void audio blocks must still produce an actionable multi-block
// selection — BlockNote's own setSelection throws "anchor in block without content" on a
// content:"none" block, so the position-anchored fallback has to carry those cases.

// jsdom doesn't implement these; the audio controller calls them when a block unmounts.
HTMLMediaElement.prototype.load = vi.fn();
HTMLMediaElement.prototype.pause = vi.fn();

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

interface TestEditor {
  document: Array<{ id: string; type: string }>;
  replaceBlocks: (from: unknown, to: unknown) => void;
  prosemirrorView: {
    state: { selection: { from: number; to: number; empty: boolean }; tr: { deleteSelection: () => unknown } };
    dispatch: (tr: unknown) => void;
  };
  setSelection: (a: string, b: string) => void;
}

async function withEditor(run: (editor: TestEditor) => void) {
  let finished = false;
  let caught: unknown = null;
  function Harness() {
    const editor = useCreateBlockNote({ schema: editorSchema });
    const once = useRef(false);
    useEffect(() => {
      if (once.current) return;
      once.current = true;
      try {
        run(editor as unknown as TestEditor);
      } catch (e) {
        caught = e;
      } finally {
        finished = true;
      }
    });
    return <BlockNoteView editor={editor} />;
  }
  render(<Harness />);
  for (let i = 0; i < 200 && !finished; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  cleanup();
  if (caught) throw caught;
}

const audio = (url: string) => ({ type: "audio", props: { url } });
const para = (t: string) => ({ type: "paragraph", content: t });
const countAudio = (e: TestEditor) => e.document.filter((b) => b.type === "audio").length;

const seed = (e: TestEditor, blocks: unknown[]) => {
  e.replaceBlocks(e.document, blocks as never);
  return e.document.map((b) => b.id);
};

describe("selectBlockRange — multi-block selection over void audio", () => {
  it("selects + deletes a band of ONLY audio blocks (the case BlockNote refuses)", async () => {
    await withEditor((e) => {
      const ids = seed(e, [para("top"), audio("a.mp3"), audio("b.mp3"), para("end")]);
      const ok = selectBlockRange(e as never, ids[1], ids[2]);
      expect(ok).toBe(true);
      expect(e.prosemirrorView.state.selection.empty).toBe(false);
      expect(countAudio(e)).toBe(2);
      e.prosemirrorView.dispatch(e.prosemirrorView.state.tr.deleteSelection());
      expect(countAudio(e)).toBe(0); // both recordings gone in one delete
    });
  });

  it("selects a mixed band whose ENDPOINT is audio (leading/trailing media not dropped)", async () => {
    await withEditor((e) => {
      const ids = seed(e, [audio("a.mp3"), para("mid"), audio("b.mp3")]);
      const ok = selectBlockRange(e as never, ids[0], ids[2]);
      expect(ok).toBe(true);
      e.prosemirrorView.dispatch(e.prosemirrorView.state.tr.deleteSelection());
      expect(countAudio(e)).toBe(0);
      expect(e.document.some((b) => b.type === "paragraph")).toBe(true);
    });
  });

  it("still works for a plain text-block band (BlockNote's own path)", async () => {
    await withEditor((e) => {
      const ids = seed(e, [para("a"), para("b"), para("c")]);
      const ok = selectBlockRange(e as never, ids[0], ids[2]);
      expect(ok).toBe(true);
      expect(e.prosemirrorView.state.selection.empty).toBe(false);
    });
  });

  it("returns false for an unknown id rather than throwing", async () => {
    await withEditor((e) => {
      seed(e, [audio("a.mp3"), audio("b.mp3")]);
      expect(selectBlockRange(e as never, "nope-1", "nope-2")).toBe(false);
    });
  });
});
