import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { editorSchema } from "../editorSchema";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../lib/md/extended";
import { parseGalleryImages, stringifyGalleryImages, GALLERY_FENCE as DESKTOP_GALLERY_FENCE } from "../../../lib/md/gallery";
import { _resetMediaUrlRegistry } from "../../../lib/media/url";
// The PHONE implementation — a separate app, a separate re-statement of the same format.
import {
  parseNoteContent,
  serializeBlocks,
  imageMd,
  galleryMd,
  GALLERY_FENCE as PHONE_GALLERY_FENCE,
  GALLERY_SEP as PHONE_GALLERY_SEP,
  type NoteBlock,
} from "../../../../phone/src/lib/media/noteMedia";

// ── THE SHARED-FORMAT GUARD ─────────────────────────────────────────────────
// Desktop (src/lib/md/{image,gallery}.ts + the custom BlockNote blocks) and phone
// (phone/src/lib/media/noteMedia.ts) BOTH implement the `.md` media format *independently*
// (the two apps share only design tokens — see the decoupling decision in update v1.md).
// This test locks the two implementations in LOCKSTEP against one canonical fixture set:
//   • single image →  `![caption](media/<noteId>/<mediaId>.<ext>)`
//   • gallery      →  a `pensieve:gallery` fence, one `ref | caption` line per image,
//                      display order = line order
// For every fixture BOTH implementations must (a) SERIALIZE to the byte-identical canonical
// string and (b) PARSE that string back to the identical ordered {ref, caption} structure.
// If the duplication ever drifts — a different fence token, a different separator, a changed
// escaping or ordering rule — one side stops matching the canonical and this test FAILS.
// It is the regression guard that keeps the two independent parsers/serializers honest.

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as never;
}

type Editor = Parameters<typeof blocksToExtendedMd>[0] & {
  tryParseMarkdownToBlocks: (md: string) => Promise<unknown[]>;
};

// Mounts the REAL editor with our actual schema (custom image/imageGroup blocks), the only
// way to get the faithful desktop `.md` — server-util would use BlockNote's built-in image
// block, which serializes to a <figure> blob, not `![]()` (the Phase-1 reason for the custom
// block). Mirrors imageRoundTrip.test.tsx / galleryRoundTrip.test.tsx.
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

/** One image in canonical, implementation-independent form. */
interface Img {
  ref: string;
  caption?: string;
}

/** A canonical fixture: the structured images + the ONE markdown string both sides must
 *  produce and consume. `images.length === 1` → a single image; 2+ → a gallery. */
interface Fixture {
  name: string;
  images: Img[];
  md: string;
}

const N = "note1";
const A = `media/${N}/a.png`;
const B = `media/${N}/b.png`;
const C = `media/${N}/c.png`;
const D = `media/${N}/d.jpg`;

// Canonical captions are plain prose. Markdown-special characters in a caption escape
// asymmetrically between the two stacks (remark escapes on desktop, the phone does not) —
// a known, documented limitation (see issues.txt / wiki.md), deliberately NOT asserted here.
const FIXTURES: Fixture[] = [
  {
    name: "single image with a caption",
    images: [{ ref: A, caption: "a quiet morning" }],
    md: `![a quiet morning](${A})`,
  },
  {
    name: "single image, no caption",
    images: [{ ref: A }],
    md: `![](${A})`,
  },
  {
    name: "gallery of three, mixed captions, order preserved",
    images: [{ ref: A, caption: "first" }, { ref: B }, { ref: C, caption: "third" }],
    md: ["```" + "pensieve:gallery", `${A} | first`, B, `${C} | third`, "```"].join("\n"),
  },
  {
    name: "gallery of two, no captions",
    images: [{ ref: A }, { ref: B }],
    md: ["```" + "pensieve:gallery", A, B, "```"].join("\n"),
  },
  {
    name: "gallery caption containing the separator (split on the FIRST ' | ')",
    images: [{ ref: A, caption: "a | b | c" }, { ref: D, caption: "plain" }],
    md: ["```" + "pensieve:gallery", `${A} | a | b | c`, `${D} | plain`, "```"].join("\n"),
  },
];

const isGallery = (f: Fixture) => f.images.length > 1;

// ── desktop adapters (block layer → canonical) ──
function desktopBlockFor(f: Fixture): unknown {
  if (isGallery(f)) {
    return {
      type: "imageGroup",
      props: { images: stringifyGalleryImages(f.images.map((i) => ({ url: i.ref, ...(i.caption ? { caption: i.caption } : {}) }))) },
    };
  }
  const img = f.images[0];
  return { type: "image", props: { url: img.ref, caption: img.caption ?? "", width: 0.75 } };
}

function desktopParse(blocks: Array<{ type: string; props: Record<string, unknown> }>): Img[] {
  const b = blocks.find((x) => x.type === "image" || x.type === "imageGroup");
  if (!b) return [];
  if (b.type === "imageGroup") {
    return parseGalleryImages(b.props.images as string).map((g) => ({ ref: g.url, ...(g.caption ? { caption: g.caption } : {}) }));
  }
  return [{ ref: b.props.url as string, ...(b.props.caption ? { caption: b.props.caption as string } : {}) }];
}

// ── phone adapters (string layer → canonical) ──
function phoneBlockFor(f: Fixture): NoteBlock {
  if (isGallery(f)) return { kind: "gallery", images: f.images.map((i) => ({ ref: i.ref, ...(i.caption ? { caption: i.caption } : {}) })) };
  const img = f.images[0];
  return { kind: "image", ref: img.ref, ...(img.caption ? { caption: img.caption } : {}) };
}

function phoneParse(md: string): Img[] {
  return parseNoteContent(md).flatMap((b): Img[] => {
    if (b.kind === "image") return [{ ref: b.ref, ...(b.caption ? { caption: b.caption } : {}) }];
    if (b.kind === "gallery") return b.images.map((i) => ({ ref: i.ref, ...(i.caption ? { caption: i.caption } : {}) }));
    return [];
  });
}

beforeEach(() => _resetMediaUrlRegistry());

describe("shared media-format guard — desktop ⟷ phone lockstep", () => {
  it("the two implementations agree on the format CONSTANTS", () => {
    // The one token that, if it drifts on either side, silently breaks cross-app rendering.
    expect(PHONE_GALLERY_FENCE).toBe(DESKTOP_GALLERY_FENCE);
    expect(PHONE_GALLERY_FENCE).toBe("pensieve:gallery");
    expect(PHONE_GALLERY_SEP).toBe(" | ");
  });

  it("phone SERIALIZE produces the canonical string for every fixture", () => {
    for (const f of FIXTURES) {
      const phoneMd = serializeBlocks([phoneBlockFor(f)]).trim();
      expect(phoneMd, f.name).toBe(f.md);
    }
  });

  it("phone PARSE recovers the canonical structure for every fixture", () => {
    for (const f of FIXTURES) {
      expect(phoneParse(f.md), f.name).toEqual(f.images);
    }
  });

  it("phone round-trips every canonical string (parse → serialize → same bytes)", () => {
    for (const f of FIXTURES) {
      const round = serializeBlocks(parseNoteContent(f.md)).trim();
      expect(round, f.name).toBe(f.md);
    }
  });

  it("the phone helpers emit the same single-image / gallery strings as the fixtures", () => {
    expect(imageMd(A, "a quiet morning")).toBe(`![a quiet morning](${A})`);
    expect(imageMd(A)).toBe(`![](${A})`);
    expect(galleryMd([{ ref: A, caption: "first" }, { ref: B }, { ref: C, caption: "third" }])).toBe(
      ["```" + "pensieve:gallery", `${A} | first`, B, `${C} | third`, "```"].join("\n"),
    );
  });

  it("desktop SERIALIZE (real editor + our schema) produces the canonical string, byte-identical to phone", async () => {
    await withEditor(async (editor) => {
      for (const f of FIXTURES) {
        const desktopMd = (await blocksToExtendedMd(editor, [desktopBlockFor(f)])).trim();
        expect(desktopMd, f.name).toBe(f.md);
        // and therefore identical to what the phone produced
        expect(desktopMd, `${f.name} (desktop===phone)`).toBe(serializeBlocks([phoneBlockFor(f)]).trim());
      }
    });
    cleanup();
  });

  it("desktop PARSE (real editor + our schema) recovers the canonical structure, agreeing with phone", async () => {
    await withEditor(async (editor) => {
      for (const f of FIXTURES) {
        const blocks = (await extendedMdToBlocks(editor, f.md)) as Array<{ type: string; props: Record<string, unknown> }>;
        const desktopImgs = desktopParse(blocks);
        expect(desktopImgs, f.name).toEqual(f.images);
        // the two independent parsers agree
        expect(desktopImgs, `${f.name} (desktop===phone)`).toEqual(phoneParse(f.md));
      }
    });
    cleanup();
  });
});
