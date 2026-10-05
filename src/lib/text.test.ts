import { describe, it, expect } from "vitest";
import { titleFromMarkdown, slugify, wordCount, excerptFromMarkdown, contentCharCount } from "./text";

describe("contentCharCount", () => {
  it("is zero for a title-only note (one line)", () => {
    expect(contentCharCount("# Just a title")).toBe(0);
    expect(contentCharCount("Just a title\n")).toBe(0);
    expect(contentCharCount("Just a title\n\n   \n")).toBe(0);
  });
  it("counts non-space characters after the title line", () => {
    // "helloworld" (10) + "world" (5) = 15 non-space chars; title + whitespace excluded.
    expect(contentCharCount("Title\nhello world\nwo rld")).toBe(15);
  });
  it("skips leading blank lines before the title", () => {
    expect(contentCharCount("\n\nTitle\nabc")).toBe(3);
  });
});

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

describe("excerptFromMarkdown", () => {
  it("skips the title line and strips markdown from the preview", () => {
    expect(excerptFromMarkdown("# My note\n\n- A **bold** point here")).toBe(
      "A bold point here",
    );
  });
  it("previews the body below the title line (no heading marks needed)", () => {
    expect(excerptFromMarkdown("A plain title\nThe body continues here")).toBe(
      "The body continues here",
    );
  });
  it("renders link text, not the url", () => {
    expect(excerptFromMarkdown("See [the docs](https://x.com) now")).toBe(
      "See the docs now",
    );
  });
  it("is empty for a title-only or empty note", () => {
    expect(excerptFromMarkdown("# Only a title")).toBe("");
    expect(excerptFromMarkdown("")).toBe("");
  });
  it("truncates with an ellipsis past the cap", () => {
    const out = excerptFromMarkdown("intro\n" + "word ".repeat(80), 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("wordCount", () => {
  it("counts words ignoring markdown punctuation", () => {
    expect(wordCount("# Title\n\n- one two three")).toBe(4);
    expect(wordCount("**bold** and _italic_")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
