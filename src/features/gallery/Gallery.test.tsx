import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Gallery } from "./Gallery";
import { DEFAULT_GALLERY_STATE, type GalleryState } from "../../lib/gallery/view";
import { DEFAULT_CATEGORIES } from "../../lib/categories/defs";
import type { NoteMeta } from "../../lib/types";

// NotePreview renders a real BlockNote view, which needs layout/DOM APIs jsdom lacks
// (same reason App.test mocks the editor). Mock it to a marker; its Markdown render is
// covered by lib/md tests and verified in the real app.
vi.mock("./NotePreview", () => ({
  NotePreview: ({ markdown }: { markdown: string }) => (
    <div data-testid="note-preview">{markdown}</div>
  ),
}));

const DAY = 86_400_000;
const NOW = Date.now();

function note(p: Partial<NoteMeta> & { id: string; createdAt: number }): NoteMeta {
  return { title: p.id, updatedAt: p.createdAt, excerpt: "some body", ...p };
}

function renderGallery(
  notes: NoteMeta[],
  overrides: Partial<React.ComponentProps<typeof Gallery>> = {},
) {
  const props = {
    notes,
    state: DEFAULT_GALLERY_STATE as GalleryState,
    categoryDefs: DEFAULT_CATEGORIES,
    theme: "light" as const,
    onOpen: vi.fn(),
    onToggleWorkingSet: vi.fn(),
    onRemoveFromWorkingSet: vi.fn(),
    onMoveInWorkingSet: vi.fn(),
    onReorderWorkingSet: vi.fn(),
    ...overrides,
  };
  return { ...render(<Gallery {...props} />), props };
}

describe("Gallery — layout", () => {
  it("shows the empty state when there are no memories", () => {
    renderGallery([]);
    expect(screen.getByText(/no memories yet/i)).toBeInTheDocument();
  });

  it("groups by date and orders groups newest-first (Today first)", () => {
    renderGallery([
      note({ id: "today", title: "Today note", createdAt: NOW }),
      note({ id: "old", title: "Old note", createdAt: NOW - 60 * DAY }),
    ]);
    const sections = screen.getAllByRole("region").slice(1); // [0] is the gallery itself
    const names = sections.map((s) => s.getAttribute("aria-label"));
    expect(names[0]).toBe("Today");
    expect(names[names.length - 1]).not.toBe("Today");
  });

  it("renders the snippet only when the field is on", () => {
    const notes = [note({ id: "a", title: "Alpha", createdAt: NOW, excerpt: "hello world" })];
    const { rerender } = renderGallery(notes);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    rerender(
      <Gallery
        notes={notes}
        state={{ ...DEFAULT_GALLERY_STATE, fields: { ...DEFAULT_GALLERY_STATE.fields, snippet: false } }}
        categoryDefs={DEFAULT_CATEGORIES}
        theme="light"
        onOpen={() => {}}
        onToggleWorkingSet={() => {}}
        onRemoveFromWorkingSet={() => {}}
        onMoveInWorkingSet={() => {}}
        onReorderWorkingSet={() => {}}
      />,
    );
    expect(screen.queryByText("hello world")).toBeNull();
  });
});

describe("Gallery — open", () => {
  it("opens foreground on plain click, background on ⌘-click", () => {
    const { props } = renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })]);
    const card = screen.getByText("Alpha");
    fireEvent.click(card);
    expect(props.onOpen).toHaveBeenLastCalledWith("a", false);
    fireEvent.click(card, { metaKey: true });
    expect(props.onOpen).toHaveBeenLastCalledWith("a", true);
    fireEvent.click(card, { altKey: true });
    expect(props.onOpen).toHaveBeenLastCalledWith("a", true);
  });

  it("Enter opens, Space does NOT open (it peeks instead)", async () => {
    localStorage.clear();
    localStorage.setItem(
      "pensieve:note:a",
      JSON.stringify({
        id: "a",
        title: "Alpha",
        markdown: "# Alpha\n\nbody",
        createdAt: NOW,
        addedAt: NOW,
        updatedAt: NOW,
        categories: [],
        tags: [],
        links: [],
        pinned: false,
      }),
    );
    const onOpen = vi.fn();
    renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })], { onOpen });
    const card = screen.getByRole("button", { name: /Alpha/ });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("a", false);
    onOpen.mockClear();
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).not.toHaveBeenCalled();
    // Space pins a formatted preview portal instead of opening the note.
    expect(await screen.findByRole("region", { name: /preview/i })).toBeInTheDocument();
    // Flush the portal's async Markdown load (the mocked preview shows it).
    await screen.findByTestId("note-preview");
  });
});

describe("Gallery — working set", () => {
  it("'w' on a focused card toggles the working set", () => {
    const { props } = renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })]);
    const card = screen.getByRole("button", { name: /Alpha/ });
    fireEvent.keyDown(card, { key: "w" });
    expect(props.onToggleWorkingSet).toHaveBeenCalledWith("a");
  });

  it("right-click opens a context menu offering to add to the working set", () => {
    renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })]);
    fireEvent.contextMenu(screen.getByRole("button", { name: /Alpha/ }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText(/add to working set/i)).toBeInTheDocument();
  });

  it("renders the working-set strip for saved ids and hides it when empty", () => {
    const notes = [note({ id: "a", title: "Alpha", createdAt: NOW })];
    const { rerender } = renderGallery(notes);
    expect(screen.queryByRole("list", { name: /working set/i })).toBeNull();
    rerender(
      <Gallery
        notes={notes}
        state={{ ...DEFAULT_GALLERY_STATE, workingSet: ["a"] }}
        categoryDefs={DEFAULT_CATEGORIES}
        theme="light"
        onOpen={() => {}}
        onToggleWorkingSet={() => {}}
        onRemoveFromWorkingSet={() => {}}
        onMoveInWorkingSet={() => {}}
        onReorderWorkingSet={() => {}}
      />,
    );
    const strip = screen.getByRole("list", { name: /working set/i });
    expect(within(strip).getByText("Alpha")).toBeInTheDocument();
  });

  it("pins a working-set memory to the strip and hides it from the grid", () => {
    renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })], {
      state: { ...DEFAULT_GALLERY_STATE, workingSet: ["a"] },
    });
    // It lives only in the strip now — not duplicated in the grid below.
    const matches = screen.getAllByText("Alpha");
    expect(matches).toHaveLength(1);
    const strip = screen.getByRole("list", { name: /working set/i });
    expect(within(strip).getByText("Alpha")).toBeInTheDocument();
  });

  it("reorders the strip when a card is dragged past another", () => {
    const { props } = renderGallery(
      [
        note({ id: "a", title: "Alpha", createdAt: NOW }),
        note({ id: "b", title: "Beta", createdAt: NOW }),
      ],
      { state: { ...DEFAULT_GALLERY_STATE, workingSet: ["a", "b"] } },
    );
    const strip = screen.getByRole("list", { name: /working set/i });
    const items = within(strip).getAllByRole("listitem");
    // jsdom has no layout, so give the two cards explicit side-by-side rects: Alpha at
    // x∈[0,100] (center 50), Beta at x∈[120,220] (center 170).
    items[0].getBoundingClientRect = () =>
      ({ left: 0, right: 100, width: 100, top: 0, height: 120 }) as DOMRect;
    items[1].getBoundingClientRect = () =>
      ({ left: 120, right: 220, width: 100, top: 0, height: 120 }) as DOMRect;
    // Grab Alpha and drag it past Beta's center, then release.
    fireEvent.pointerDown(items[0], { button: 0, clientX: 40, clientY: 10 });
    fireEvent.pointerMove(items[0], { clientX: 200, clientY: 10 });
    fireEvent.pointerUp(items[0], { clientX: 200, clientY: 10 });
    expect(props.onReorderWorkingSet).toHaveBeenCalledWith(0, 1);
  });

  it("a plain click (no drag) still opens the memory", () => {
    const { props } = renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })], {
      state: { ...DEFAULT_GALLERY_STATE, workingSet: ["a"] },
    });
    const strip = screen.getByRole("list", { name: /working set/i });
    const card = within(strip).getByText("Alpha");
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(card, { clientX: 10, clientY: 10 });
    fireEvent.click(card);
    expect(props.onOpen).toHaveBeenCalledWith("a", false);
    expect(props.onReorderWorkingSet).not.toHaveBeenCalled();
  });
});
