import { describe, expect, it } from "vitest";
import { parseColorAttrs, plainColorRuns, stripForeignColorRuns } from "./colorRuns";
import { decodeInline, encodeInline } from "./extended";
import { parseForm } from "../forms";
import { excerptFromMarkdown, titleFromMarkdown } from "../text";
import { splitTitleAndBody } from "../../../phone/src/lib/sync/noteFormat";

// Real strings from the owner's vault (pasted from a dark-themed page), 2026-11-13.
const PASTED = "so When I uploaded 2 knowledge files it dropped this error {fg:rgb(37, 99, 235) bg:rgb(10, 10, 10)}Internal error{/} indexing";
const QUESTION = "**{fg:rgb(26, 26, 26) bg:transparent}Was I a king?{/}**";

describe("colour runs: pasted CSS colours never surface as code", () => {
  it("keeps only palette names", () => {
    expect(parseColorAttrs("fg:rgb(37, 99, 235) bg:rgb(10, 10, 10)")).toEqual({});
    expect(parseColorAttrs("fg:red bg:transparent")).toEqual({ fg: "red" });
  });
  it("strips a foreign run to its text; keeps a real one", () => {
    expect(stripForeignColorRuns(PASTED)).toBe("so When I uploaded 2 knowledge files it dropped this error Internal error indexing");
    expect(stripForeignColorRuns("{fg:red bg:rgb(1, 2, 3)}hi{/} {fg:blue}x{/}")).toBe("{fg:red}hi{/} {fg:blue}x{/}");
    expect(plainColorRuns("{fg:red}hi{/}")).toBe("hi");
  });
  it("desktop: never writes a pasted colour, and drops one already on disk", () => {
    const run = { type: "text", text: "hi", styles: { textColor: "rgb(26, 26, 26)", backgroundColor: "transparent" } };
    expect(encodeInline([run])[0]).toMatchObject({ text: "hi" });
    const out = decodeInline([{ type: "text", text: PASTED, styles: {} }]) as { text: string; styles: object }[];
    expect(out.map((i) => i.text).join("")).toBe(stripForeignColorRuns(PASTED));
    expect(out.every((i) => !("textColor" in i.styles))).toBe(true);
  });
  it("forms, titles, previews and the phone all read clean text", () => {
    expect(parseForm(`Daily\n\n${QUESTION}\n\nyes`).fields[0].question).toBe("Was I a king?");
    expect(titleFromMarkdown(QUESTION)).not.toContain("{fg:");
    expect(excerptFromMarkdown(`T\n\n${PASTED}`)).not.toContain("{fg:");
    const phone = splitTitleAndBody(`Title\n\n${QUESTION}\n${PASTED}`);
    expect(phone.body).not.toContain("{fg:");
    expect(phone.body).toContain("**Was I a king?**");
  });
});
