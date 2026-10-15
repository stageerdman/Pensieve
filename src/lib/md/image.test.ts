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
    expect(out.props).toEqual({ url: REF, caption: "a cat", width: DEFAULT_IMAGE_WIDTH, aspect: 0 });
  });

  it("SAVE: keeps an external (unregistered) url as-is", () => {
    const out = encodeImageBlock({
      type: "image",
      props: { url: "https://example.com/x.png", caption: "", width: DEFAULT_IMAGE_WIDTH },
    });
    expect(out.props!.url).toBe("https://example.com/x.png");
  });

  it("SAVE: a non-default width rides a pensieve:image fence (ref, params line, caption)", () => {
    registerMediaUrl(REF, "blob:xyz");
    const out = encodeImageBlock({
      type: "image",
      props: { url: "blob:xyz", caption: "wide one", width: 0.5 },
    });
    expect(out.type).toBe("codeBlock");
    expect((out.props as { language: string }).language).toBe(IMAGE_FENCE);
    const text = (out.content as Array<{ text: string }>)[0].text;
    expect(text).toBe(`${REF}\nwidth=0.5 aspect=0\nwide one`);
  });

  it("SAVE: an explicit aspect (reshaped box) also rides the fence even at default width", () => {
    registerMediaUrl(REF, "blob:xyz");
    const out = encodeImageBlock({
      type: "image",
      props: { url: "blob:xyz", caption: "", width: DEFAULT_IMAGE_WIDTH, aspect: 1.5 },
    });
    expect(out.type).toBe("codeBlock");
    const text = (out.content as Array<{ text: string }>)[0].text;
    expect(text).toBe(`${REF}\nwidth=${DEFAULT_IMAGE_WIDTH} aspect=1.5`);
  });

  it("LOAD: a pensieve:image fence (params line) → width + aspect + caption preserved", () => {
    const block = reconstructImageFence({
      type: "codeBlock",
      props: { language: IMAGE_FENCE },
      content: [{ type: "text", text: `${REF}\nwidth=0.25 aspect=1.5\nhello world` }],
    });
    expect(block).not.toBeNull();
    expect(block!.props).toEqual({ url: REF, caption: "hello world", width: 0.25, aspect: 1.5, posX: 50, posY: 50 });
  });

  it("LOAD: accepts the old positional fence (ref, width, caption) for back-compat", () => {
    const block = reconstructImageFence({
      type: "codeBlock",
      props: { language: IMAGE_FENCE },
      content: [{ type: "text", text: `${REF}\n1\nhello world` }],
    });
    expect(block!.props).toEqual({ url: REF, caption: "hello world", width: 1, aspect: 0, posX: 50, posY: 50 });
  });

  it("LOAD: a non-image fence is ignored", () => {
    expect(reconstructImageFence({ type: "codeBlock", props: { language: "pensieve:toggle" } })).toBeNull();
    expect(reconstructImageFence({ type: "paragraph" })).toBeNull();
  });

  it("round-trips width + aspect through encode→reconstruct", () => {
    registerMediaUrl(REF, "blob:xyz");
    const fence = encodeImageBlock({ type: "image", props: { url: "blob:xyz", caption: "cap", width: 0.5, aspect: 1.5 } });
    const back = reconstructImageFence(fence)!;
    expect(back.props).toEqual({ url: REF, caption: "cap", width: 0.5, aspect: 1.5, posX: 50, posY: 50 });
  });

  it("SAVE: a repositioned (panned) crop writes posX/posY into the params line", () => {
    registerMediaUrl(REF, "blob:xyz");
    const out = encodeImageBlock({
      type: "image",
      props: { url: "blob:xyz", caption: "", width: DEFAULT_IMAGE_WIDTH, aspect: 1.5, posX: 20, posY: 80 },
    });
    const text = (out.content as Array<{ text: string }>)[0].text;
    expect(text).toBe(`${REF}\nwidth=${DEFAULT_IMAGE_WIDTH} aspect=1.5 posX=20 posY=80`);
  });

  it("round-trips posX/posY through encode→reconstruct; centred (50) stays off the params line", () => {
    registerMediaUrl(REF, "blob:xyz");
    const panned = reconstructImageFence(
      encodeImageBlock({ type: "image", props: { url: "blob:xyz", caption: "c", width: 0.5, aspect: 1.5, posX: 20, posY: 80 } }),
    )!;
    expect(panned.props).toEqual({ url: REF, caption: "c", width: 0.5, aspect: 1.5, posX: 20, posY: 80 });
    // A centred image (default 50/50) omits posX/posY from the fence.
    const centred = encodeImageBlock({ type: "image", props: { url: "blob:xyz", caption: "", width: 0.5, aspect: 1.5, posX: 50, posY: 50 } });
    expect((centred.content as Array<{ text: string }>)[0].text).toBe(`${REF}\nwidth=0.5 aspect=1.5`);
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
