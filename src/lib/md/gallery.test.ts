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

describe("gallery height (h= fence header)", () => {
  it("emits an `h=<px>` header line before the images when height > 0", () => {
    const fence = encodeImageGroupBlock({ type: "imageGroup", props: { images: JSON.stringify([{ url: A }, { url: B }]), height: 320 } });
    expect(fenceText(fence)).toBe(`h=320\n${A}\n${B}`);
  });

  it("omits the header when height is 0 / absent (old galleries unchanged)", () => {
    const fence = encodeImageGroupBlock({ type: "imageGroup", props: { images: JSON.stringify([{ url: A }]), height: 0 } });
    expect(fenceText(fence)).toBe(A);
  });

  it("reconstruct reads the height header into a prop and strips it from the images", () => {
    const fence = { type: "codeBlock", props: { language: GALLERY_FENCE }, content: [{ type: "text", text: `h=240\n${A} | cap\n${B}` }] };
    const block = reconstructGalleryFence(fence)!;
    expect((block.props as { height?: number }).height).toBe(240);
    expect(parseGalleryImages((block.props as { images: string }).images)).toEqual([{ url: A, caption: "cap" }, { url: B }]);
  });

  it("round-trips height through encode → reconstruct", () => {
    const fence = encodeImageGroupBlock({ type: "imageGroup", props: { images: JSON.stringify([{ url: A }, { url: B }]), height: 288 } });
    const back = reconstructGalleryFence({ ...fence, content: [{ text: fenceText(fence) }] })!;
    expect((back.props as { height?: number }).height).toBe(288);
  });
});

describe("isImageGroupBlock", () => {
  it("recognises the block type", () => {
    expect(isImageGroupBlock({ type: "imageGroup" })).toBe(true);
    expect(isImageGroupBlock({ type: "image" })).toBe(false);
  });
});

describe("audio entries in a gallery", () => {
  const REC = "media/n1/rec-9.m4a";

  it("round-trips an audio entry via the audio: sigil, preserving kind + order + caption", () => {
    const images: GalleryImage[] = [
      { url: A, caption: "a photo" },
      { url: REC, caption: "the call", kind: "audio" },
      { url: B },
    ];
    const fence = encodeImageGroupBlock(groupBlock(images));
    const text = fenceText(fence);
    // the audio line carries the sigil; image lines do not
    expect(text).toContain(`audio:${REC} | the call`);
    expect(text).toContain(`${A} | a photo`);
    expect(text).not.toContain(`audio:${A}`);

    const back = reconstructGalleryFence(fence)!;
    const parsed = parseGalleryImages((back.props as { images: string }).images);
    expect(parsed).toEqual([
      { url: A, caption: "a photo" },
      { url: REC, caption: "the call", kind: "audio" },
      { url: B },
    ]);
  });

  it("an audio entry with no caption round-trips too", () => {
    const fence = encodeImageGroupBlock(groupBlock([{ url: REC, kind: "audio" }, { url: A }]));
    expect(fenceText(fence).split("\n")[0]).toBe(`audio:${REC}`);
    const parsed = parseGalleryImages((reconstructGalleryFence(fence)!.props as { images: string }).images);
    expect(parsed[0]).toEqual({ url: REC, kind: "audio" });
    expect(parsed[1]).toEqual({ url: A });
  });

  it("a legacy image-only fence (no sigil) still parses as all images", () => {
    const legacy = {
      type: "codeBlock",
      props: { language: GALLERY_FENCE },
      content: [{ type: "text", text: `${A} | one\n${B}`, styles: {} }],
    };
    const parsed = parseGalleryImages((reconstructGalleryFence(legacy)!.props as { images: string }).images);
    expect(parsed.every((p) => p.kind === undefined)).toBe(true);
    expect(parsed.map((p) => p.url)).toEqual([A, B]);
  });
});
