import { describe, it, expect } from "vitest";
import { imagesOfMediaBlock, mergeMediaBlocksInto, type MergeEditor } from "./insertGroup";
import { parseGalleryImages } from "../../../lib/md/gallery";
import { isImageRef } from "./mediaLibrary";

// Pure logic behind "drag a media row onto a gallery to merge it in" and the library filter.
// The DOM drag wiring (pointer events, indicator) is owner-native-verified.

describe("imagesOfMediaBlock", () => {
  it("reads a single image block as one {url,caption}", () => {
    expect(imagesOfMediaBlock({ type: "image", props: { url: "u1", caption: "c" } })).toEqual([{ url: "u1", caption: "c" }]);
  });
  it("reads an imageGroup as its whole ordered list", () => {
    const images = JSON.stringify([{ url: "a" }, { url: "b", caption: "two" }]);
    // parseGalleryImages carries caption only when present, so the first entry has no caption key.
    expect(imagesOfMediaBlock({ type: "imageGroup", props: { images } })).toEqual([
      { url: "a" },
      { url: "b", caption: "two" },
    ]);
  });
  it("ignores an empty image and non-media blocks", () => {
    expect(imagesOfMediaBlock({ type: "image", props: { url: "" } })).toEqual([]);
    expect(imagesOfMediaBlock({ type: "paragraph" })).toEqual([]);
    expect(imagesOfMediaBlock(undefined)).toEqual([]);
  });
});

// A tiny in-memory editor over a fixed block list.
function fakeEditor(blocks: Array<{ id: string; type?: string; props?: Record<string, unknown> }>) {
  const byId = new Map(blocks.map((b) => [b.id, { ...b }]));
  const removed: string[] = [];
  const updates: Array<{ id: string; update: { type?: string; props?: { images?: string } } }> = [];
  const editor: MergeEditor = {
    getBlock: (id) => byId.get(id),
    updateBlock: (id, update) => updates.push({ id, update: update as never }),
    removeBlocks: (ids) => removed.push(...ids),
  };
  return { editor, removed, updates };
}

describe("mergeMediaBlocksInto", () => {
  it("merges an image row into a single-image target → a gallery, and removes the source", () => {
    const { editor, removed, updates } = fakeEditor([
      { id: "t", type: "image", props: { url: "target", caption: "T" } },
      { id: "s", type: "image", props: { url: "src", caption: "S" } },
    ]);
    const ok = mergeMediaBlocksInto(editor, "t", ["s"]);
    expect(ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("t");
    expect(updates[0].update.type).toBe("imageGroup");
    expect(parseGalleryImages(updates[0].update.props!.images)).toEqual([
      { url: "target", caption: "T" },
      { url: "src", caption: "S" },
    ]);
    expect(removed).toEqual(["s"]);
  });

  it("appends a dragged gallery's tiles into an existing gallery", () => {
    const { editor, updates, removed } = fakeEditor([
      { id: "t", type: "imageGroup", props: { images: JSON.stringify([{ url: "a" }]) } },
      { id: "s", type: "imageGroup", props: { images: JSON.stringify([{ url: "b" }, { url: "c" }]) } },
    ]);
    mergeMediaBlocksInto(editor, "t", ["s"]);
    expect(parseGalleryImages(updates[0].update.props!.images).map((i) => i.url)).toEqual(["a", "b", "c"]);
    expect(removed).toEqual(["s"]);
  });

  it("is a no-op (false) when the only source is the target itself", () => {
    const { editor, updates, removed } = fakeEditor([{ id: "t", type: "image", props: { url: "u" } }]);
    expect(mergeMediaBlocksInto(editor, "t", ["t"])).toBe(false);
    expect(updates).toHaveLength(0);
    expect(removed).toHaveLength(0);
  });
});

describe("isImageRef (library filter)", () => {
  it("accepts image extensions and rejects others / non-media paths", () => {
    expect(isImageRef("media/n1/abc.png")).toBe(true);
    expect(isImageRef("media/n1/abc.JPEG")).toBe(true);
    expect(isImageRef("media/n1/clip.mp4")).toBe(false);
    expect(isImageRef("notes/n1.md")).toBe(false);
  });
});
