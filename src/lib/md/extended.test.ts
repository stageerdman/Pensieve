import { describe, it, expect } from "vitest";
import { encodeInline, decodeInline, mapBlocks, HIGHLIGHT } from "./extended";

// Pure unit tests for the extended-Markdown bridge — no BlockNote runtime needed.
// (The full editor round-trip is covered by extended.server.test.ts.)

const hl = (text: string) => ({ type: "text" as const, text, styles: { backgroundColor: HIGHLIGHT } });
const plain = (text: string) => ({ type: "text" as const, text, styles: {} });

describe("extended-markdown highlight bridge", () => {
  it("encodes a highlighted run to ==...== and drops the style", () => {
    expect(encodeInline([hl("hi")])).toEqual([{ type: "text", text: "==hi==", styles: {} }]);
  });

  it("leaves non-highlighted text untouched on encode", () => {
    const input = [plain("hello"), { type: "text", text: "x", styles: { bold: true } }];
    expect(encodeInline(input)).toEqual(input);
  });

  it("decodes ==...== back to a highlighted run", () => {
    const [run] = decodeInline([plain("==hi==")]) as any[];
    expect(run.styles.backgroundColor).toBe(HIGHLIGHT);
    expect(run.text).toBe("hi");
  });

  it("splits mixed text, highlighting only the marked segment", () => {
    const out = decodeInline([plain("a ==b== c")]) as any[];
    expect(out.map((r) => r.text)).toEqual(["a ", "b", " c"]);
    expect(out[1].styles.backgroundColor).toBe(HIGHLIGHT);
    expect(out[0].styles.backgroundColor).toBeUndefined();
  });

  it("round-trips: decode(encode(highlight)) preserves text and style", () => {
    const [run] = decodeInline(encodeInline([hl("keep me")])) as any[];
    expect(run.text).toBe("keep me");
    expect(run.styles.backgroundColor).toBe(HIGHLIGHT);
  });

  it("recurses into nested block children", () => {
    const blocks = [
      { type: "bulletListItem", content: [hl("top")], children: [{ type: "bulletListItem", content: [hl("nested")] }] },
    ];
    const out = mapBlocks(blocks as any, encodeInline) as any[];
    expect(out[0].content[0].text).toBe("==top==");
    expect(out[0].children[0].content[0].text).toBe("==nested==");
  });

  it("passes through blocks whose content is not an inline array (e.g. tables)", () => {
    const blocks = [{ type: "table", content: { type: "tableContent", rows: [] } }];
    expect(mapBlocks(blocks as any, encodeInline)).toEqual(blocks);
  });
});
