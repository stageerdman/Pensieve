import { describe, it, expect } from "vitest";
import { mediaAlt } from "./alt";

// The accessible fallback label: a caption doubles as alt text; an absent/blank caption
// falls back to a plain "Image" (never an empty, decorative alt="" or an opaque blob URL).

describe("mediaAlt", () => {
  it("returns the caption when present", () => {
    expect(mediaAlt("a quiet morning")).toBe("a quiet morning");
  });
  it("falls back to 'Image' for an absent or blank caption", () => {
    expect(mediaAlt(undefined)).toBe("Image");
    expect(mediaAlt(null)).toBe("Image");
    expect(mediaAlt("")).toBe("Image");
    expect(mediaAlt("   ")).toBe("Image");
  });
});
