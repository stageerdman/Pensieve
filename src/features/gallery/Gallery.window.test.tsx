// FAST-LOAD: the gallery's time window, end to end through the component with a scripted
// IntersectionObserver (jsdom has none). The window math itself is locked in
// lib/gallery/window.test.ts; this proves the wiring: opening window, silent load on the
// sentinel, unload-to-placeholder after 3 minutes far, remount when near again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Gallery } from "./Gallery";
import { DEFAULT_GALLERY_STATE, type GalleryState } from "../../lib/gallery/view";
import { DEFAULT_CATEGORIES } from "../../lib/categories/defs";
import type { NoteMeta } from "../../lib/types";

vi.mock("./NotePreview", () => ({ NotePreview: () => null }));

const DAY = 86_400_000;

type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { cb: Cb; margin: string; els: Set<Element> }[] = [];
class FakeIO {
  rec: { cb: Cb; margin: string; els: Set<Element> };
  constructor(cb: Cb, opts?: IntersectionObserverInit) {
    this.rec = { cb, margin: opts?.rootMargin ?? "", els: new Set() };
    observers.push(this.rec);
  }
  observe(el: Element) {
    this.rec.els.add(el);
  }
  unobserve(el: Element) {
    this.rec.els.delete(el);
  }
  disconnect() {
    this.rec.els.clear();
    const i = observers.indexOf(this.rec);
    if (i >= 0) observers.splice(i, 1);
  }
}

/** Fire every live observer that watches `el` with the given verdict. */
function intersect(el: Element, isIntersecting: boolean) {
  for (const o of [...observers]) if (o.els.has(el)) o.cb([{ target: el, isIntersecting }]);
}
const sentinel = () => [...observers].flatMap((o) => (o.margin.startsWith("0px") ? [...o.els] : []))[0];

function renderGallery(notes: NoteMeta[]) {
  return render(
    <Gallery
      notes={notes}
      state={DEFAULT_GALLERY_STATE as GalleryState}
      categoryDefs={DEFAULT_CATEGORIES}
      theme="light"
      onOpen={vi.fn()}
      onToggleWorkingSet={vi.fn()}
      onToggleStar={vi.fn()}
      onRemoveFromWorkingSet={vi.fn()}
      onMoveInWorkingSet={vi.fn()}
      onReorderWorkingSet={vi.fn()}
    />,
  );
}

const cards = () => document.querySelectorAll("[data-note-id]").length;

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Gallery — time window (FAST-LOAD)", () => {
  // 100 memories, one every 3 days → ~3 in the last week, so the opening window stretches
  // to 24 cards.
  const now = Date.now();
  const notes = Array.from({ length: 100 }, (_, i) => ({
    id: `n${i}`,
    title: `Memory ${i}`,
    createdAt: now - i * 3 * DAY,
    updatedAt: now - i * 3 * DAY,
    excerpt: "x",
  })) as NoteMeta[];

  it("opens on a screenful of recent memories, not the whole history", () => {
    renderGallery(notes);
    expect(cards()).toBe(24);
    expect(screen.queryByText("Memory 0")).not.toBeNull();
    expect(screen.queryByText("Memory 99")).toBeNull();
  });

  it("loads older memories silently as the end comes near, until everything is in", () => {
    renderGallery(notes);
    let guard = 0;
    while (sentinel() && guard++ < 20) act(() => intersect(sentinel()!, true));
    expect(cards()).toBe(100);
    expect(sentinel()).toBeUndefined(); // nothing more → no sentinel
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("unloads a section far off-screen for 3 minutes into a same-height placeholder, and brings it back", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    renderGallery(notes);
    const section = document.querySelector("section[data-window-key]") as HTMLElement;
    const key = section.dataset.windowKey!;
    const before = section.querySelectorAll("[data-note-id]").length;
    expect(before).toBeGreaterThan(0);
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue({ height: 432 } as DOMRect);

    act(() => intersect(section, false)); // scrolled ≥ 2 screens away
    act(() => void vi.advanceTimersByTime(2 * 60_000));
    expect(section.querySelectorAll("[data-note-id]").length).toBe(before); // not yet

    act(() => void vi.advanceTimersByTime(90_000));
    const held = document.querySelector(`section[data-window-key="${key}"]`) as HTMLElement;
    expect(held.querySelectorAll("[data-note-id]").length).toBe(0);
    expect(held.style.height).toBe("432px");

    act(() => intersect(held, true)); // scrolled back near
    expect(held.querySelectorAll("[data-note-id]").length).toBe(before);
    expect(held.style.height).toBe("");
  });
});
