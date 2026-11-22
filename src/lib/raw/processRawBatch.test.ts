import { describe, it, expect, vi } from "vitest";
import { processRawBatch, type DescribePage, type PageDescription, type ProcessRawBatchDeps, type RawBatchStore } from "./processRawBatch";
import type { Note, RawMemory } from "../types";

/** An in-memory store + media copier, recording every write so reruns can be compared. */
function harness() {
  const notes = new Map<string, Note>();
  const transcripts = new Map<string, unknown>();
  const copies: Array<[string, string]> = [];
  const store: RawBatchStore = {
    save: vi.fn(async (n: Note) => void notes.set(n.id, n)),
    saveTranscript: vi.fn(async (ref: string, t: unknown) => void transcripts.set(ref, t)),
  };
  const copyMedia = vi.fn(async (from: string, to: string) => void copies.push([from, to]));
  const run = (rm: RawMemory, describePage: DescribePage, extra: Partial<ProcessRawBatchDeps> = {}) =>
    processRawBatch(rm, {
      store,
      copyMedia,
      describePage,
      resolveAbsolutePath: async (ref) => `/vault/${ref}`,
      now: () => new Date(2026, 10, 9),
      ...extra,
    });
  return { store, notes, transcripts, copies, copyMedia, run };
}

function rawMemory(pages: string[]): RawMemory {
  return { id: "raw1", status: "synced", createdAt: 0, pages };
}

const fixed = (d: PageDescription): DescribePage => async () => d;

describe("processRawBatch", () => {
  it("a single-date batch becomes exactly one Memory, pages copied into its own folder", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png"]);
    const result = await h.run(rm, async (ref) =>
      ref.endsWith("a.png") ? { transcript: "Had a quiet morning.", dateHeader: "Nov 3" } : { transcript: "Walked the dog later.", dateHeader: null },
    );

    expect(result.createdNoteIds).toEqual(["raw1-1"]);
    const note = h.notes.get("raw1-1")!;
    expect(note.markdown).toContain("```pensieve:journal");
    expect(note.markdown).toContain("media/raw1-1/p1.png");
    expect(note.markdown).toContain("media/raw1-1/p2.png");
    expect(note.createdAt).toBe(new Date(2026, 10, 3).getTime()); // detected date, not "now"
    expect(h.copies).toEqual([
      ["media/raw1/a.png", "media/raw1-1/p1.png"],
      ["media/raw1/b.png", "media/raw1-1/p2.png"],
    ]);
    expect(h.transcripts.size).toBe(2);
  });

  it("a multi-date batch becomes N Memories, each with only its own pages", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png", "media/raw1/c.png"]);
    const result = await h.run(rm, async (ref) => {
      if (ref.endsWith("a.png")) return { transcript: "day one", dateHeader: "Nov 3" };
      if (ref.endsWith("b.png")) return { transcript: "day two", dateHeader: "Nov 4" };
      return { transcript: "day two cont'd", dateHeader: null };
    });

    expect(result.createdNoteIds).toEqual(["raw1-1", "raw1-2"]);
    expect(result.groups.map((g) => g.date)).toEqual(["Nov 3", "Nov 4"]);
    expect(h.notes.get("raw1-1")!.markdown.match(/media\//g)?.length).toBe(1); // only page a
    expect(h.notes.get("raw1-2")!.markdown.match(/media\//g)?.length).toBe(2); // pages b, c
  });

  it("a shared boundary page is copied into BOTH adjoining Memories — two independent copies, same source", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/shared.png", "media/raw1/c.png"]);
    const result = await h.run(rm, async (ref) => {
      if (ref.endsWith("a.png")) return { transcript: "end of day one", dateHeader: "Nov 3" };
      if (ref.endsWith("shared.png")) return { transcript: "...and day two begins", dateHeader: "Nov 4", continuesPrevious: true };
      return { transcript: "day two continues", dateHeader: null };
    });

    expect(result.createdNoteIds).toEqual(["raw1-1", "raw1-2"]);
    const sharedCopies = h.copies.filter(([from]) => from === "media/raw1/shared.png").map(([, to]) => to);
    expect(sharedCopies).toEqual(["media/raw1-1/p2.png", "media/raw1-2/p1.png"]);
  });

  it("resolves a YYYY placeholder from whichever page shows a real year, even a later one", async () => {
    // the owner's exact scenario: the year isn't necessarily on the first page, and once
    // found it must apply to every group's createdAt, not just the page that had it.
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png", "media/raw1/c.png"]);
    const result = await h.run(rm, async (ref) => {
      if (ref.endsWith("a.png")) return { transcript: "day one", dateHeader: "3 November YYYY" };
      if (ref.endsWith("b.png")) return { transcript: "day two", dateHeader: "4 November 2024" };
      return { transcript: "day two cont'd", dateHeader: null };
    });

    expect(result.groups.map((g) => g.date)).toEqual(["3 November 2024", "4 November 2024"]);
    expect(h.notes.get("raw1-1")!.createdAt).toBe(new Date(2024, 10, 3).getTime());
    expect(h.notes.get("raw1-2")!.createdAt).toBe(new Date(2024, 10, 4).getTime());
  });

  it("falls back to the real current year when no page shows one at all", async () => {
    const h = harness();
    await h.run(rawMemory(["media/raw1/a.png"]), fixed({ transcript: "x", dateHeader: "9 November YYYY" }));
    expect(h.notes.get("raw1-1")!.createdAt).toBe(new Date(2026, 10, 9).getTime());
  });

  it("derives a real title from the page's own transcript — not left as the blank 'Untitled' a fence-only body produces", async () => {
    const h = harness();
    await h.run(rawMemory(["media/raw1/a.png"]), fixed({ transcript: "Went for a long walk by the river. It was cold.", dateHeader: "Nov 3" }));
    const markdown = h.notes.get("raw1-1")!.markdown;
    expect(markdown.startsWith("Went for a long walk by the river.")).toBe(true);
    expect(markdown).toContain("```pensieve:journal"); // the fence survives, title is just prepended
  });

  it("uses the AI's own `title` field instead of guessing from the transcript — this is what keeps the date out of the title (the owner's explicit complaint)", async () => {
    const h = harness();
    await h.run(
      rawMemory(["media/raw1/a.png"]),
      fixed({ transcript: "18 October 2024. Went for a long walk by the river. It was cold.", dateHeader: "Nov 3", title: "A Walk by the River" }),
    );
    expect(h.notes.get("raw1-1")!.markdown.startsWith("A Walk by the River")).toBe(true);
  });

  it("falls back to the detected date as a title when the page is blank/illegible", async () => {
    const h = harness();
    await h.run(rawMemory(["media/raw1/a.png"]), fixed({ transcript: "", dateHeader: "Nov 3" }));
    expect(h.notes.get("raw1-1")!.markdown.startsWith("Nov 3")).toBe(true);
  });

  it("a shared boundary page's transcript is SPLIT between its two Memories — the closing day only gets previousPart, the opening day only gets its own new-header text", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/shared.png", "media/raw1/c.png"]);
    await h.run(rm, async (ref) => {
      if (ref.endsWith("a.png")) return { transcript: "End of day one.", dateHeader: "Nov 3" };
      if (ref.endsWith("shared.png"))
        return { transcript: "Day two begins here.", dateHeader: "Nov 4", continuesPrevious: true, previousPart: "Still finishing day one thoughts." };
      return { transcript: "Day two continues.", dateHeader: null };
    });
    expect(h.notes.get("raw1-1")!.markdown.startsWith("End of day one.")).toBe(true);
    expect(h.notes.get("raw1-2")!.markdown.startsWith("Day two begins here.")).toBe(true);
  });

  it("a shared boundary page with no previousPart from the AI falls back to its whole transcript rather than losing the closing day's text", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/shared.png"]);
    await h.run(rm, async (ref) =>
      ref.endsWith("a.png")
        ? { transcript: "End of day one.", dateHeader: "Nov 3" }
        : { transcript: "Whole page text, no split given.", dateHeader: "Nov 4", continuesPrevious: true },
    );
    expect(h.notes.get("raw1-1")!.markdown.startsWith("End of day one.")).toBe(true);
    expect(h.notes.get("raw1-2")!.markdown.startsWith("Whole page text, no split given.")).toBe(true);
  });

  it("reports page-by-page progress via onPageDone as the Process queue's only real progress signal", async () => {
    const h = harness();
    const ticks: Array<[number, number]> = [];
    await h.run(rawMemory(["media/raw1/a.png", "media/raw1/b.png", "media/raw1/c.png"]), fixed({ transcript: "x", dateHeader: "Nov 1" }), {
      onPageDone: (done, total) => ticks.push([done, total]),
    });
    expect(ticks).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("does not touch the raw batch itself — deletion is the caller's job after this resolves", async () => {
    const h = harness();
    await h.run(rawMemory(["media/raw1/a.png"]), fixed({ transcript: "x", dateHeader: "Nov 1" }));
    expect(Object.keys(h.store)).not.toContain("removeRawMemory");
  });

  // ── crash-safety contract (see lib/raw/job) ──

  it("a rerun writes the SAME ids and paths — it overwrites, never duplicates", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png"]);
    const describe = async (ref: string): Promise<PageDescription> => ({ transcript: ref, dateHeader: ref.endsWith("a.png") ? "Nov 3" : "Nov 4" });
    const first = await h.run(rm, describe);
    const firstCopies = [...h.copies];
    const firstNotes = new Map(h.notes);
    const second = await h.run(rm, describe);

    expect(second.createdNoteIds).toEqual(first.createdNoteIds);
    expect(h.notes).toEqual(firstNotes);
    expect(h.copies.slice(firstCopies.length)).toEqual(firstCopies);
  });

  it("pages in `known` are reused, not described again; new ones are checkpointed before moving on", async () => {
    const h = harness();
    const rm = rawMemory(["media/raw1/a.png", "media/raw1/b.png"]);
    const describePage = vi.fn(async (): Promise<PageDescription> => ({ transcript: "fresh", dateHeader: null }));
    const checkpointed: string[] = [];
    await h.run(rm, describePage, {
      known: { "media/raw1/a.png": { transcript: "from checkpoint", dateHeader: "Nov 3" } },
      onPageDescribed: async (ref) => void checkpointed.push(ref),
    });

    expect(describePage).toHaveBeenCalledTimes(1);
    expect(describePage).toHaveBeenCalledWith("media/raw1/b.png", "/vault/media/raw1/b.png");
    expect(checkpointed).toEqual(["media/raw1/b.png"]);
    expect(h.notes.get("raw1-1")!.markdown.startsWith("from checkpoint")).toBe(true);
  });

  it("writes each Memory's note last, after its page photos and transcripts", async () => {
    const h = harness();
    const order: string[] = [];
    h.copyMedia.mockImplementation(async (_f: string, to: string) => void order.push(`copy ${to}`));
    vi.mocked(h.store.saveTranscript).mockImplementation(async (ref: string) => void order.push(`transcript ${ref}`));
    vi.mocked(h.store.save).mockImplementation(async (n: Note) => void order.push(`note ${n.id}`));
    await h.run(rawMemory(["media/raw1/a.png"]), fixed({ transcript: "x", dateHeader: "Nov 1" }));
    expect(order).toEqual(["copy media/raw1-1/p1.png", "transcript media/raw1-1/p1.png", "note raw1-1"]);
  });
});
