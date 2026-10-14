import { describe, it, expect } from "vitest";
import { slashNav, isSlashNavKey } from "./slashNav";

describe("slashNav", () => {
  it("ArrowDown / Tab move to the next item and wrap", () => {
    expect(slashNav(0, "ArrowDown", false, 3)).toEqual({ type: "move", index: 1 });
    expect(slashNav(0, "Tab", false, 3)).toEqual({ type: "move", index: 1 });
    expect(slashNav(2, "ArrowDown", false, 3)).toEqual({ type: "move", index: 0 }); // wraps
    expect(slashNav(2, "Tab", false, 3)).toEqual({ type: "move", index: 0 });
  });

  it("ArrowUp / Shift+Tab move to the previous item and wrap", () => {
    expect(slashNav(1, "ArrowUp", false, 3)).toEqual({ type: "move", index: 0 });
    expect(slashNav(0, "ArrowUp", false, 3)).toEqual({ type: "move", index: 2 }); // wraps
    expect(slashNav(0, "Tab", true, 3)).toEqual({ type: "move", index: 2 });
    expect(slashNav(1, "Tab", true, 3)).toEqual({ type: "move", index: 0 });
  });

  it("Home / End jump to the ends", () => {
    expect(slashNav(2, "Home", false, 4)).toEqual({ type: "move", index: 0 });
    expect(slashNav(0, "End", false, 4)).toEqual({ type: "move", index: 3 });
  });

  it("Enter activates the highlighted index", () => {
    expect(slashNav(2, "Enter", false, 4)).toEqual({ type: "activate", index: 2 });
  });

  it("Escape closes regardless of count", () => {
    expect(slashNav(0, "Escape", false, 3)).toEqual({ type: "close" });
    expect(slashNav(0, "Escape", false, 0)).toEqual({ type: "close" });
  });

  it("clamps a stale index before moving/activating", () => {
    expect(slashNav(99, "ArrowDown", false, 3)).toEqual({ type: "move", index: 0 }); // clamp 99→2, +1 wrap→0
    expect(slashNav(-5, "Enter", false, 3)).toEqual({ type: "activate", index: 0 });
  });

  it("other keys are a no-op (typing flows to the editor)", () => {
    expect(slashNav(0, "a", false, 3)).toEqual({ type: "none" });
    expect(slashNav(0, "ArrowDown", false, 0)).toEqual({ type: "none" }); // nothing to move to
  });

  it("isSlashNavKey covers exactly the handled keys", () => {
    ["ArrowDown", "ArrowUp", "Tab", "Home", "End", "Enter", "Escape"].forEach((k) =>
      expect(isSlashNavKey(k)).toBe(true),
    );
    ["a", "/", " ", "Backspace", "x"].forEach((k) => expect(isSlashNavKey(k)).toBe(false));
  });
});
