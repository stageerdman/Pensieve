import { describe, it, expect, vi } from "vitest";
import { processRawBatch, type PageDescription, type RawBatchStore } from "./processRawBatch";
import type { Note, RawMemory } from "../types";

function fakeStore() {
  const notes = new Map<string, Note>();
  const media: string[] = [];
  const transcripts = new Map<string, unknown>();
  let seq = 0;
  const store: RawBatchStore = {
    create: vi.fn(async () => {
      seq += 1;
      const note: Note = {
        id: `note${seq}`,
        title: "Untitled",
        markdown: "",
        createdAt: 0,
        addedAt: 0,
        updatedAt: 0,
        categories: [],
        tags: [],
        links: [],
        pinned: false,
        starred: false,
      };
      notes.set(note.id, note);
      return note;
    }),
    save: vi.fn(async (n: Note) => {
      notes.set(n.id, n);
    }),
    saveMedia: vi.fn(async (noteId: string, _bytes: ArrayBuffer | Uint8Array, ext: string) => {
      const ref = `media/${noteId}/dup${media.length}.${ext}`;
      media.push(ref);
      return ref;
    }),
    saveTranscript: vi.fn(async (ref: string, t: unknown) => {
      transcripts.set(ref, t);
    }),
  };
  return { store, notes, transcripts };
}

function rawMemory(pages: string[]): RawMemory {
  return { id: "raw1", status: "synced", createdAt: 0, pages };
}

describe("processRawBatch", () => {
  it("a single-date batch becomes exactly one Memory, pages duplicated into its own folder", async () => {
    const { store, notes, transcripts } = fakeStore();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png"]);
    const describePage = vi.fn(
      async (ref: string): Promise<PageDescription> =>
        ref.endsWith("a.png")
          ? { transcript: "Had a quiet morning.", dateHeader: "Nov 3" }
          : { transcript: "Walked the dog later.", dateHeader: null },
    );
    const readMediaBytes = vi.fn(async () => ({ bytes: new ArrayBuffer(4), ext: "png" }));
    const resolveAbsolutePath = vi.fn(async (ref: string) => `/vault/${ref}`);

    const result = await processRawBatch(rm, {
      store,
      describePage,
      readMediaBytes,
      resolveAbsolutePath,
      now: () => new Date(2026, 10, 9),
    });

    expect(result.createdNoteIds).toEqual(["note1"]);
    const note = notes.get("note1")!;
    expect(note.markdown).toContain("```pensieve:journal");
    expect(note.markdown).toContain("media/note1/dup0.png");
    expect(note.markdown).toContain("media/note1/dup1.png");
    expect(note.createdAt).toBe(new Date(2026, 10, 3).getTime()); // detected date, not "now"
    expect(readMediaBytes).toHaveBeenCalledTimes(2);
    expect(transcripts.size).toBe(2);
  });

  it("a multi-date batch becomes N Memories, each with only its own pages", async () => {
    const { store, notes } = fakeStore();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png", "media/raw1/c.png"]);
    const describePage = vi.fn(async (ref: string): Promise<PageDescription> => {
      if (ref.endsWith("a.png")) return { transcript: "day one", dateHeader: "Nov 3" };
      if (ref.endsWith("b.png")) return { transcript: "day two", dateHeader: "Nov 4" };
      return { transcript: "day two cont'd", dateHeader: null };
    });

    const result = await processRawBatch(rm, {
      store,
      describePage,
      readMediaBytes: async () => ({ bytes: new ArrayBuffer(1), ext: "png" }),
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
      now: () => new Date(2026, 10, 9),
    });

    expect(result.createdNoteIds).toEqual(["note1", "note2"]);
    expect(result.groups.map((g) => g.date)).toEqual(["Nov 3", "Nov 4"]);
    expect(notes.get("note1")!.markdown.match(/media\//g)?.length).toBe(1); // only page a
    expect(notes.get("note2")!.markdown.match(/media\//g)?.length).toBe(2); // pages b, c
  });

  it("a shared boundary page is duplicated into BOTH adjoining Memories — two independent copies, same source", async () => {
    const { store, notes } = fakeStore();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/shared.png", "media/raw1/c.png"]);
    const describePage = vi.fn(async (ref: string): Promise<PageDescription> => {
      if (ref.endsWith("a.png")) return { transcript: "end of day one", dateHeader: "Nov 3" };
      if (ref.endsWith("shared.png")) return { transcript: "...and day two begins", dateHeader: "Nov 4", continuesPrevious: true };
      return { transcript: "day two continues", dateHeader: null };
    });
    const readMediaBytes = vi.fn(async (_ref: string) => ({ bytes: new ArrayBuffer(1), ext: "png" }));

    const result = await processRawBatch(rm, {
      store,
      describePage,
      readMediaBytes,
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
      now: () => new Date(2026, 10, 9),
    });

    expect(result.createdNoteIds).toEqual(["note1", "note2"]);
    // the shared page's bytes were read TWICE (once per note it was duplicated into)
    const sharedReads = readMediaBytes.mock.calls.filter((c) => c[0] === "media/raw1/shared.png");
    expect(sharedReads.length).toBe(2);
    expect(notes.get("note1")!.markdown).toContain("dup1.png"); // a + shared
    expect(notes.get("note2")!.markdown).toContain("dup2.png"); // a SEPARATE copy of shared + c
  });

  it("resolves a YYYY placeholder from whichever page shows a real year, even a later one", async () => {
    // the owner's exact scenario: the year isn't necessarily on the first page, and once
    // found it must apply to every group's createdAt, not just the page that had it.
    const { store, notes } = fakeStore();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png", "media/raw1/c.png"]);
    const describePage = vi.fn(async (ref: string): Promise<PageDescription> => {
      if (ref.endsWith("a.png")) return { transcript: "day one", dateHeader: "3 November YYYY" };
      if (ref.endsWith("b.png")) return { transcript: "day two", dateHeader: "4 November 2024" };
      return { transcript: "day two cont'd", dateHeader: null };
    });

    const result = await processRawBatch(rm, {
      store,
      describePage,
      readMediaBytes: async () => ({ bytes: new ArrayBuffer(1), ext: "png" }),
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
      now: () => new Date(2026, 10, 9),
    });

    expect(result.groups.map((g) => g.date)).toEqual(["3 November 2024", "4 November 2024"]);
    expect(notes.get("note1")!.createdAt).toBe(new Date(2024, 10, 3).getTime());
    expect(notes.get("note2")!.createdAt).toBe(new Date(2024, 10, 4).getTime());
  });

  it("falls back to the real current year when no page shows one at all", async () => {
    const { store, notes } = fakeStore();
    const rm = rawMemory(["media/raw1/a.png"]);
    await processRawBatch(rm, {
      store,
      describePage: async () => ({ transcript: "x", dateHeader: "9 November YYYY" }),
      readMediaBytes: async () => ({ bytes: new ArrayBuffer(1), ext: "png" }),
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
      now: () => new Date(2026, 10, 9),
    });
    expect(notes.get("note1")!.createdAt).toBe(new Date(2026, 10, 9).getTime());
  });

  it("does not touch the raw batch itself — deletion is the caller's job after this resolves", async () => {
    const { store } = fakeStore();
    const rm = rawMemory(["media/raw1/a.png"]);
    await processRawBatch(rm, {
      store,
      describePage: async () => ({ transcript: "x", dateHeader: "Nov 1" }),
      readMediaBytes: async () => ({ bytes: new ArrayBuffer(1), ext: "png" }),
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
    });
    // RawBatchStore doesn't even expose removeRawMemory — if this compiles, nothing here
    // could have deleted the batch. (Documents the contract; there's nothing to call.)
    expect(Object.keys(store)).not.toContain("removeRawMemory");
  });
});
