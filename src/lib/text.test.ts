import { describe, it, expect } from "vitest";
import { titleFromMarkdown, slugify, wordCount } from "./text";

describe("titleFromMarkdown", () => {
  it("uses the first non-empty line, stripping heading marks", () => {
    expect(titleFromMarkdown("# Morning pages\n\nbody")).toBe("Morning pages");
    expect(titleFromMarkdown("\n\n  plain first line\nmore")).toBe(
      "plain first line",
    );
  });
  it("falls back to Untitled for empty content", () => {
    expect(titleFromMarkdown("")).toBe("Untitled");
    expect(titleFromMarkdown("   \n  ")).toBe("Untitled");
    expect(titleFromMarkdown("###   ")).toBe("Untitled");
  });
});

describe("slugify", () => {
  it("produces filesystem-safe slugs", () => {
    expect(slugify("Morning Pages!")).toBe("morning-pages");
    expect(slugify("  spaced  out  ")).toBe("spaced-out");
    expect(slugify("")).toBe("untitled");
  });
});

describe("wordCount", () => {
  it("counts words ignoring markdown punctuation", () => {
    expect(wordCount("# Title\n\n- one two three")).toBe(4);
    expect(wordCount("**bold** and _italic_")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
