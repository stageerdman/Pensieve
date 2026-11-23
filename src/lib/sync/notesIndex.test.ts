import { describe, expect, it } from "vitest";
import { indexEntryFromMeta } from "./notesIndex";

describe("indexEntryFromMeta", () => {
  it("flags a form template so the phone always keeps it", () => {
    const form = indexEntryFromMeta("f", { title: "Weekly", createdAt: 1, updatedAt: 2, extra: { form: "true" } });
    expect(form).toEqual({ id: "f", t: "Weekly", c: 1, u: 2, f: 1 });
  });

  it("leaves the flag off ordinary memories and memories made from a form", () => {
    expect(indexEntryFromMeta("a", { title: "A", extra: { fromForm: "f" } }).f).toBeUndefined();
    expect(indexEntryFromMeta("b", null)).toEqual({ id: "b", t: "", c: 0, u: 0 });
  });
});
