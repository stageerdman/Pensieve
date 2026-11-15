import { beforeEach, describe, expect, it } from "vitest";
import { metaFromNote, newestNote, upsertMeta } from "./noteMeta";
import { BrowserStore } from "./browser";
import type { Note, NoteMeta } from "../types";

beforeEach(() => localStorage.clear());

describe("noteMeta (in-place list patching)", () => {
  it("matches what a fresh list() returns for the saved note — the two paths can't drift", async () => {
    const store = new BrowserStore();
    const created = await store.create();
    const note: Note = {
      ...created,
      markdown: "# A title\nSome *body* text, with [a link](x).",
      tags: ["goals"],
      categories: ["Notes & Lessons"],
      links: ["other-id"],
      icon: { shape: "beaker", color: 43 } as Note["icon"],
      starred: true,
    };
    await store.save(note);
    const listed = (await store.list()).find((n) => n.id === note.id)!;
    const patched = metaFromNote(note, listed, listed.updatedAt);
    const strip = (m: NoteMeta) => ({ ...m, linkedByCount: undefined });
    expect(strip(patched)).toEqual(strip(listed));
  });

  it("carries sidecar-only engagement signals from the previous entry", () => {
    const note = { id: "a", title: "x", markdown: "x", createdAt: 1, addedAt: 1, updatedAt: 1, categories: [], tags: [], links: [], pinned: false, starred: false } as Note;
    const prev = { id: "a", title: "x", createdAt: 1, updatedAt: 1, openCount: 7, lastOpenedAt: 99 } as NoteMeta;
    expect(metaFromNote(note, prev, 5)).toMatchObject({ openCount: 7, lastOpenedAt: 99, updatedAt: 5 });
  });

  it("upsertMeta replaces in place or appends; newestNote picks max updatedAt", () => {
    const a = { id: "a", title: "A", createdAt: 1, updatedAt: 3 } as NoteMeta;
    const b = { id: "b", title: "B", createdAt: 1, updatedAt: 9 } as NoteMeta;
    expect(upsertMeta([a], b).map((n) => n.id)).toEqual(["a", "b"]);
    expect(upsertMeta([a, b], { ...a, title: "A2" }).map((n) => n.title)).toEqual(["A2", "B"]);
    expect(newestNote([a, b])?.id).toBe("b");
    expect(newestNote([])).toBeUndefined();
  });
});
