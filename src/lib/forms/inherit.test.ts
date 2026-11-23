import { describe, expect, it } from "vitest";
import { FORM_DEFAULT_ICON, formLook, inheritLabels } from "./index";

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

describe("formLook", () => {
  it("a form uses its chosen flask, else the form default; other memories are untouched", () => {
    const chosen = { shape: "vial" as const, color: 120 };
    expect(formLook({ extra: { form: "true" }, icon: chosen })).toEqual({ isForm: true, icon: chosen });
    expect(formLook({ extra: { form: "true" } })).toEqual({ isForm: true, icon: FORM_DEFAULT_ICON });
    expect(formLook({ extra: { fromForm: "f" } })).toEqual({ isForm: false, icon: undefined });
  });
});
