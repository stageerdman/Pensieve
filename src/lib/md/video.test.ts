import { describe, it, expect, beforeEach } from "vitest";
import { VIDEO_FENCE, encodeVideoBlock, isVideoBlock, reconstructVideoFence } from "./video";
import { registerMediaUrl, _resetMediaUrlRegistry } from "../media/url";

// Pure unit tests for the video markdown bridge — mirrors image.test.ts's structure for the
// same reasons; no BlockNote runtime involved.

const REF = "media/note1/clip-1.mov";

beforeEach(() => _resetMediaUrlRegistry());

describe("video markdown bridge", () => {
  it("recognises a video block", () => {
    expect(isVideoBlock({ type: "video" })).toBe(true);
    expect(isVideoBlock({ type: "paragraph" })).toBe(false);
  });

  it("SAVE: rewrites the loadable url back to its vault ref on a pensieve:video fence", () => {
    registerMediaUrl(REF, "asset://localhost/clip-1.mov");
    const out = encodeVideoBlock({ type: "video", props: { url: "asset://localhost/clip-1.mov", caption: "" } });
    expect(out.type).toBe("codeBlock");
    expect((out.props as { language: string }).language).toBe(VIDEO_FENCE);
    expect((out.content as Array<{ text: string }>)[0].text).toBe(REF);
  });

  it("SAVE: keeps a caption on the second line", () => {
    registerMediaUrl(REF, "blob:xyz");
    const out = encodeVideoBlock({ type: "video", props: { url: "blob:xyz", caption: "the quarry" } });
    expect((out.content as Array<{ text: string }>)[0].text).toBe(`${REF}\nthe quarry`);
  });

  it("SAVE: keeps an external (unregistered) url as-is", () => {
    const out = encodeVideoBlock({ type: "video", props: { url: "https://example.com/x.mp4", caption: "" } });
    expect((out.content as Array<{ text: string }>)[0].text).toBe("https://example.com/x.mp4");
  });

  it("LOAD: rebuilds a pensieve:video fence into a video block", () => {
    const fence = { type: "codeBlock", props: { language: VIDEO_FENCE }, content: [{ type: "text", text: `${REF}\nthe quarry`, styles: {} }] };
    const block = reconstructVideoFence(fence);
    expect(block).toEqual({ type: "video", props: { url: REF, caption: "the quarry" } });
  });

  it("LOAD: a non-video fence is left alone", () => {
    const fence = { type: "codeBlock", props: { language: "pensieve:audio" }, content: [{ type: "text", text: REF, styles: {} }] };
    expect(reconstructVideoFence(fence)).toBeNull();
  });

  it("round-trips SAVE → LOAD", () => {
    registerMediaUrl(REF, "asset://localhost/clip-1.mov");
    const saved = encodeVideoBlock({ type: "video", props: { url: "asset://localhost/clip-1.mov", caption: "a caption" } });
    const loaded = reconstructVideoFence(saved);
    expect(loaded).toEqual({ type: "video", props: { url: REF, caption: "a caption" } });
  });
});
