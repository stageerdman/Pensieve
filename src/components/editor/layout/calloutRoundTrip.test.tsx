import { describe, it, expect } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "../editorSchema";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../lib/md/extended";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { enterInCallout } from "./calloutEnter";

// The REAL editor (our schema, mounted) with callouts + columns: load a note → the live
// document → save → byte-identical; Enter in a callout's line stays inside the box; the
// columns block renders each column.

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

type Blk = { id: string; type: string; props: Record<string, unknown>; content: { text?: string }[]; children: Blk[] };
type Editor = Parameters<typeof blocksToExtendedMd>[0] & {
  document: Blk[];
  replaceBlocks: (a: unknown[], b: unknown[]) => void;
  setTextCursorPosition: (id: string, where: "start" | "end") => void;
  transact: <T>(fn: (tr: Transaction) => T) => T;
};

async function withEditor(run: (editor: Editor) => Promise<void>) {
  let caught: unknown = null;
  let finished = false;
  function Harness() {
    const editor = useCreateBlockNote({ schema: editorSchema });
    const once = useRef(false);
    useEffect(() => {
      if (once.current) return;
      once.current = true;
      void (async () => {
        try {
          await run(editor as unknown as Editor);
        } catch (e) {
          caught = e;
        } finally {
          finished = true;
        }
      })();
    });
    return (
      <div className="pensieve-editor">
        <BlockNoteView editor={editor} />
      </div>
    );
  }
  render(<Harness />);
  for (let i = 0; i < 300 && !finished; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  cleanup();
  if (caught) throw caught;
  if (!finished) throw new Error("withEditor: run never completed");
}

const ZW = "​";
const NOTE =
  "# Daily\n\n**What purpose fulfils me today?**\n\n" +
  "```pensieve:callout\nicon=🚨\nTo learn, and to **build**.\n\n* one\n* two\n\n" + ZW + "\n\nSee {@n42|Other note}\n```\n\n" +
  "```pensieve:callout\n" + ZW + "\n\nOnly children here\n```\n\n" +
  "```pensieve:columns\nLeft **side**\n:::column:::\n* right a\n* right b\n```\n\nAfter.\n";

async function load(editor: Editor, md: string) {
  const blocks = await extendedMdToBlocks(editor, md);
  await act(async () => {
    editor.replaceBlocks(editor.document, blocks);
  });
}

describe("callout + columns in the real editor", () => {
  it("load → save is byte-identical", async () => {
    await withEditor(async (editor) => {
      await load(editor, NOTE);
      const types = editor.document.map((b) => b.type);
      expect(types).toEqual(["heading", "paragraph", "callout", "callout", "columns", "paragraph"]);
      const c = editor.document[2];
      expect(c.props.icon).toBe("🚨");
      expect(c.children.map((k) => k.type)).toEqual(["bulletListItem", "bulletListItem", "paragraph", "paragraph"]);
      expect(await blocksToExtendedMd(editor, editor.document)).toBe(NOTE);
    });
  });

  it("renders the callout box (emoji + line + children) and both columns", async () => {
    await withEditor(async (editor) => {
      await load(editor, NOTE);
      await new Promise((r) => setTimeout(r, 50)); // the columns' async render (harness drives act)
      expect(document.querySelectorAll(".pensieve-callout")).toHaveLength(2);
      expect(document.querySelector(".pensieve-callout-icon")?.textContent).toBe("🚨");
      // The skin folds an empty own line by matching this exact DOM (blocknote-skin.css).
      const lines = document.querySelectorAll(".pensieve-callout-text");
      const EMPTY = ":scope > [data-node-view-content-react] > .ProseMirror-trailingBreak:only-child";
      expect(lines[1].querySelector(EMPTY)).not.toBeNull();
      expect(lines[0].querySelector(EMPTY)).toBeNull();
      const cols = document.querySelectorAll(".pensieve-columns-col");
      expect(cols).toHaveLength(2);
      expect(cols[0].innerHTML).toContain("<strong>side</strong>");
      expect(cols[1].querySelectorAll("li")).toHaveLength(2);
    });
  });

  it("Enter at the end of the callout's line opens a new line INSIDE the callout", async () => {
    await withEditor(async (editor) => {
      await load(editor, "```pensieve:callout\nicon=🚨\nQuestion\n\nexisting child\n```\n");
      const id = editor.document[0].id;
      await act(async () => {
        editor.setTextCursorPosition(id, "end");
        expect(editor.transact((tr) => enterInCallout(tr))).toBe(true);
      });
      const c = editor.document[0];
      expect(editor.document).toHaveLength(1);
      expect(c.content[0].text).toBe("Question");
      expect(c.children.map((k) => k.content[0]?.text ?? "")).toEqual(["", "existing child"]);
    });
  });

  it("Enter mid-line moves the rest of the line into the new first child (no children yet)", async () => {
    await withEditor(async (editor) => {
      await load(editor, "```pensieve:callout\nHello world\n```\n");
      const id = editor.document[0].id;
      await act(async () => {
        editor.setTextCursorPosition(id, "start");
        // caret after "Hello", then Enter
        editor.transact((tr: Transaction) => {
          tr.setSelection(TextSelection.create(tr.doc, tr.selection.from + 5));
        });
        expect(editor.transact((tr) => enterInCallout(tr))).toBe(true);
      });
      const c = editor.document[0];
      expect(c.content[0].text).toBe("Hello");
      expect(c.children).toHaveLength(1);
      expect(c.children[0].content[0].text).toBe(" world");
      expect(await blocksToExtendedMd(editor, editor.document)).toBe("```pensieve:callout\nHello\n\n world\n```\n");
    });
  });

  it("a real Enter keypress is routed to the callout handler (before BlockNote's split)", async () => {
    await withEditor(async (editor) => {
      await load(editor, "```pensieve:callout\nQuestion\n```\n\nAfter\n");
      await act(async () => {
        editor.setTextCursorPosition(editor.document[0].id, "end");
        const view = (editor as unknown as { prosemirrorView: { someProp: (n: string, f: (h: (v: unknown, e: KeyboardEvent) => boolean) => boolean) => boolean } }).prosemirrorView;
        const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
        expect(view.someProp("handleKeyDown", (h) => h(view, ev))).toBe(true);
      });
      expect(editor.document.map((b) => b.type)).toEqual(["callout", "paragraph"]);
      expect(editor.document[0].children).toHaveLength(1);
    });
  });

  it("Enter outside a callout is left to BlockNote", async () => {
    await withEditor(async (editor) => {
      await load(editor, "Plain line\n");
      await act(async () => {
        editor.setTextCursorPosition(editor.document[0].id, "end");
        expect(editor.transact((tr) => enterInCallout(tr))).toBe(false);
      });
    });
  });
});
