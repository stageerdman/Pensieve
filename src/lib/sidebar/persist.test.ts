import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState } from "./persist";
import { DEFAULT_STATE, DEFAULT_VIEW, activeView } from "./view";

describe("sidebar state persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default state when nothing is stored", () => {
    expect(loadState()).toEqual(DEFAULT_STATE);
  });

  it("round-trips saved views + active id", () => {
    const state = {
      views: [DEFAULT_VIEW, { ...DEFAULT_VIEW, id: "v-2", name: "Reading", sortKey: "title" as const }],
      activeId: "v-2",
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded.views).toHaveLength(2);
    expect(activeView(loaded).name).toBe("Reading");
  });

  it("merges a view saved before newer fields existed", () => {
    saveState({
      views: [{ ...DEFAULT_VIEW, fields: { ...DEFAULT_VIEW.fields } }],
      activeId: "default",
    } as never);
    // simulate a view missing previewLines + a field
    localStorage.setItem(
      "pensieve:sidebar:state",
      JSON.stringify({ views: [{ id: "default", name: "Notes", sortKey: "updatedAt" }], activeId: "default" }),
    );
    const v = activeView(loadState());
    expect(v.previewLines).toBe(DEFAULT_VIEW.previewLines);
    expect(v.fields.category).toBe(DEFAULT_VIEW.fields.category);
  });

  it("migrates the legacy single-view config, renaming relativeTime→relativeUpdated", () => {
    localStorage.setItem(
      "pensieve:sidebar:view",
      JSON.stringify({ sortKey: "createdAt", group: "category", fields: { relativeTime: false, preview: true } }),
    );
    const v = activeView(loadState());
    expect(v.sortKey).toBe("createdAt");
    expect(v.group).toBe("category");
    expect(v.fields.relativeUpdated).toBe(false); // migrated from relativeTime
    expect(v.fields.preview).toBe(true);
  });

  it("falls back to default on corrupt JSON", () => {
    localStorage.setItem("pensieve:sidebar:state", "{nope");
    expect(loadState()).toEqual(DEFAULT_STATE);
  });

  it("drops an activeId that no longer matches any view", () => {
    saveState({ views: [DEFAULT_VIEW], activeId: "ghost" } as never);
    expect(loadState().activeId).toBe("default");
  });
});
