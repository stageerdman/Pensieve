import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SpellMenuButton } from "./SpellMenuButton";

// Owner design rule: the spell menu button carries NOTHING extra — no status dot,
// badge, or sync rune. This locks it so it can't creep back in.
describe("SpellMenuButton", () => {
  it("renders only the menu glyph — no badge, dot, or rune", () => {
    const { getByRole } = render(<SpellMenuButton onOpen={() => {}} />);
    const btn = getByRole("button", { name: "Open spell menu" });
    expect(btn.children).toHaveLength(1);
    expect(btn.hasAttribute("data-alert")).toBe(false);
    expect(btn.querySelector(".spell-fab-sync")).toBeNull();
  });
});
