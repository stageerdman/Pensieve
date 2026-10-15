// noteMedia.test.ts — the phone's media<->markdown bridge. Asserts the EXACT desktop
// format (single `![](ref)`, `pensieve:gallery` fence, ` | ` separator, line order) so a
// note authored on either app round-trips through the other.

import { describe, expect, it } from "vitest";
import {
  collapseImages,
  galleryMd,
  GALLERY_FENCE,
  imageMd,
  isMediaPath,
  parseNoteContent,
  planInsert,
  reorderImages,
  serializeBlocks,
  stripMediaForPreview,
  type NoteBlock,
} from "./noteMedia";

describe("noteMedia — single image", () => {
  it("serializes to the plain `![caption](ref)` form", () => {
    expect(imageMd("media/7/a.png", "a view")).toBe("![a view](media/7/a.png)");
    expect(imageMd("media/7/a.png")).toBe("![](media/7/a.png)");
  });

  it("parses a lone image line into an image block", () => {
    const blocks = parseNoteContent("![a view](media/7/a.png)");
    expect(blocks).toEqual([{ kind: "image", ref: "media/7/a.png", caption: "a view" }]);
  });

  it("keeps surrounding prose as text blocks", () => {
    const blocks = parseNoteContent("before\n![](media/7/a.png)\nafter");
    expect(blocks.map((b) => b.kind)).toEqual(["text", "image", "text"]);
  });
});

describe("noteMedia — gallery fence", () => {
  const images = [
    { ref: "media/7/a.png", caption: "first" },
    { ref: "media/7/b.png" },
    { ref: "media/7/c.png", caption: "third" },
  ];

  it("serializes to the pensieve:gallery fence, one `ref | caption` line per image", () => {
    const md = galleryMd(images);
    expect(md).toBe(
      "```" + GALLERY_FENCE + "\n" + "media/7/a.png | first\nmedia/7/b.png\nmedia/7/c.png | third" + "\n```",
    );
  });

  it("round-trips the fence back to a gallery block, order preserved", () => {
    const blocks = parseNoteContent(galleryMd(images));
    expect(blocks).toEqual([{ kind: "gallery", images }]);
  });

  it("parses a gallery embedded between prose", () => {
    const body = "intro line\n\n" + galleryMd(images) + "\n\noutro line";
    const blocks = parseNoteContent(body);
    expect(blocks.map((b) => b.kind)).toEqual(["text", "text", "gallery", "text", "text"]);
    expect((blocks[2] as Extract<NoteBlock, { kind: "gallery" }>).images).toEqual(images);
  });
});

describe("noteMedia — full round-trip", () => {
  it("serialize(parse(x)) === x for a mixed body", () => {
    const body = ["A title line", "some prose", galleryMd([{ ref: "media/1/x.jpg" }, { ref: "media/1/y.jpg", caption: "two" }]), "![solo](media/1/z.jpg)", "closing"].join("\n");
    expect(serializeBlocks(parseNoteContent(body))).toBe(body);
  });
});

describe("noteMedia — emergent gallery helpers", () => {
  it("collapseImages: 1 -> image, 2+ -> gallery, 0 -> null", () => {
    expect(collapseImages([])).toBeNull();
    expect(collapseImages([{ ref: "media/1/a.png", caption: "c" }])).toEqual({ kind: "image", ref: "media/1/a.png", caption: "c" });
    expect(collapseImages([{ ref: "a" }, { ref: "b" }])).toEqual({ kind: "gallery", images: [{ ref: "a" }, { ref: "b" }] });
  });

  it("planInsert mirrors collapse (1 single, 2+ gallery)", () => {
    expect(planInsert([{ ref: "a" }])?.kind).toBe("image");
    expect(planInsert([{ ref: "a" }, { ref: "b" }])?.kind).toBe("gallery");
  });

  it("reorderImages moves an item and is pure", () => {
    const imgs = [{ ref: "a" }, { ref: "b" }, { ref: "c" }];
    expect(reorderImages(imgs, 0, 2)).toEqual([{ ref: "b" }, { ref: "c" }, { ref: "a" }]);
    expect(imgs[0].ref).toBe("a"); // original untouched
    expect(reorderImages(imgs, 1, 1)).toEqual(imgs); // no-op copy
    expect(reorderImages(imgs, 5, 0)).toEqual(imgs); // out-of-range guard
  });
});

describe("noteMedia — path + preview", () => {
  it("isMediaPath: vault refs yes, direct urls no", () => {
    expect(isMediaPath("media/7/a.png")).toBe(true);
    expect(isMediaPath("data:image/png;base64,AAAA")).toBe(false);
    expect(isMediaPath("https://x/y.png")).toBe(false);
  });

  it("stripMediaForPreview turns media into a clean marker", () => {
    expect(stripMediaForPreview("hello\n![a cat](media/1/a.png)")).toBe("hello\n📷 a cat");
    expect(stripMediaForPreview("![](media/1/a.png)")).toBe("📷 Photo");
    expect(stripMediaForPreview(galleryMd([{ ref: "a" }, { ref: "b" }]))).toBe("📷 Photos");
  });
});
