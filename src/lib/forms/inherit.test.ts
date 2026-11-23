import { describe, expect, it } from "vitest";
import { FORM_DEFAULT_ICON, drawShape, resolveIcon, inheritLabels } from "./index";
import { DEFAULT_ICON, encodeIcon, parseIcon } from "../flasks/icon";

const note = (categories: string[], tags: string[]) => ({ id: "n", categories, tags });

describe("inheritLabels", () => {
  it("adds the form's categories and tags after the memory's own", () => {
    const out = inheritLabels(note(["Idea"], ["mine"]), { categories: ["Journal"], tags: ["daily", "review"] });
    expect(out).toEqual({ id: "n", categories: ["Idea", "Journal"], tags: ["mine", "daily", "review"] });
  });

  it("de-dupes: categories case-insensitively, tags also ignoring a leading #", () => {
    const out = inheritLabels(note(["journal"], ["Daily"]), { categories: ["Journal"], tags: ["#daily", "daily", " "] });
    expect(out).toEqual({ id: "n", categories: ["journal"], tags: ["Daily"] });
  });

  it("a form with no labels leaves the memory as it was", () => {
    expect(inheritLabels(note(["Idea"], ["x"]), {})).toEqual(note(["Idea"], ["x"]));
  });
});

describe("resolveIcon", () => {
  it("uses the chosen flask, else the form default for a form, else the plain default", () => {
    const chosen = { shape: "vial" as const, color: 120 };
    expect(resolveIcon(chosen, true)).toBe(chosen);
    expect(resolveIcon(undefined, true)).toBe(FORM_DEFAULT_ICON);
    expect(resolveIcon(undefined, false)).toBe(DEFAULT_ICON);
    expect(resolveIcon(undefined)).toBe(DEFAULT_ICON);
  });
});

describe("drawShape", () => {
  it("a form draws its chosen shape, the form flask when none is chosen", () => {
    expect(drawShape({ shape: "round-bottom", color: 310 }, true)).toBe("round-bottom");
    expect(drawShape({ shape: "form", color: 310 }, true)).toBe("form");
    expect(drawShape(undefined, true)).toBe("form");
  });

  it("a memory never draws the form flask", () => {
    expect(drawShape({ shape: "form", color: 310 }, false)).toBe(DEFAULT_ICON.shape);
    expect(drawShape({ shape: "beaker", color: 310 })).toBe("beaker");
  });

  it("the form flask round-trips through frontmatter", () => {
    expect(parseIcon(encodeIcon({ shape: "form", color: 310 }))).toEqual({ shape: "form", color: 310 });
  });
});
