import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_IMAGE_WIDTH,
  IMAGE_FENCE,
  encodeImageBlock,
  isImageBlock,
  reconstructImageFence,
  resolveImageUrls,
  imageFilename,
} from "./image";
import { registerMediaUrl, _resetMediaUrlRegistry } from "../media/url";

// Pure unit tests for the image markdown bridge — no BlockNote runtime. The full editor
// round-trip (native `![]()` in/out) is covered by media/imageRoundTrip.test.tsx.

const REF = "media/note1/abc-123.png";

beforeEach(() => _resetMediaUrlRegistry());

describe("image markdown bridge", () => {
  it("recognises an image block", () => {
    expect(isImageBlock({ type: "image" })).toBe(true);
    expect(isImageBlock({ type: "paragraph" })).toBe(false);
  });

  it("SAVE: a default-width image → a bare image block carrying the ref (serialises as ![]())", () => {
    // The loadable url was registered against its ref at load; refForUrl rewrites it back.
    registerMediaUrl(REF, "asset://localhost/abc-123.png");
    const out = encodeImageBlock({
      type: "image",
      props: { url: "asset://localhost/abc-123.png", caption: "a cat", width: DEFAULT_IMAGE_WIDTH },
    });
    expect(out.type).toBe("image");
    expect(out.props).toEqual({ url: REF, caption: "a cat", width: DEFAULT_IMAGE_WIDTH });
  });

  it("SAVE: keeps an external (unregistered) url as-is", () => {
    const out = encodeImageBlock({
      type: "image",
      props: { url: "https://example.com/x.png", caption: "", width: DEFAULT_IMAGE_WIDTH },
    });
    expect(out.props!.url).toBe("https://example.com/x.png");
  });

  it("SAVE: a non-default width rides a pensieve:image fence (ref, width, caption)", () => {
    registerMediaUrl(REF, "blob:xyz");
    const out = encodeImageBlock({
      type: "image",
      props: { url: "blob:xyz", caption: "wide one", width: 0.5 },
    });
    expect(out.type).toBe("codeBlock");
    expect((out.props as { language: string }).language).toBe(IMAGE_FENCE);
    const text = (out.content as Array<{ text: string }>)[0].text;
    expect(text).toBe(`${REF}\n0.5\nwide one`);
  });

  it("LOAD: a pensieve:image fence → an image block with width + caption preserved", () => {
    const block = reconstructImageFence({
      type: "codeBlock",
      props: { language: IMAGE_FENCE },
      content: [{ type: "text", text: `${REF}\n0.25\nhello world` }],
    });
    expect(block).not.toBeNull();
    expect(block!.props).toEqual({ url: REF, caption: "hello world", width: 0.25 });
  });

  it("LOAD: a fence with no caption line → empty caption", () => {
    const block = reconstructImageFence({
      type: "codeBlock",
      props: { language: IMAGE_FENCE },
      content: [{ type: "text", text: `${REF}\n1` }],
    });
    expect(block!.props).toEqual({ url: REF, caption: "", width: 1 });
  });

  it("LOAD: a non-image fence is ignored", () => {
    expect(reconstructImageFence({ type: "codeBlock", props: { language: "pensieve:toggle" } })).toBeNull();
    expect(reconstructImageFence({ type: "paragraph" })).toBeNull();
  });

  it("round-trips a non-default width through encode→reconstruct", () => {
    registerMediaUrl(REF, "blob:xyz");
    const fence = encodeImageBlock({ type: "image", props: { url: "blob:xyz", caption: "cap", width: 0.5 } });
    const back = reconstructImageFence(fence)!;
    expect(back.props).toEqual({ url: REF, caption: "cap", width: 0.5 });
  });

  it("resolveImageUrls keeps the ref when the store can't resolve it (broken/missing — never crashes)", async () => {
    // No media backend in jsdom, so resolveMediaUrl returns null → the ref is preserved,
    // so the block still round-trips on the next save and the UI shows the broken state.
    const [block] = await resolveImageUrls([
      { type: "image", props: { url: REF, caption: "", width: 0.75 }, children: [] },
    ]);
    expect(block.props!.url).toBe(REF);
  });

  it("resolveImageUrls leaves a non-media (external) url untouched", async () => {
    const [block] = await resolveImageUrls([
      { type: "image", props: { url: "https://example.com/x.png", caption: "", width: 0.75 } },
    ]);
    expect(block.props!.url).toBe("https://example.com/x.png");
  });

  it("imageFilename derives <mediaId>.<ext> from a ref (for the broken state)", () => {
    registerMediaUrl(REF, "asset://localhost/abc-123.png");
    expect(imageFilename("asset://localhost/abc-123.png")).toBe("abc-123.png");
    expect(imageFilename(REF)).toBe("abc-123.png");
    expect(imageFilename("https://example.com/x.png")).toBe("");
  });
});
