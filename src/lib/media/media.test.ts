import { describe, it, expect, beforeEach } from "vitest";
import {
  newMediaId,
  mediaRef,
  parseMediaPath,
  isMediaPath,
  extractMediaRefs,
  MEDIA_DIR,
  bytesToBase64,
  base64ToBytes,
  registerMediaUrl,
  refForUrl,
  urlForRef,
  _resetMediaUrlRegistry,
} from "./index";

describe("extractMediaRefs", () => {
  it("finds refs in a plain image, a gallery fence, and dedupes", () => {
    const md = [
      "# Trip",
      "![a cliff](media/note1/aaa.png)",
      "```pensieve:gallery",
      "media/note1/bbb.jpg | sunset",
      "media/note1/aaa.png | repeat (same file)",
      "```",
      "and inline media/note2/ccc.webp somewhere",
    ].join("\n");
    expect(extractMediaRefs(md).sort()).toEqual([
      "media/note1/aaa.png",
      "media/note1/bbb.jpg",
      "media/note2/ccc.webp",
    ]);
  });

  it("ignores external urls and malformed refs", () => {
    expect(extractMediaRefs("![x](https://example.com/a.png)")).toEqual([]);
    expect(extractMediaRefs("media/only-two-parts.png")).toEqual([]);
  });
});

describe("newMediaId", () => {
  it("produces unique ids across many mints", () => {
    const n = 5000;
    const ids = new Set(Array.from({ length: n }, () => newMediaId()));
    expect(ids.size).toBe(n);
  });

  it("has the expected opaque shape (timePrefix-random, url/path safe)", () => {
    const id = newMediaId();
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
    // no characters that would need escaping in a path segment
    expect(id).not.toMatch(/[./\\%]/);
  });

  it("is sortable-ish: later mints sort lexically >= earlier ones", () => {
    const a = newMediaId();
    const b = newMediaId();
    // Same-ms mints can tie on the prefix; the invariant is never-decreasing prefixes.
    expect(a.split("-")[0] <= b.split("-")[0]).toBe(true);
  });
});

describe("mediaRef / parseMediaPath", () => {
  it("builds media/<noteId>/<mediaId>.<ext>", () => {
    expect(mediaRef("note1", "abc", "png")).toBe(`${MEDIA_DIR}/note1/abc.png`);
  });

  it("tolerates and strips a leading dot on ext, and lowercases it", () => {
    expect(mediaRef("n", "m", ".JPG")).toBe("media/n/m.jpg");
  });

  it("round-trips losslessly through parseMediaPath", () => {
    const ref = mediaRef("note-xyz", "k9z-11aa", "webp");
    const parsed = parseMediaPath(ref);
    expect(parsed).toEqual({ noteId: "note-xyz", mediaId: "k9z-11aa", ext: "webp" });
    expect(mediaRef(parsed!.noteId, parsed!.mediaId, parsed!.ext)).toBe(ref);
  });

  it("isMediaPath only matches vault media paths", () => {
    expect(isMediaPath("media/n/m.png")).toBe(true);
    expect(isMediaPath("notes/abc.md")).toBe(false);
  });

  it("parseMediaPath rejects malformed paths", () => {
    expect(parseMediaPath("notes/abc.md")).toBeNull();
    expect(parseMediaPath("media/n")).toBeNull(); // no file
    expect(parseMediaPath("media/n/m")).toBeNull(); // no ext
    expect(parseMediaPath("media/n/m/deep.png")).toBeNull(); // too deep
    expect(parseMediaPath("media//.png")).toBeNull(); // empty parts
  });
});

describe("base64 <-> bytes", () => {
  it("round-trips arbitrary binary bytes losslessly", () => {
    const bytes = new Uint8Array([0, 1, 2, 137, 80, 78, 71, 255, 128, 64, 13, 10]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("accepts an ArrayBuffer", () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    expect(base64ToBytes(bytesToBase64(bytes.buffer))).toEqual(bytes);
  });

  it("handles a payload larger than the chunk size", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 123);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("ref <-> URL registry (rewrite is lossless)", () => {
  beforeEach(() => _resetMediaUrlRegistry());

  it("maps a ref to a URL and back exactly", () => {
    const ref = mediaRef("note1", "mid1", "png");
    const url = "asset://localhost/Users/x/vault/media/note1/mid1.png";
    registerMediaUrl(ref, url);
    expect(urlForRef(ref)).toBe(url);
    expect(refForUrl(url)).toBe(ref);
  });

  it("returns null for unknown refs/urls", () => {
    expect(refForUrl("blob:whatever")).toBeNull();
    expect(urlForRef("media/none/none.png")).toBeNull();
  });
});
