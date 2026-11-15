import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoteCategoryControl } from "./NoteCategoryControl";
import type { CategoryApi } from "../hooks/useCategoryDefs";
import type { Note } from "../lib/types";

const categories = {
  defs: [
    { name: "Journal", color: "blue" },
    { name: "Idea", color: "yellow" },
  ],
  addCategory: vi.fn(),
  setColor: vi.fn(),
  removeCategory: vi.fn(),
} as unknown as CategoryApi;

describe("NoteCategoryControl (inline, beside the flask)", () => {
  it("shows the note's categories as the trigger and toggles one on via a functional update", () => {
    const updateMeta = vi.fn();
    render(
      <NoteCategoryControl value={["Journal"]} categories={categories} updateMeta={updateMeta} variant="inline" />,
    );
    const trigger = screen.getByRole("button", { name: /Category: Journal/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Journal/, pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Idea/, pressed: false }));
    const fn = updateMeta.mock.calls[0][0] as (n: Note) => { categories: string[] };
    expect(fn({ categories: ["Journal"] } as Note)).toEqual({ categories: ["Journal", "Idea"] });
    expect(fn({ categories: ["Journal", "Idea"] } as Note)).toEqual({ categories: ["Journal"] });
  });

  it("offers 'Add category' when the note has none, and Esc closes back to the trigger", () => {
    render(<NoteCategoryControl value={[]} categories={categories} updateMeta={() => {}} variant="inline" />);
    const trigger = screen.getByRole("button", { name: "Add category" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
