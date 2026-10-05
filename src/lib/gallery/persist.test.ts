import { describe, it, expect, beforeEach } from "vitest";
import {
  loadGalleryState,
  saveGalleryState,
  saveWorkingSet,
} from "./persist";
import { DEFAULT_GALLERY_STATE, type GalleryState } from "./view";

beforeEach(() => localStorage.clear());

const state = (p: Partial<GalleryState> = {}): GalleryState => ({
  ...DEFAULT_GALLERY_STATE,
  ...p,
});

describe("gallery persist — state", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(loadGalleryState()).toEqual(DEFAULT_GALLERY_STATE);
  });

  it("round-trips fields, snippet lines and settings", () => {
    saveGalleryState(
      state({
        fields: { ...DEFAULT_GALLERY_STATE.fields, tags: true, snippet: false },
        snippetLines: 3,
        settings: { workingSetPersist: false },
      }),
    );
    const loaded = loadGalleryState();
    expect(loaded.fields.tags).toBe(true);
    expect(loaded.fields.snippet).toBe(false);
    expect(loaded.snippetLines).toBe(3);
    expect(loaded.settings.workingSetPersist).toBe(false);
  });

  it("merges partial stored fields over the defaults (forward-compatible)", () => {
    localStorage.setItem(
      "pensieve:gallery:state",
      JSON.stringify({ fields: { tags: true } }),
    );
    const loaded = loadGalleryState();
    expect(loaded.fields.tags).toBe(true);
    expect(loaded.fields.snippet).toBe(DEFAULT_GALLERY_STATE.fields.snippet);
    expect(loaded.snippetLines).toBe(DEFAULT_GALLERY_STATE.snippetLines);
  });

  it("falls back to the default snippet lines for an out-of-range value", () => {
    localStorage.setItem("pensieve:gallery:state", JSON.stringify({ snippetLines: 9 }));
    expect(loadGalleryState().snippetLines).toBe(DEFAULT_GALLERY_STATE.snippetLines);
  });
});

describe("gallery persist — working set", () => {
  it("persists and reloads the working set when persistence is on", () => {
    saveGalleryState(state({ settings: { workingSetPersist: true } }));
    saveWorkingSet(["a", "b", "c"], true);
    expect(loadGalleryState().workingSet).toEqual(["a", "b", "c"]);
  });

  it("does not store the working set when persistence is off", () => {
    saveGalleryState(state({ settings: { workingSetPersist: false } }));
    saveWorkingSet(["a", "b"], false);
    expect(localStorage.getItem("pensieve:gallery:workingset")).toBeNull();
    expect(loadGalleryState().workingSet).toEqual([]);
  });

  it("ignores a stored working set when persistence is off", () => {
    localStorage.setItem("pensieve:gallery:workingset", JSON.stringify(["a"]));
    saveGalleryState(state({ settings: { workingSetPersist: false } }));
    expect(loadGalleryState().workingSet).toEqual([]);
  });

  it("clears the stored working set when persistence is turned off", () => {
    saveWorkingSet(["a", "b"], true);
    expect(localStorage.getItem("pensieve:gallery:workingset")).not.toBeNull();
    saveWorkingSet(["a", "b"], false);
    expect(localStorage.getItem("pensieve:gallery:workingset")).toBeNull();
  });

  it("drops non-string entries defensively", () => {
    localStorage.setItem(
      "pensieve:gallery:workingset",
      JSON.stringify(["a", 2, null, "b"]),
    );
    expect(loadGalleryState().workingSet).toEqual(["a", "b"]);
  });
});
