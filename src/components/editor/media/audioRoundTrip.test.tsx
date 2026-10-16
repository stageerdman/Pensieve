import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "../editorSchema";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../lib/md/extended";
import { registerMediaUrl, _resetMediaUrlRegistry } from "../../../lib/media/url";

// The real editor round-trip for an audio block (our actual schema with the custom audio
// block). Audio has no plain CommonMark form, so it ALWAYS rides a pensieve:audio fence
// carrying the vault ref; the transcript is a separate sidecar, never in the .md.

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

const REF = "media/note1/rec-123.mp3";

type Editor = Parameters<typeof blocksToExtendedMd>[0] & {
  tryParseMarkdownToBlocks: (md: string) => Promise<unknown[]>;
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
  if (!finished) throw new Error("withEditor: run never completed");
}

beforeEach(() => _resetMediaUrlRegistry());

describe("audio .md round-trip (real editor + our schema)", () => {
  it("serialises an audio block to a pensieve:audio fence carrying the ref, and parses it back", async () => {
    await withEditor(async (editor) => {
      const md = await blocksToExtendedMd(editor, [
        { type: "audio", props: { url: REF, caption: "" } },
      ]);
      expect(md).toContain("```pensieve:audio");
      expect(md).toContain(REF);

      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props: Record<string, unknown> }>;
      expect(blocks[0].type).toBe("audio");
      expect(blocks[0].props.url).toBe(REF); // store can't resolve in jsdom → ref kept
      expect(blocks[0].props.caption).toBe("");

      expect(await blocksToExtendedMd(editor, blocks)).toBe(md); // idempotent
    });
    cleanup();
  });

  it("round-trips a caption", async () => {
    await withEditor(async (editor) => {
      const md = await blocksToExtendedMd(editor, [
        { type: "audio", props: { url: REF, caption: "Sales call — Dominik" } },
      ]);
      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props: { caption: string } }>;
      expect(blocks[0].type).toBe("audio");
      expect(blocks[0].props.caption).toBe("Sales call — Dominik");
      expect(await blocksToExtendedMd(editor, blocks)).toBe(md); // idempotent
    });
    cleanup();
  });

  it("rewrites a loadable url → its vault ref at save (refForUrl)", async () => {
    await withEditor(async (editor) => {
      const loadable = "asset://localhost/rec-123.mp3";
      registerMediaUrl(REF, loadable);
      const md = await blocksToExtendedMd(editor, [
        { type: "audio", props: { url: loadable, caption: "call" } },
      ]);
      expect(md).toContain(REF); // the ref, not the opaque asset url
      expect(md).not.toContain(loadable);
    });
    cleanup();
  });

  it("does NOT write transcript data into the .md (sidecar only)", async () => {
    await withEditor(async (editor) => {
      const md = await blocksToExtendedMd(editor, [
        { type: "audio", props: { url: REF, caption: "call" } },
      ]);
      expect(md).not.toContain("transcript");
      expect(md).not.toContain("segments");
    });
    cleanup();
  });
});
