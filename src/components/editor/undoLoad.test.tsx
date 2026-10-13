import { describe, it, expect } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { undoDepth } from "@tiptap/pm/history";
import { loadBlocksWithoutHistory } from "./Editor";

if (!window.matchMedia) {
  // jsdom lacks matchMedia; Mantine (BlockNote's UI) needs it to mount.
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

// Mounts a real BlockNote editor, loads one paragraph, and reports the undo depth
// + whether the doc is empty — the two facts that decide whether ⌘Z can wipe a note.
function Harness({ useGuard, report }: { useGuard: boolean; report: (depth: number, empty: boolean) => void }) {
  const editor = useCreateBlockNote();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const blocks = [{ type: "paragraph", content: "hello world" }] as never[];
    if (useGuard) {
      loadBlocksWithoutHistory(editor as never, blocks);
    } else {
      // The old, buggy path: a plain load that lands in the undo history.
      editor.replaceBlocks(editor.document, blocks);
    }
    const view = editor.prosemirrorView!;
    report(undoDepth(view.state), view.state.doc.textContent.trim() === "");
  });
  return <BlockNoteView editor={editor} />;
}

describe("loadBlocksWithoutHistory — ⌘Z can never wipe a loaded note", () => {
  it("loads the content but adds NOTHING to the undo stack", () => {
    let depth = -1;
    let empty = true;
    act(() => {
      render(<Harness useGuard report={(d, e) => { depth = d; empty = e; }} />);
    });
    cleanup();
    expect(empty).toBe(false); // content is actually there
    expect(depth).toBe(0); // ...with no undo step to revert it to empty
  });

  it("control: a plain load DOES leave an undoable step (the original bug)", () => {
    let depth = -1;
    act(() => {
      render(<Harness useGuard={false} report={(d) => { depth = d; }} />);
    });
    cleanup();
    expect(depth).toBe(1); // one ⌘Z here would revert the load → blank note
  });
});
