import { describe, it, expect } from "vitest";
import { findWordBounds } from "./wordSelection";

describe("findWordBounds", () => {
  it("selects a middle word from a node-independent flat string", () => {
    const text = "the ultimate tool for thinkers";
    //            0123456789...
    // "ultimate" spans [4, 12)
    const bounds = findWordBounds(text, 8); // tap inside "ultimate"
    expect(bounds).toEqual({ start: 4, end: 12 });
    expect(text.slice(bounds!.start, bounds!.end)).toBe("ultimate");
  });

  it("stops at a non-breaking space — does not bleed across it like WebKit does", () => {
    // WebKit inserts U+00A0 between words and (per the bug this fixes) treats it as
    // part of the word, selecting across it. Our word boundary must stop there.
    const text = "Hello world here";
    const bounds = findWordBounds(text, 7); // tap inside "world"
    expect(bounds).toEqual({ start: 6, end: 11 });
    expect(text.slice(bounds!.start, bounds!.end)).toBe("world");
  });

  it("a tap on a leading/trailing boundary still selects the adjacent word", () => {
    const text = "alpha beta";
    expect(findWordBounds(text, 0)).toEqual({ start: 0, end: 5 }); // "alpha"
    expect(findWordBounds(text, 10)).toEqual({ start: 6, end: 10 }); // end of string, "beta"
  });

  it("returns null when the tap lands inside whitespace (leave to native)", () => {
    const text = "a  b"; // double space
    expect(findWordBounds(text, 2)).toBeNull();
  });

  it("returns null for an empty/degenerate string", () => {
    expect(findWordBounds("", 0)).toBeNull();
    expect(findWordBounds("   ", 1)).toBeNull();
  });

  it("stops at punctuation", () => {
    const text = "wait, really?";
    const bounds = findWordBounds(text, 7); // inside "really"
    expect(text.slice(bounds!.start, bounds!.end)).toBe("really");
  });
});
