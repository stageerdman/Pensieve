import { describe, it, expect } from "vitest";
import {
  GENERAL_SPELLS,
  conditionalSpells,
  hasConditional,
  spellById,
} from "./registry";
import { isScroll } from "./ringLayout";

describe("registry — the General roster", () => {
  it("is the seven real daily spells, most-used-first", () => {
    expect(GENERAL_SPELLS.map((s) => s.id)).toEqual(["write", "accio", "sync", "snap", "voice", "film", "journal"]);
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

  it("a note offers Photo + Gallery + Voice + Video + Delete (the last rides the danger hue)", () => {
    const note = conditionalSpells("note");
    expect(note.map((s) => s.id)).toEqual(["image", "gallery", "record", "clip", "delete"]);
    expect(note.map((s) => s.name)).toEqual(["Photo", "Gallery", "Voice", "Video", "Delete"]);
    expect(note.find((s) => s.id === "delete")!.hue).toBe("danger");
    expect(isScroll(note.length)).toBe(false); // a clean static ring
    expect(hasConditional("note")).toBe(true);
  });

  it("Voice is a detailed spell offering Record (new take) + Upload (existing file)", () => {
    const voice = conditionalSpells("note").find((s) => s.id === "record")!;
    expect(voice.children!.map((s) => s.id)).toEqual(["record-new", "record-upload"]);
    expect(voice.children!.map((s) => s.name)).toEqual(["Record", "Upload"]);
  });

  it("Video is a detailed spell offering Film (new clip) + Upload (existing file)", () => {
    const clip = conditionalSpells("note").find((s) => s.id === "clip")!;
    expect(clip.children!.map((s) => s.id)).toEqual(["clip-film", "clip-upload"]);
    expect(clip.children!.map((s) => s.name)).toEqual(["Film", "Upload"]);
  });

  it("an open collection offers Edit + Photo (no nesting a gallery in a gallery)", () => {
    const coll = conditionalSpells("collection");
    expect(coll.map((s) => s.id)).toEqual(["edit", "image"]);
    expect(coll.map((s) => s.name)).toEqual(["Edit", "Photo"]);
    expect(hasConditional("collection")).toBe(true);
  });
});
