import { describe, expect, it } from "vitest";
import type { Note, TimelineEntry } from "../types";
import { beforeAiEntry, canRedo, resetForRedo } from "./redo";
import { fillFormMemory } from "./fillForm";
import { mergeNewFormItems } from "../../components/transcription/queueOps";
import type { ProcessItem } from "../../components/transcription/queueOps";

const AUDIO = "media/s1/take.wav";
const PHONE = "Daily\n\n**Q?**\n\n```pensieve:audio\n" + AUDIO + "\n```";
const note = (md: string, extra: Record<string, string>): Note => ({
  id: "s1", title: "Daily", markdown: md, createdAt: 0, addedAt: 0, updatedAt: 0,
  categories: [], tags: [], links: [], pinned: false, starred: false, extra,
});

function world() {
  const notes = new Map<string, Note>([["s1", note(PHONE, { fromForm: "f", formStatus: "awaiting" })]]);
  let timeline: TimelineEntry[] = [];
  const deps = {
    load: async (id: string) => notes.get(id) ?? null,
    save: async (n: Note) => void notes.set(n.id, n),
    loadTimeline: async () => timeline,
    saveTimeline: async (_: string, e: TimelineEntry[]) => void (timeline = e),
  };
  return { notes, deps, timeline: () => timeline };
}

describe("Redo with AI", () => {
  it("a fill labels its restore point; redo returns to it, keeps the AI result in the Timeline, re-marks awaiting", async () => {
    const w = world();
    await fillFormMemory("s1", {
      ...w.deps,
      loadTranscript: async () => ({ version: 1, media: AUDIO, meta: {}, segments: [{ id: 0, speaker: null, start: 0, end: 1, text: "ano", words: [] }] }),
      ask: async () => JSON.stringify({ answers: { q: { text: "Czech answer." } } }),
    });
    const filled = w.notes.get("s1")!;
    expect(filled.markdown).toContain("Czech answer.");
    expect(beforeAiEntry(w.timeline())?.markdown).toBe(PHONE);
    expect(canRedo(filled, w.timeline())).toBe(true);

    expect(await resetForRedo("s1", w.deps, 42)).toEqual([AUDIO]);
    const redone = w.notes.get("s1")!;
    expect(redone.markdown).toBe(PHONE);
    expect(redone.extra?.formStatus).toBe("awaiting");
    expect(w.timeline().at(-1)).toMatchObject({ ts: 42, label: "before-redo", markdown: filled.markdown });
    expect(canRedo(redone, w.timeline())).toBe(false); // awaiting again → not offered twice
  });

  it("accepts the unlabeled restore point older fills left", () => {
    expect(beforeAiEntry([{ ts: 1, wordDelta: 0, markdown: PHONE }])?.markdown).toBe(PHONE);
    expect(beforeAiEntry([{ ts: 1, wordDelta: 3, markdown: PHONE }])).toBeUndefined();
  });

  it("the queue holds a form back while its recording is re-transcribing", () => {
    const audioRow = { ref: AUDIO, type: "audio", noteId: "s1", title: "", audioName: "take.wav", order: 1, model: "parakeet", pct: 0, phase: null, error: false } as ProcessItem;
    const found = [{ noteId: "s1", title: "Daily", audioRefs: [AUDIO] }];
    expect(mergeNewFormItems([audioRow], found)).toHaveLength(1);
    expect(mergeNewFormItems([], found)).toHaveLength(1);
    expect(mergeNewFormItems([], found)[0].type).toBe("form");
  });
});
