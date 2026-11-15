import { describe, it, expect } from "vitest";
import { encodeCalloutText, parseCalloutText } from "./callout";
import { joinColumns, reconstructColumnsFence, encodeColumnsBlock, splitColumns } from "./columns";

describe("callout fence text", () => {
  it("reads an optional icon line", () => {
    expect(parseCalloutText("icon=💡\nA thought.")).toEqual({ icon: "💡", body: "A thought." });
    expect(parseCalloutText("A thought.")).toEqual({ icon: "", body: "A thought." });
    expect(parseCalloutText("icon=🚨")).toEqual({ icon: "🚨", body: "" });
  });

  it("only the FIRST line can be an icon", () => {
    expect(parseCalloutText("Hello\nicon=💡")).toEqual({ icon: "", body: "Hello\nicon=💡" });
  });

  it("round-trips byte-for-byte", () => {
    for (const t of ["icon=🚨\nWatch out.\n\n​\n\n* a\n* b", "Plain body", "icon=🚨", "​\n\n**To:** someone"]) {
      expect(encodeCalloutText(parseCalloutText(t))).toBe(t);
    }
  });
});

describe("columns fence text", () => {
  it("splits and joins on the column marker", () => {
    const text = "Left side\n\n* a\n:::column:::\n![](media/n/x.png)\n:::column:::\n​";
    expect(splitColumns(text)).toEqual(["Left side\n\n* a", "![](media/n/x.png)", "​"]);
    expect(joinColumns(splitColumns(text))).toBe(text);
  });

  it("columns block ⇄ fence keeps the text verbatim", () => {
    const text = "A\n:::column:::\nB";
    const fence = { type: "codeBlock", props: { language: "pensieve:columns" }, content: [{ type: "text", text, styles: {} }] };
    const block = reconstructColumnsFence(fence)!;
    expect(block).toEqual({ type: "columns", props: { md: text } });
    expect(encodeColumnsBlock(block)).toEqual(fence);
    expect(reconstructColumnsFence({ type: "codeBlock", props: { language: "ts" }, content: [] })).toBeNull();
  });
});
