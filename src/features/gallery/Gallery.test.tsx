import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Gallery } from "./Gallery";
import { DEFAULT_GALLERY_STATE } from "../../lib/gallery/view";
import { DEFAULT_CATEGORIES } from "../../lib/categories/defs";
import type { NoteMeta } from "../../lib/types";

const DAY = 86_400_000;
const NOW = Date.now();

function note(p: Partial<NoteMeta> & { id: string; createdAt: number }): NoteMeta {
  return { title: p.id, updatedAt: p.createdAt, excerpt: "some body", ...p };
}

describe("Gallery", () => {
  it("shows the empty state when there are no memories", () => {
    render(
      <Gallery
        notes={[]}
        state={DEFAULT_GALLERY_STATE}
        categoryDefs={DEFAULT_CATEGORIES}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/no memories yet/i)).toBeInTheDocument();
  });

  it("groups by date and orders groups oldest-first (Today last)", () => {
    const notes = [
      note({ id: "today", title: "Today note", createdAt: NOW }),
      note({ id: "old", title: "Old note", createdAt: NOW - 60 * DAY }),
    ];
    render(
      <Gallery
        notes={notes}
        state={DEFAULT_GALLERY_STATE}
        categoryDefs={DEFAULT_CATEGORIES}
        onOpen={() => {}}
      />,
    );
    const groups = screen.getAllByRole("region");
    // region[0] is the gallery itself; the date-group <section>s follow in DOM order.
    const sections = screen.getAllByRole("region").slice(1);
    // The oldest (month) group renders before the Today group.
    const names = sections.map((s) => s.getAttribute("aria-label"));
    expect(names[names.length - 1]).toBe("Today");
    expect(names[0]).not.toBe("Today");
    expect(groups.length).toBeGreaterThan(1);
  });

  it("opens in the foreground on a plain click and the background on ⌘-click", () => {
    const onOpen = vi.fn();
    render(
      <Gallery
        notes={[note({ id: "a", title: "Alpha", createdAt: NOW })]}
        state={DEFAULT_GALLERY_STATE}
        categoryDefs={DEFAULT_CATEGORIES}
        onOpen={onOpen}
      />,
    );
    const card = screen.getByText("Alpha");
    fireEvent.click(card);
    expect(onOpen).toHaveBeenLastCalledWith("a", false);
    fireEvent.click(card, { metaKey: true });
    expect(onOpen).toHaveBeenLastCalledWith("a", true);
  });

  it("renders the snippet only when the field is on", () => {
    const notes = [note({ id: "a", title: "Alpha", createdAt: NOW, excerpt: "hello world" })];
    const { rerender } = render(
      <Gallery
        notes={notes}
        state={DEFAULT_GALLERY_STATE}
        categoryDefs={DEFAULT_CATEGORIES}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("hello world")).toBeInTheDocument();
    rerender(
      <Gallery
        notes={notes}
        state={{ ...DEFAULT_GALLERY_STATE, fields: { ...DEFAULT_GALLERY_STATE.fields, snippet: false } }}
        categoryDefs={DEFAULT_CATEGORIES}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByText("hello world")).toBeNull();
  });
});
