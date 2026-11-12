import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormStrip } from "./FormStrip";
import type { Note, NoteMeta } from "../../lib/types";

const note = (over: Partial<Note> = {}): Note => ({
  id: "n1", title: "Untitled", markdown: "", createdAt: 0, addedAt: 0, updatedAt: 0,
  categories: [], tags: [], links: [], pinned: false, starred: false, ...over,
});
const forms: NoteMeta[] = [
  { id: "w", title: "Weekly Summary", createdAt: 0, updatedAt: 0, extra: { form: "true" } },
  { id: "d", title: "Daily Review", createdAt: 0, updatedAt: 0, extra: { form: "true" } },
  { id: "x", title: "Just a note", createdAt: 0, updatedAt: 0 },
];

describe("FormStrip", () => {
  it("an empty memory offers every form, alphabetically, and starts from the picked one", () => {
    const onStart = vi.fn();
    render(<FormStrip note={note()} notes={forms} onStartFrom={onStart} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Daily Review", "Weekly Summary"]);
    fireEvent.click(buttons[0]);
    expect(onStart).toHaveBeenCalledWith("d");
  });

  it("the offer is gone once the memory has any content (or there are no forms)", () => {
    const { container, rerender } = render(<FormStrip note={note({ markdown: "a thought" })} notes={forms} onStartFrom={vi.fn()} />);
    expect(container.textContent).toBe("");
    rerender(<FormStrip note={note({ markdown: "​\n" })} notes={[forms[2]]} onStartFrom={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("a form says so, with its question and charm counts", () => {
    render(
      <FormStrip
        note={note({ markdown: "T\n\n**A?**\n\n**B?**\n\n```pensieve:charm\nname: Compress\nx\n```", extra: { form: "true" } })}
        notes={forms}
        onStartFrom={vi.fn()}
      />,
    );
    expect(screen.getByTestId("form-strip").textContent).toContain("2 questions · 1 charm");
  });
});
