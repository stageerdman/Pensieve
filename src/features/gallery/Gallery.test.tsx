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
    onToggleStar: vi.fn(),
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
        onToggleStar={() => {}}
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
        onToggleStar={() => {}}
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

  it("during Accio hides the strip and lists the working-set memory among the results", () => {
    renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })], {
      state: { ...DEFAULT_GALLERY_STATE, workingSet: ["a"] },
      searchActive: true,
    });
    expect(screen.queryByRole("list", { name: /working set/i })).not.toBeInTheDocument();
    const results = screen.getByRole("list", { name: "Search results, 1" });
    expect(within(results).getByText("Alpha")).toBeInTheDocument();
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

describe("Gallery — search results", () => {
  const notes = [
    note({ id: "best", title: "Garden plan", createdAt: NOW - 400 * DAY, categories: ["Idea"] }),
    note({ id: "next", title: "Today", createdAt: NOW, excerpt: "the garden gate" }),
  ];
  const match = new Map([
    ["best", { id: "best", where: "title" as const, snippet: null, rank: 0 }],
    ["next", { id: "next", where: "text" as const, snippet: { text: "the garden gate", marks: [[4, 10]] as [number, number][] }, rank: 0 }],
  ]);

  it("drops the date rail and keeps the search's order (best first, never re-sorted by date)", () => {
    renderGallery(notes, { searchActive: true, match, queryText: "garden" });
    expect(screen.getAllByRole("region")).toHaveLength(1); // only the gallery — no date sections
    const results = screen.getByRole("list", { name: "Search results, 2" });
    const rows = within(results).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Garden plan");
    expect(rows[1]).toHaveTextContent("Today");
  });

  it("lights the matched words in the title and the snippet, with a quiet type · date line", () => {
    renderGallery(notes, { searchActive: true, match, queryText: "garden" });
    const marks = document.querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual(["Garden", "garden"]);
    expect(screen.getByText(/^Idea · /)).toBeInTheDocument();
  });

  it("Enter opens a result, 'w' adds it to the working set (same keys as a card)", () => {
    const { props } = renderGallery(notes, { searchActive: true, match, queryText: "garden" });
    const row = screen.getByRole("button", { name: /Garden plan/ });
    fireEvent.keyDown(row, { key: "Enter" });
    expect(props.onOpen).toHaveBeenCalledWith("best", false);
    fireEvent.keyDown(row, { key: "w" });
    expect(props.onToggleWorkingSet).toHaveBeenCalledWith("best");
  });

  it("no results: the summons empty state", () => {
    renderGallery([], { searchActive: true, match: new Map(), queryText: "zzz" });
    expect(screen.getByText("No thoughts answer that summons")).toBeInTheDocument();
    expect(screen.getByText(/press Esc to see everything/)).toBeInTheDocument();
  });

  it("clearing the search brings the timeline back", () => {
    const { rerender, props } = renderGallery(notes, { searchActive: true, match, queryText: "garden" });
    rerender(<Gallery {...props} searchActive={false} match={undefined} queryText="" />);
    expect(screen.queryByRole("list", { name: /search results/i })).toBeNull();
    expect(screen.getAllByRole("region").slice(1)[0].getAttribute("aria-label")).toBe("Today");
  });
});

describe("Gallery — starred", () => {
  it("a starred memory glows (gold halo) and says so to screen readers; others don't", () => {
    renderGallery([
      note({ id: "s", title: "Bright", createdAt: NOW, starred: true }),
      note({ id: "p", title: "Plain", createdAt: NOW }),
    ]);
    const bright = screen.getByRole("button", { name: /Bright, starred/ });
    expect(within(bright).getByTestId("star-halo")).toBeInTheDocument();
    const plain = screen.getByRole("button", { name: /Plain/ });
    expect(plain.getAttribute("aria-label")).not.toMatch(/starred/);
    expect(within(plain).queryByTestId("star-halo")).toBeNull();
  });

  it("'s' on a focused card toggles the star", () => {
    const { props } = renderGallery([note({ id: "a", title: "Alpha", createdAt: NOW })]);
    fireEvent.keyDown(screen.getByRole("button", { name: /Alpha/ }), { key: "s" });
    expect(props.onToggleStar).toHaveBeenCalledWith("a");
  });

  it("the context menu offers Star / Unstar as a checkbox item", () => {
    const { props } = renderGallery([
      note({ id: "a", title: "Alpha", createdAt: NOW }),
      note({ id: "b", title: "Beta", createdAt: NOW, starred: true }),
    ]);
    fireEvent.contextMenu(screen.getByRole("button", { name: /Alpha/ }));
    const star = within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name: /^Star/ });
    expect(star).toHaveAttribute("aria-checked", "false");
    fireEvent.click(star);
    expect(props.onToggleStar).toHaveBeenCalledWith("a");

    fireEvent.contextMenu(screen.getByRole("button", { name: /Beta/ }));
    const unstar = within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name: /Unstar/ });
    expect(unstar).toHaveAttribute("aria-checked", "true");
  });

  it("a starred search result keeps its halo and says so", () => {
    renderGallery([note({ id: "s", title: "Bright", createdAt: NOW, starred: true })], { searchActive: true });
    const row = screen.getByRole("button", { name: /Bright, starred/ });
    expect(within(row).getByTestId("star-halo")).toBeInTheDocument();
  });

  it("at rest (no search) a starred memory stays in its date group — no Starred section", () => {
    renderGallery([
      note({ id: "old", title: "Old star", createdAt: NOW - 400 * DAY, starred: true }),
      note({ id: "fresh", title: "Fresh", createdAt: NOW }),
    ]);
    const names = screen.getAllByRole("region").slice(1).map((s) => s.getAttribute("aria-label"));
    expect(names).not.toContain("Starred");
    expect(names[0]).toBe("Today");
  });
});
