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
  it("is empty (title-less) for content with no prose", () => {
    expect(titleFromMarkdown("")).toBe("");
    expect(titleFromMarkdown("   \n  ")).toBe("");
    expect(titleFromMarkdown("###   ")).toBe("");
  });
  it("is title-less for a note that is only media (no fence marker / file path as title)", () => {
    // a recording-only note: the pensieve:audio fence + ref must NOT become the title
    expect(titleFromMarkdown("```pensieve:audio\nmedia/n1/abc-123.mp3\n```")).toBe("");
    // text above the recording still wins
    expect(titleFromMarkdown("# Discovery call\n\n```pensieve:audio\nmedia/n1/x.mp3\n```")).toBe("Discovery call");
    // a lone image line isn't a title either
    expect(titleFromMarkdown("![a photo](media/n1/pic.png)")).toBe("");
    // prose after a leading fence is still found
    expect(titleFromMarkdown("```pensieve:audio\nmedia/n1/x.mp3\n```\n\nActual note text")).toBe("Actual note text");
  });
  it("strips list marks so a note starting with a list item gets a clean title", () => {
    expect(titleFromMarkdown("* Co tím myslíte?\n* another")).toBe("Co tím myslíte?");
    expect(titleFromMarkdown("- dash bullet\nbody")).toBe("dash bullet");
    expect(titleFromMarkdown("1. first step\nbody")).toBe("first step");
    expect(titleFromMarkdown("* [ ] todo item\nbody")).toBe("todo item");
    expect(titleFromMarkdown("* [x] done item\nbody")).toBe("done item");
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
