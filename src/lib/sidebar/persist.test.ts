import { describe, it, expect, beforeEach } from "vitest";
import { loadView, saveView } from "./persist";
import { DEFAULT_VIEW } from "./view";

describe("sidebar view persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default view when nothing is stored", () => {
    expect(loadView()).toEqual(DEFAULT_VIEW);
  });

  it("round-trips a saved view", () => {
    const v = { ...DEFAULT_VIEW, sortKey: "title" as const, group: "category" as const };
    saveView(v);
    expect(loadView()).toEqual(v);
  });

  it("merges a partial/legacy config over the defaults (forward-compat)", () => {
    // A config saved before `fields.preview` existed, missing newer keys.
    localStorage.setItem(
      "pensieve:sidebar:view",
      JSON.stringify({ sortKey: "createdAt", fields: { relativeTime: false } }),
    );
    const v = loadView();
    expect(v.sortKey).toBe("createdAt");
    expect(v.fields.relativeTime).toBe(false);
    expect(v.fields.preview).toBe(DEFAULT_VIEW.fields.preview); // filled from default
    expect(v.group).toBe(DEFAULT_VIEW.group);
  });

  it("falls back to the default on corrupt JSON", () => {
    localStorage.setItem("pensieve:sidebar:view", "{not json");
    expect(loadView()).toEqual(DEFAULT_VIEW);
  });
});
