import { describe, it, expect } from "vitest";
import {
  GENERAL_SPELLS,
  conditionalSpells,
  hasConditional,
  spellById,
} from "./registry";
import { isScroll } from "./ringLayout";

describe("registry — the General roster", () => {
  it("is just the three real daily spells, most-used-first", () => {
    expect(GENERAL_SPELLS.map((s) => s.id)).toEqual(["write", "accio", "sync"]);
  });

  it("is small enough to render as a static ring, not a scroll ring", () => {
    expect(isScroll(GENERAL_SPELLS.length)).toBe(false);
  });

  it("gives hue-owning and window spells the right flags", () => {
    expect(spellById("accio")!.hue).toBe("violet");
    expect(spellById("sync")!.hue).toBe("gold-state");
    expect(spellById("sync")!.opensWindow).toBe(true);
    expect(spellById("write")!.longPress).toBe("speak");
  });

  it("an unknown id resolves to undefined", () => {
    expect(spellById("nope")).toBeUndefined();
  });
});

describe("registry — conditional (page-recommended) rosters", () => {
  it("home has no local suggestions — the main screen shows only General", () => {
    expect(conditionalSpells("home")).toEqual([]);
    expect(hasConditional("home")).toBe(false);
  });

  it("a note offers Photo + Gallery (add a photo, or start a fresh gallery)", () => {
    const note = conditionalSpells("note");
    expect(note.map((s) => s.id)).toEqual(["image", "gallery"]);
    expect(note.map((s) => s.name)).toEqual(["Photo", "Gallery"]);
    expect(isScroll(note.length)).toBe(false); // a clean static ring
    expect(hasConditional("note")).toBe(true);
  });

  it("an open collection offers Edit + Photo (no nesting a gallery in a gallery)", () => {
    const coll = conditionalSpells("collection");
    expect(coll.map((s) => s.id)).toEqual(["edit", "image"]);
    expect(coll.map((s) => s.name)).toEqual(["Edit", "Photo"]);
    expect(hasConditional("collection")).toBe(true);
  });
});
