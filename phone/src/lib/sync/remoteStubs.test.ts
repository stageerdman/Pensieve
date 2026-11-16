import { describe, expect, it } from "vitest";
import { stubsFrom } from "./remoteStubs";

describe("remoteStubs", () => {
  it("stubs only indexed memories not on the phone, titled, newest first, flagged remote", () => {
    const entries = [
      { id: "a", t: "Alpha", c: 1, u: 1 },
      { id: "b", t: "Beta", c: 3, u: 3 },
      { id: "here", t: "Local", c: 2, u: 2 },
      { id: "untitled", t: "", c: 4, u: 4 },
    ];
    const s = stubsFrom(entries, [{ id: "here" }]);
    expect(s.map((n) => n.id)).toEqual(["b", "a"]);
    expect(s.every((n) => n.remote && n.c === "")).toBe(true);
  });
});
