import { describe, it, expect, beforeEach } from "vitest";
import {
  parseGalleryImages,
  stringifyGalleryImages,
  encodeImageGroupBlock,
  reconstructGalleryFence,
  isImageGroupBlock,
  GALLERY_FENCE,
  type GalleryImage,
} from "./gallery";
import { registerMediaUrl, _resetMediaUrlRegistry } from "../media/url";

// The pure `pensieve:gallery` bridge: a multi-image group round-trips through one fence
// (one `ref | caption` line per image, caption optional), order == line order, and a
// loadable url rewrites back to its vault ref on save (refForUrl).

beforeEach(() => _resetMediaUrlRegistry());

const A = "media/n1/a.png";
const B = "media/n1/b.png";
const C = "media/n1/c.png";

const fenceText = (b: { content?: unknown }): string =>
  (Array.isArray(b.content) && (b.content[0] as { text?: string }).text) || "";

function groupBlock(images: GalleryImage[]) {
  return { type: "imageGroup", props: { images: stringifyGalleryImages(images) } };
}

describe("parse/stringify gallery images", () => {
  it("round-trips the ordered list, dropping empty captions", () => {
    const imgs: GalleryImage[] = [{ url: A, caption: "x" }, { url: B }];
    expect(parseGalleryImages(stringifyGalleryImages(imgs))).toEqual([{ url: A, caption: "x" }, { url: B }]);
  });
  it("is defensive against junk JSON", () => {
    expect(parseGalleryImages("not json")).toEqual([]);
    expect(parseGalleryImages("{}")).toEqual([]);
    expect(parseGalleryImages(undefined)).toEqual([]);
    expect(parseGalleryImages('[{"nope":1}]')).toEqual([]);
  });
});

describe("encodeImageGroupBlock → pensieve:gallery fence", () => {
  it("emits one `ref | caption` line per image, order preserved, captions optional", () => {
    const block = groupBlock([{ url: A, caption: "first" }, { url: B }, { url: C, caption: "third" }]);
    const fence = encodeImageGroupBlock(block);
    expect(fence.type).toBe("codeBlock");
    expect((fence.props as { language: string }).language).toBe(GALLERY_FENCE);
    expect(fenceText(fence)).toBe(`${A} | first\n${B}\n${C} | third`);
  });

  it("rewrites a loadable url → its vault ref (refForUrl), keeps externals verbatim", () => {
    registerMediaUrl(A, "asset://localhost/a.png");
    const block = groupBlock([{ url: "asset://localhost/a.png", caption: "cat" }, { url: "https://x.com/y.png" }]);
    expect(fenceText(encodeImageGroupBlock(block))).toBe(`${A} | cat\nhttps://x.com/y.png`);
  });
});

describe("reconstructGalleryFence → imageGroup block", () => {
  it("parses lines back into an ordered image list (captions optional)", () => {
    const fence = { type: "codeBlock", props: { language: GALLERY_FENCE }, content: [{ type: "text", text: `${A} | first\n${B}\n${C} | third` }] };
    const block = reconstructGalleryFence(fence)!;
    expect(block.type).toBe("imageGroup");
    expect(parseGalleryImages((block.props as { images: string }).images)).toEqual([
      { url: A, caption: "first" },
      { url: B },
      { url: C, caption: "third" },
    ]);
  });

  it("returns null for a non-gallery block", () => {
    expect(reconstructGalleryFence({ type: "codeBlock", props: { language: "pensieve:image" }, content: [] })).toBeNull();
    expect(reconstructGalleryFence({ type: "paragraph" })).toBeNull();
  });
});

describe("full bridge round-trip", () => {
  it("encode → reconstruct preserves images, captions and order", () => {
    const original: GalleryImage[] = [{ url: A, caption: "one" }, { url: B }, { url: C, caption: "three" }];
    const fence = encodeImageGroupBlock(groupBlock(original));
    const back = reconstructGalleryFence({ ...fence, content: [{ text: fenceText(fence) }] })!;
    expect(parseGalleryImages((back.props as { images: string }).images)).toEqual(original);
  });
});

describe("isImageGroupBlock", () => {
  it("recognises the block type", () => {
    expect(isImageGroupBlock({ type: "imageGroup" })).toBe(true);
    expect(isImageGroupBlock({ type: "image" })).toBe(false);
  });
});
