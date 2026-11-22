import { describe, expect, it } from "vitest";
import { canonicalText } from "./canonical";

describe("canonicalText", () => {
  it("is blind to how an editor re-saves lists", () => {
    const ai = "Dreams\n\n- A red boat\n    - with sails\n-   Prague\n\n3. one\n7. two\n- [X] done";
    const phone = "Dreams\n\n* A red boat\n  * with sails\n* Prague\n\n1. one\n2. two\n* [x] done";
    expect(canonicalText(ai)).toBe(canonicalText(phone));
  });

  it("still sees a real edit", () => {
    expect(canonicalText("- A red boat")).not.toBe(canonicalText("* A blue boat"));
    expect(canonicalText("- [ ] todo")).not.toBe(canonicalText("- [x] todo"));
    expect(canonicalText("- a\n- b")).not.toBe(canonicalText("- a\n  - b"));
  });

  it("ignores trailing spaces and extra blank lines", () => {
    expect(canonicalText("Hi  \n\n\n\nthere\n")).toBe("Hi\n\nthere");
  });
});
