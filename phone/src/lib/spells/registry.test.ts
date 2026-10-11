import { describe, it, expect } from "vitest";
import {
  GENERAL_SPELLS,
  conditionalSpells,
  hasConditional,
  spellById,
} from "./registry";
import { isScroll } from "./ringLayout";

describe("registry — the General roster", () => {
  it("has a stable most-used-first order starting with Write and Accio", () => {
    expect(GENERAL_SPELLS[0].id).toBe("write");
    expect(GENERAL_SPELLS[1].id).toBe("accio");
  });

  it("is large enough to exercise the scroll ring", () => {
    expect(isScroll(GENERAL_SPELLS.length)).toBe(true);
  });

  it("gives hue-owning and window/detailed spells the right flags", () => {
    expect(spellById("accio")!.hue).toBe("violet");
    expect(spellById("sync")!.hue).toBe("gold-state");
    expect(spellById("sync")!.opensWindow).toBe(true);
    expect(spellById("write")!.longPress).toBe("speak");
    expect(spellById("label")!.children!.length).toBeGreaterThan(0);
  });

  it("indexes detailed children so they resolve by id", () => {
    expect(spellById("label.blue")).toBeDefined();
    expect(spellById("export.pdf")!.name).toBe("PDF");
    expect(spellById("nope")).toBeUndefined();
  });
});

describe("registry — conditional (page-recommended) rosters", () => {
  it("home suggests a small static-ring browsing set", () => {
    const home = conditionalSpells("home");
    expect(home.length).toBe(4);
    expect(isScroll(home.length)).toBe(false);
    expect(hasConditional("home")).toBe(true);
  });

  it("a note suggests spells that act on the open memory", () => {
    const note = conditionalSpells("note").map((s) => s.id);
    expect(note).toContain("label");
    expect(note).toContain("highlight");
    expect(hasConditional("note")).toBe(true);
  });
});
