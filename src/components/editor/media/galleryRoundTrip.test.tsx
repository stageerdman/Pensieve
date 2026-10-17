import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "../editorSchema";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../lib/md/extended";
import { parseGalleryImages, stringifyGalleryImages } from "../../../lib/md/gallery";
import { _resetMediaUrlRegistry } from "../../../lib/media/url";

// The real editor round-trip for a gallery (our actual schema with the imageGroup block).
// A 2+-image group must serialise to a `pensieve:gallery` fence and parse back with order +
// captions intact; a group degraded to a single `image` block must serialise to plain
// `![]()` (the collapse path's markdown).

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

const A = "media/n1/a.png";
const B = "media/n1/b.png";
const C = "media/n1/c.png";

type Editor = Parameters<typeof blocksToExtendedMd>[0];

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

describe("gallery .md round-trip (real editor + our schema)", () => {
  it("serialises a 2+-image group to a pensieve:gallery fence and parses it back in order", async () => {
    await withEditor(async (editor) => {
      const images = [{ url: A, caption: "one" }, { url: B }, { url: C, caption: "three" }];
      const md = await blocksToExtendedMd(editor, [{ type: "imageGroup", props: { images: stringifyGalleryImages(images) } }]);
      expect(md).toContain("```pensieve:gallery");
      expect(md).toContain(`${A} | one`);
      expect(md).toContain(B);
      expect(md).toContain(`${C} | three`);

      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props: { images: string } }>;
      expect(blocks[0].type).toBe("imageGroup");
      expect(parseGalleryImages(blocks[0].props.images)).toEqual(images); // order + captions preserved

      // idempotent
      expect(await blocksToExtendedMd(editor, blocks)).toBe(md);
    });
    cleanup();
  });

  it("degrades a single-image block to plain ![]() (the collapse path)", async () => {
    await withEditor(async (editor) => {
      // After a group collapses to one image, the block is a plain `image` block again.
      const md = await blocksToExtendedMd(editor, [{ type: "image", props: { url: A, caption: "solo", width: 0.75 } }]);
      expect(md).toBe(`![solo](${A})\n`);
      expect(md).not.toContain("pensieve:");
    });
    cleanup();
  });

  it("round-trips a gallery containing an AUDIO entry through the real editor schema", async () => {
    await withEditor(async (editor) => {
      const REC = "media/n1/rec-9.m4a";
      const images = [{ url: A, caption: "photo" }, { url: REC, kind: "audio" as const }, { url: B }];
      const md = await blocksToExtendedMd(editor, [
        { type: "imageGroup", props: { images: stringifyGalleryImages(images) } },
      ]);
      // the audio entry must carry the sigil in the fence
      expect(md).toContain(`audio:${REC}`);

      const blocks = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props: { images: string } }>;
      expect(blocks[0].type).toBe("imageGroup");
      const back = parseGalleryImages(blocks[0].props.images);
      // kind + order survive the real editor's block schema (the prop is a JSON string)
      expect(back).toEqual(images);
      expect(back[1].kind).toBe("audio");
      // idempotent
      expect(await blocksToExtendedMd(editor, blocks)).toBe(md);
    });
    cleanup();
  });

  it("round-trips a gallery sitting between paragraphs", async () => {
    await withEditor(async (editor) => {
      const images = [{ url: A }, { url: B }];
      const blocks = [
        { type: "paragraph", content: [{ type: "text", text: "before", styles: {} }] },
        { type: "imageGroup", props: { images: stringifyGalleryImages(images) } },
        { type: "paragraph", content: [{ type: "text", text: "after", styles: {} }] },
      ];
      const md = await blocksToExtendedMd(editor, blocks);
      const back = (await extendedMdToBlocks(editor, md)) as Array<{ type: string; props?: { images?: string } }>;
      const group = back.find((b) => b.type === "imageGroup")!;
      expect(parseGalleryImages(group.props!.images)).toEqual(images);
      expect(await blocksToExtendedMd(editor, back)).toBe(md);
    });
    cleanup();
  });
});
