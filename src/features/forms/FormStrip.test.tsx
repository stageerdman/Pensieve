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

  it("a form says so, with its question count and its button spells", () => {
    render(
      <FormStrip
        note={note({ markdown: "T\n\n**A?**\n\n**B?**\n\n```pensieve:patronus\nspell: compress\nx\n```", extra: { form: "true" } })}
        notes={forms}
        onStartFrom={vi.fn()}
      />,
    );
    expect(screen.getByTestId("form-strip").textContent).toContain("2 questions · Compress");
  });

  it("a memory made from a form shows one bare button per spell; pressing it casts", () => {
    const cast = vi.fn();
    const spells = { spells: [{ name: "Compress", prompt: "p" }], run: undefined, cast };
    render(<FormStrip note={note({ markdown: "Weekly\n\n**Wins?**", extra: { fromForm: "w" } })} notes={forms} onStartFrom={vi.fn()} spells={spells} />);
    const strip = screen.getByTestId("form-spells");
    expect(strip.textContent).toBe("Compress");
    fireEvent.click(screen.getByRole("button", { name: "Compress" }));
    expect(cast).toHaveBeenCalledWith("Compress");
  });

  it("running: the pressed spell breathes and can't be pressed again; a failure says why", () => {
    const md = note({ markdown: "Weekly\n\n**Wins?**", extra: { fromForm: "w" } });
    const base = { spells: [{ name: "Compress", prompt: "" }, { name: "Expand", prompt: "" }], cast: vi.fn() };
    const { rerender } = render(<FormStrip note={md} notes={forms} onStartFrom={vi.fn()} spells={{ ...base, run: { status: "running", spell: "Compress" } }} />);
    const [c, e] = screen.getAllByRole("button");
    expect(c.textContent).toBe("Compress…");
    expect(c.getAttribute("aria-busy")).toBe("true");
    expect((c as HTMLButtonElement).disabled && (e as HTMLButtonElement).disabled).toBe(true);
    rerender(<FormStrip note={md} notes={forms} onStartFrom={vi.fn()} spells={{ ...base, run: { status: "note", spell: "Compress", text: "Claude took too long", failed: true } }} />);
    expect(screen.getByRole("status").textContent).toBe("Compress didn't run: Claude took too long");
    expect((screen.getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("no spells → nothing over a memory made from a form", () => {
    const { container } = render(<FormStrip note={note({ markdown: "W\n\n**Q?**", extra: { fromForm: "w" } })} notes={forms} onStartFrom={vi.fn()} spells={{ spells: [], run: undefined, cast: vi.fn() }} />);
    expect(container.textContent).toBe("");
  });
});
