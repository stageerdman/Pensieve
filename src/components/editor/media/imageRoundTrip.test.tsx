import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "../editorSchema";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../lib/md/extended";
import { registerMediaUrl, _resetMediaUrlRegistry } from "../../../lib/media/url";

// The real editor round-trip for a single image (uses our actual schema with the custom
// image block). A default-width image must serialise to plain `![caption](media/…)` and
// parse back; a non-default width must ride the pensieve:image fence; both idempotent.
// Save-time url→ref rewrite goes through refForUrl (the registry).

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

const REF = "media/note1/abc-123.png";

type Editor = Parameters<typeof blocksToExtendedMd>[0] & {
  tryParseMarkdownToBlocks: (md: string) => Promise<unknown[]>;
};

// Mounts a real editor with our schema and resolves once it's ready to convert.
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
  // Flushing effects inside act + a macrotask tick fires the mount effect and lets its
  // async body (the conversions) settle; poll until it reports finished.
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

describe("single image .md round-trip (real editor + our schema)", () => {
  it("serialises a default-width image to plain ![caption](media/…) and parses it back", async () => {
    await withEditor(async (editor) => {
      const md = await blocksToExtendedMd(editor, [
        { type: "image", props: { url: REF, caption: "a cat", width: 0.75 } },
      ]);
      expect(md).toBe(`![a cat](${REF})\n`);
      expect(md).not.toContain("pensieve:");

      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props: Record<string, unknown> }>;
      expect(blocks[0].type).toBe("image");
      expect(blocks[0].props.caption).toBe("a cat");
      expect(blocks[0].props.url).toBe(REF); // store can't resolve in jsdom → ref kept
      expect(blocks[0].props.width).toBe(0.75);

      // idempotent
      expect(await blocksToExtendedMd(editor, blocks)).toBe(md);
    });
    cleanup();
  });

  it("round-trips a caption containing markdown-special characters", async () => {
    await withEditor(async (editor) => {
      const md = await blocksToExtendedMd(editor, [
        { type: "image", props: { url: REF, caption: "a *starry* night", width: 0.75 } },
      ]);
      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ props: { caption: string } }>;
      expect(blocks[0].props.caption).toBe("a *starry* night");
      expect(await blocksToExtendedMd(editor, blocks)).toBe(md); // idempotent
    });
    cleanup();
  });

  it("carries a non-default width through the pensieve:image fence", async () => {
    await withEditor(async (editor) => {
      const md = await blocksToExtendedMd(editor, [
        { type: "image", props: { url: REF, caption: "wide", width: 0.5 } },
      ]);
      expect(md).toContain("```pensieve:image");
      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props: Record<string, unknown> }>;
      expect(blocks[0].type).toBe("image");
      expect(blocks[0].props.width).toBe(0.5);
      expect(blocks[0].props.caption).toBe("wide");
      expect(blocks[0].props.url).toBe(REF);
      expect(await blocksToExtendedMd(editor, blocks)).toBe(md); // idempotent
    });
    cleanup();
  });

  it("rewrites a loadable url → its vault ref at save (refForUrl)", async () => {
    await withEditor(async (editor) => {
      const loadable = "asset://localhost/abc-123.png";
      registerMediaUrl(REF, loadable); // as load-time resolution would have
      const md = await blocksToExtendedMd(editor, [
        { type: "image", props: { url: loadable, caption: "cat", width: 0.75 } },
      ]);
      expect(md).toBe(`![cat](${REF})\n`); // the ref, not the opaque asset url
    });
    cleanup();
  });

  it("keeps an external image url verbatim (not saved locally)", async () => {
    await withEditor(async (editor) => {
      const ext = "https://example.com/x.png";
      const md = await blocksToExtendedMd(editor, [
        { type: "image", props: { url: ext, caption: "web", width: 0.75 } },
      ]);
      expect(md).toBe(`![web](${ext})\n`);
      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ props: { url: string } }>;
      expect(blocks[0].props.url).toBe(ext); // untouched by resolveImageUrls
    });
    cleanup();
  });
});
