import { describe, it, expect } from "vitest";
import { buildSuggestions, canonicalTag, cleanTag, sanitizeVocab, tagKey, whisper } from "./vocab";

describe("tag vocabulary", () => {
  it("compares tags case/space/#-insensitively and cleans typed input", () => {
    expect(tagKey("  #@Sales   Mindset ")).toBe("@sales mindset");
    expect(cleanTag("#Frame,")).toBe("Frame");
    expect(canonicalTag("@sales mindset", ["@Sales Mindset", "Frame"])).toBe("@Sales Mindset");
    expect(canonicalTag("new", ["Frame"])).toBeNull();
  });

  it("sanitizes tags.json: drops blanks, commas and case-duplicates, keeps definitions", () => {
    expect(
      sanitizeVocab({ tags: [{ name: "@CANI", definition: " daily actions " }, { name: "@cani" }, { name: "" }, { name: "a,b" }] }),
    ).toEqual([{ name: "@CANI", definition: "daily actions" }]);
    expect(sanitizeVocab("junk")).toEqual([]);
  });

  it("merges vocabulary with tags in use, vocabulary spelling wins, ranked by uses", () => {
    const s = buildSuggestions(
      [{ name: "@CANI", definition: "the CANI project" }, { name: "@Unused" }],
      [["@cani"], ["@CANI", "Frame"], ["Frame"], ["Frame"]],
    );
    expect(s.map((x) => [x.name, x.uses])).toEqual([["Frame", 3], ["@CANI", 2], ["@Unused", 0]]);
  });

  it("whispers top threads on an empty draft and matches definitions too", () => {
    const s = buildSuggestions([{ name: "@CANI", definition: "weekly review and daily actions" }, { name: "@Success Bag" }], []);
    expect(whisper(s, "", []).map((x) => x.name)).toEqual(["@CANI", "@Success Bag"]);
    expect(whisper(s, "weekly", []).map((x) => x.name)).toEqual(["@CANI"]);
    expect(whisper(s, "", ["@cani"]).map((x) => x.name)).toEqual(["@Success Bag"]);
  });
});
