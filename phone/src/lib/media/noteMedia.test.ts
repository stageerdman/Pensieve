// noteMedia.test.ts — the phone's media<->markdown bridge. Asserts the EXACT desktop
// format (single `![](ref)`, `pensieve:gallery` fence, ` | ` separator, line order) so a
// note authored on either app round-trips through the other.

import { describe, expect, it } from "vitest";
import {
  AUDIO_FENCE,
  collapseImages,
  encodeAudioNoteBlock,
  encodeImageNoteBlock,
  galleryMd,
  GALLERY_FENCE,
  IMAGE_FENCE,
  imageMd,
  isMediaPath,
  listMd,
  parseNoteContent,
  planInsert,
  reorderImages,
  serializeBlocks,
  stripMediaForPreview,
  type ListItemNode,
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

describe("noteMedia — pensieve:image fence (desktop resize/crop bridge)", () => {
  it("a default-size image stays the plain ![]() line", () => {
    expect(encodeImageNoteBlock({ kind: "image", ref: "media/1/a.png", caption: "c" })).toBe("![c](media/1/a.png)");
  });

  it("a resized image round-trips through a pensieve:image fence, not raw text", () => {
    const fence = "```" + IMAGE_FENCE + "\n" + "media/1/a.png\nwidth=0.5 aspect=0\n" + "\n```";
    const blocks = parseNoteContent(fence);
    expect(blocks).toEqual([{ kind: "image", ref: "media/1/a.png", width: 0.5 }]);
    expect(encodeImageNoteBlock(blocks[0] as Extract<NoteBlock, { kind: "image" }>)).toBe(
      "```" + IMAGE_FENCE + "\nmedia/1/a.png\nwidth=0.5 aspect=0\n```",
    );
  });

  it("a cropped image keeps aspect + posX/posY and a caption", () => {
    const fence = ["```" + IMAGE_FENCE, "media/1/b.png", "width=0.75 aspect=1.5 posX=30 posY=70", "a caption", "```"].join("\n");
    const blocks = parseNoteContent(fence);
    expect(blocks).toEqual([{ kind: "image", ref: "media/1/b.png", caption: "a caption", aspect: 1.5, posX: 30, posY: 70 }]);
    const out = serializeBlocks(blocks);
    expect(out).toBe(fence);
  });

  it("never falls back to a raw text block for a recognised fence", () => {
    const fence = "```" + IMAGE_FENCE + "\nmedia/1/a.png\nwidth=0.4 aspect=0\n```";
    expect(parseNoteContent(fence).map((b) => b.kind)).toEqual(["image"]);
  });
});

describe("noteMedia — pensieve:audio fence (voice recording)", () => {
  it("serializes a recording to the pensieve:audio fence, ref then caption", () => {
    expect(encodeAudioNoteBlock({ kind: "audio", ref: "media/1/a.m4a", caption: "note to self" })).toBe(
      "```" + AUDIO_FENCE + "\nmedia/1/a.m4a\nnote to self\n```",
    );
    expect(encodeAudioNoteBlock({ kind: "audio", ref: "media/1/a.m4a" })).toBe(
      "```" + AUDIO_FENCE + "\nmedia/1/a.m4a\n```",
    );
  });

  it("round-trips through parseNoteContent, not a raw text block", () => {
    const fence = "```" + AUDIO_FENCE + "\nmedia/1/a.m4a\na caption\n```";
    const blocks = parseNoteContent(fence);
    expect(blocks).toEqual([{ kind: "audio", ref: "media/1/a.m4a", caption: "a caption" }]);
    expect(serializeBlocks(blocks)).toBe(fence);
  });

  it("parses a recording embedded between prose", () => {
    const fence = "```" + AUDIO_FENCE + "\nmedia/1/a.m4a\n```";
    const body = "before\n" + fence + "\nafter";
    const blocks = parseNoteContent(body);
    expect(blocks.map((b) => b.kind)).toEqual(["text", "audio", "text"]);
  });
});

describe("noteMedia — markdown lists (bullet / numbered / checklist)", () => {
  it("parses a flat bullet list and serializes it back unchanged", () => {
    const md = "* bullet one\n* bullet two";
    const blocks = parseNoteContent(md);
    expect(blocks).toEqual([
      {
        kind: "list",
        items: [
          { ordered: false, text: "bullet one", children: [] },
          { ordered: false, text: "bullet two", children: [] },
        ],
      },
    ]);
    expect(serializeBlocks(blocks)).toBe(md);
  });

  it("parses a numbered list", () => {
    const md = "1. first\n2. second";
    const blocks = parseNoteContent(md);
    expect(blocks).toEqual([
      {
        kind: "list",
        items: [
          { ordered: true, text: "first", children: [] },
          { ordered: true, text: "second", children: [] },
        ],
      },
    ]);
    expect(serializeBlocks(blocks)).toBe(md);
  });

  it("parses a checklist (undone + done)", () => {
    const md = "* [ ] todo undone\n* [x] todo done";
    const blocks = parseNoteContent(md);
    expect(blocks).toEqual([
      {
        kind: "list",
        items: [
          { ordered: false, checked: false, text: "todo undone", children: [] },
          { ordered: false, checked: true, text: "todo done", children: [] },
        ],
      },
    ]);
    expect(serializeBlocks(blocks)).toBe(md);
  });

  it("keeps a 3-level nested bullet list stable (matches the desktop's 2-space indent)", () => {
    const md = "* l1\n  * l2\n    * l3";
    const blocks = parseNoteContent(md);
    const items = (blocks[0] as Extract<NoteBlock, { kind: "list" }>).items;
    expect(items[0].text).toBe("l1");
    expect(items[0].children[0].text).toBe("l2");
    expect(items[0].children[0].children[0].text).toBe("l3");
    expect(serializeBlocks(blocks)).toBe(md);
  });

  it("never falls back to raw text — lines never show a literal leading *", () => {
    const blocks = parseNoteContent("* a bullet");
    expect(blocks.map((b) => b.kind)).toEqual(["list"]);
  });

  it("a list embedded between prose round-trips the whole body", () => {
    const body = ["before", "* a", "* b", "after"].join("\n");
    expect(serializeBlocks(parseNoteContent(body))).toBe(body);
  });

  it("listMd mirrors flattenListTree for a tree built elsewhere", () => {
    const items: ListItemNode[] = [{ ordered: false, text: "x", children: [] }];
    expect(listMd(items)).toBe("* x");
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

  it("stripMediaForPreview also cleans a pensieve:image fence (resized image)", () => {
    const fence = "```" + IMAGE_FENCE + "\nmedia/1/a.png\nwidth=0.4 aspect=0\n```";
    expect(stripMediaForPreview(fence)).toBe("📷 Photo");
  });

  it("stripMediaForPreview turns a pensieve:audio fence into a clean marker", () => {
    const fence = "```" + AUDIO_FENCE + "\nmedia/1/a.m4a\na caption\n```";
    expect(stripMediaForPreview(fence)).toBe("🎙️ Recording");
  });
});
