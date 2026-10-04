import { describe, it, expect } from "vitest";
import { encodeInline, decodeInline, mapBlocks } from "./extended";

// Pure unit tests for the extended-Markdown colour bridge — no BlockNote runtime
// needed. (The full editor round-trip is covered by extended.server.test.ts.)

const run = (text: string, styles: Record<string, unknown> = {}) => ({ type: "text" as const, text, styles });

describe("extended-markdown colour bridge", () => {
  it("encodes a background colour to {bg:..}..{/} and drops the style", () => {
    expect(encodeInline([run("hi", { backgroundColor: "yellow" })])).toEqual([
      { type: "text", text: "{bg:yellow}hi{/}", styles: {} },
    ]);
  });

  it("encodes a text colour to {fg:..}", () => {
    expect(encodeInline([run("hi", { textColor: "red" })])[0]).toMatchObject({ text: "{fg:red}hi{/}" });
  });

  it("encodes both colours together, keeping other styles", () => {
    const [out] = encodeInline([run("hi", { textColor: "red", backgroundColor: "yellow", bold: true })]) as any[];
    expect(out.text).toBe("{fg:red bg:yellow}hi{/}");
    expect(out.styles).toEqual({ bold: true });
  });

  it("ignores the 'default' colour", () => {
    const input = [run("hi", { textColor: "default", backgroundColor: "default" })];
    expect(encodeInline(input)).toEqual(input);
  });

  it("decodes {bg:..}..{/} back to a styled run", () => {
    const [r] = decodeInline([run("{bg:yellow}hi{/}")]) as any[];
    expect(r.styles.backgroundColor).toBe("yellow");
    expect(r.text).toBe("hi");
  });

  it("splits mixed text, colouring only the marked segment", () => {
    const out = decodeInline([run("a {fg:red}b{/} c")]) as any[];
    expect(out.map((r) => r.text)).toEqual(["a ", "b", " c"]);
    expect(out[1].styles.textColor).toBe("red");
    expect(out[0].styles.textColor).toBeUndefined();
  });

  it("round-trips: decode(encode(colour)) preserves text and colours", () => {
    const [r] = decodeInline(encodeInline([run("keep", { textColor: "blue", backgroundColor: "pink" })])) as any[];
    expect(r.text).toBe("keep");
    expect(r.styles.textColor).toBe("blue");
    expect(r.styles.backgroundColor).toBe("pink");
  });

  it("recurses into nested block children", () => {
    const blocks = [
      { type: "bulletListItem", content: [run("top", { backgroundColor: "green" })], children: [{ type: "bulletListItem", content: [run("nested", { textColor: "blue" })] }] },
    ];
    const out = mapBlocks(blocks as any, encodeInline) as any[];
    expect(out[0].content[0].text).toBe("{bg:green}top{/}");
    expect(out[0].children[0].content[0].text).toBe("{fg:blue}nested{/}");
  });

  it("encodes a note link to {@id|title} and decodes it back", () => {
    const link = { type: "noteLink", props: { noteId: "abc123", title: "My Note" } };
    const [enc] = encodeInline([link as any]) as any[];
    expect(enc).toEqual({ type: "text", text: "{@abc123|My Note}", styles: {} });
    const [dec] = decodeInline([enc]) as any[];
    expect(dec).toEqual({ type: "noteLink", props: { noteId: "abc123", title: "My Note" } });
  });

  it("decodes a note link embedded in surrounding text", () => {
    const out = decodeInline([run("see {@id1|Goals} today")]) as any[];
    expect(out.map((r) => r.type)).toEqual(["text", "noteLink", "text"]);
    expect(out[1].props).toEqual({ noteId: "id1", title: "Goals" });
    expect(out[0].text).toBe("see ");
    expect(out[2].text).toBe(" today");
  });

  it("passes through blocks whose content is not an inline array (e.g. tables)", () => {
    const blocks = [{ type: "table", content: { type: "tableContent", rows: [] } }];
    expect(mapBlocks(blocks as any, encodeInline)).toEqual(blocks);
  });
});
