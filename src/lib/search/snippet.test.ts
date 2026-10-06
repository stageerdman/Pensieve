import { describe, it, expect } from "vitest";
import { makeSnippet } from "./snippet";

const body =
  "The pensieve metaphor is the whole product: pour it out so your head is clear, " +
  "then revisit the memory when you are wiser and calmer.";

describe("makeSnippet", () => {
  it("returns a window around the first match with highlight ranges", () => {
    const s = makeSnippet(body, "revisit", 20)!;
    expect(s.text).toContain("revisit");
    expect(s.marks.length).toBeGreaterThanOrEqual(1);
    const [start, end] = s.marks[0];
    expect(s.text.slice(start, end).toLowerCase()).toBe("revisit");
  });

  it("adds ellipses when text is cut on a side", () => {
    const s = makeSnippet(body, "revisit", 20)!;
    expect(s.text.startsWith("…")).toBe(true);
    expect(s.text.endsWith("…")).toBe(true);
  });

  it("no ellipsis at the true start", () => {
    const s = makeSnippet(body, "pensieve", 100)!;
    expect(s.text.startsWith("…")).toBe(false);
  });

  it("is case-insensitive and marks every occurrence in-window", () => {
    const s = makeSnippet("Walk, then walk again after the walk.", "walk", 100)!;
    expect(s.marks.length).toBe(3);
    for (const [a, b] of s.marks) expect(s.text.slice(a, b).toLowerCase()).toBe("walk");
  });

  it("returns null when no term occurs or query is empty", () => {
    expect(makeSnippet(body, "nonexistent")).toBeNull();
    expect(makeSnippet(body, "")).toBeNull();
    expect(makeSnippet("", "x")).toBeNull();
  });

  it("collapses newlines into a one-line snippet", () => {
    const s = makeSnippet("line one\n\n   line two with target here", "target", 30)!;
    expect(s.text).not.toContain("\n");
    expect(s.text).toContain("target");
  });
});
