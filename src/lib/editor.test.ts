import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "./editor";

// P1 spike, locked in as a test: the whole local-.md premise depends on TipTap
// round-tripping our Notion-like formatting set to Markdown and back without loss.

function roundTrip(md: string): string {
  const el = document.createElement("div");
  const editor = new Editor({
    element: el,
    extensions: editorExtensions(),
    content: md,
  });
  const out = (editor.storage.markdown.getMarkdown() as string).trim();
  editor.destroy();
  return out;
}

describe("markdown round-trip", () => {
  it("preserves headings, emphasis, and links", () => {
    const md = "# Title\n\nSome **bold** and *italic* and `code` and [link](https://x.com).";
    const out = roundTrip(md);
    expect(out).toContain("# Title");
    expect(out).toContain("**bold**");
    expect(out).toContain("*italic*");
    expect(out).toContain("`code`");
    expect(out).toContain("[link](https://x.com)");
  });

  it("preserves lists, quotes, and code blocks", () => {
    const md = [
      "- one",
      "- two",
      "",
      "> a quote",
      "",
      "```",
      "const x = 1",
      "```",
    ].join("\n");
    const out = roundTrip(md);
    expect(out).toContain("one");
    expect(out).toContain("two");
    expect(out).toContain("> a quote");
    expect(out).toContain("const x = 1");
    expect(out).toContain("```");
  });

  it("preserves to-do items", () => {
    const md = "- [ ] todo undone\n- [x] todo done";
    const out = roundTrip(md);
    expect(out).toMatch(/\[ \]/);
    expect(out).toMatch(/\[x\]/i);
  });

  it("is idempotent (parsing serialized output yields the same markdown)", () => {
    const md = "# H\n\ntext with **bold**\n\n- a\n- b";
    const once = roundTrip(md);
    const twice = roundTrip(once);
    expect(twice).toBe(once);
  });
});
