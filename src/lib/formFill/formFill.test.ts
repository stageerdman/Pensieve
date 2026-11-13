import { describe, expect, it, vi } from "vitest";
import { DAILY_REVIEW } from "../forms/dailyReview.fixture";
import { answerText, applyAnswers, isAwaitingProcessing, memoryFromForm, parseForm } from "../forms";
import type { Note, TimelineEntry } from "../types";
import type { Transcript } from "../transcripts/types";
import { buildFillPrompt, fillFieldsOf, parseFillResponse } from "./prompt";
import { fillFormMemory } from "./fillForm";
import { listFormsToFill } from "./queue";

const base = memoryFromForm(DAILY_REVIEW, new Date(2026, 10, 12));
const ids = parseForm(base).fields.map((f) => f.id);
const AUDIO = "media/s1/take.wav";
const transcript = (text: string): Transcript => ({ version: 1, media: AUDIO, meta: {}, segments: [{ id: 0, speaker: null, start: 0, end: 9, text, words: [] }] });

function session(): Note {
  // what the phone sends: owner rated 2 and typed one answer; recording at the bottom
  const md = applyAnswers(base, { [ids[0]]: { scale: 2 }, [ids[2]]: { text: "Mostly." } }) + "\n\n```pensieve:audio\n" + AUDIO + "\n```";
  return {
    id: "s1", title: "Daily Review — Thu 12 Nov", markdown: md, createdAt: 0, addedAt: 0, updatedAt: 0,
    categories: [], tags: [], links: [], pinned: false, starred: false,
    extra: { fromForm: "form-1", formStatus: "awaiting" },
  };
}

function deps(over: Partial<Parameters<typeof fillFormMemory>[1]> = {}) {
  const notes = new Map<string, Note>([["s1", session()], ["form-1", { ...session(), id: "form-1", markdown: DAILY_REVIEW, extra: { form: "true" } }]]);
  const timeline: TimelineEntry[] = [];
  return {
    notes,
    timeline,
    d: {
      load: async (id: string) => notes.get(id) ?? null,
      save: vi.fn(async (n: Note) => void notes.set(n.id, n)),
      loadTranscript: async () => transcript("Dneska bych dal čtyřku. Hour of Power jsem udělal. Byl jsem král na hovoru s Novákem."),
      loadTimeline: async () => timeline,
      saveTimeline: async (_id: string, e: TimelineEntry[]) => void timeline.splice(0, timeline.length, ...e),
      ask: vi.fn(async () =>
        JSON.stringify({
          answers: {
            [ids[0]]: { scale: 4 }, // owner already rated 2 → must NOT change
            [ids[1]]: { check: ["Hour of Power", "Not a real item"] },
            [ids[2]]: { text: "Byl jsem král na hovoru s Novákem." },
            "made-up-question": { text: "nope" },
          },
        }),
      ),
      ...over,
    },
  };
}

describe("fill prompt", () => {
  it("describes every field, what's already answered, and asks for JSON only", () => {
    const f = parseForm(session().markdown).fields;
    const p = buildFillPrompt("Daily Review", fillFieldsOf(f, parseForm(DAILY_REVIEW).fields), "hello");
    expect(p).toContain(`id: ${ids[0]}`);
    expect(p).toContain("already rated: 2");
    expect(p).toContain("already answered (keep, only add to it): Mostly.");
    expect(p).toContain("Respond with ONLY one JSON object");
    expect(p).toContain("SAME language");
  });

  it("parses defensively: fences, unknown ids, wrong shapes, garbage", () => {
    const f = parseForm(base).fields;
    expect(parseFillResponse("not json", f)).toEqual({});
    const r = parseFillResponse("```json\n" + JSON.stringify({ answers: { [ids[0]]: { scale: "4" }, [ids[1]]: { check: ["hour of power"] }, x: { text: "y" } } }) + "\n```", f);
    expect(r).toEqual({ [ids[1]]: { check: ["hour of power"] } });
  });
});

describe("fillFormMemory", () => {
  it("fills from the transcript, never overrides the owner, keeps the recording, forges", async () => {
    const { notes, timeline, d } = deps();
    const res = await fillFormMemory("s1", d);
    expect(res).toEqual({ status: "filled", fields: 3 });
    const out = notes.get("s1")!;
    const f = parseForm(out.markdown).fields;
    expect(f[0].scale?.value).toBe(2); // owner's rating stands
    expect(f[1].items?.[0].checked).toBe(true);
    expect(answerText(f[2])).toBe("Mostly.\nByl jsem král na hovoru s Novákem."); // typed first, AI added after
    expect(out.markdown).toContain("```pensieve:audio\n" + AUDIO); // recording stays
    expect(out.markdown.indexOf("Byl jsem král")).toBeLessThan(out.markdown.indexOf("pensieve:audio"));
    expect(isAwaitingProcessing(out.extra)).toBe(false); // forged
    expect(out.extra).toEqual({ fromForm: "form-1" });
    expect(timeline.at(-1)?.markdown).toBe(session().markdown); // restore point = what the phone sent
  });

  it("no recording → just forged, no AI call", async () => {
    const { notes, d } = deps();
    notes.set("s1", { ...session(), markdown: base });
    const res = await fillFormMemory("s1", d);
    expect(res.status).toBe("forged-empty");
    expect(d.ask).not.toHaveBeenCalled();
    expect(isAwaitingProcessing(notes.get("s1")!.extra)).toBe(false);
  });

  it("refuses to run before the recording is transcribed (row stays, retried later)", async () => {
    const { d } = deps({ loadTranscript: async () => null });
    await expect(fillFormMemory("s1", d)).rejects.toThrow(/not transcribed/);
  });

  it("a memory that isn't awaiting is left alone", async () => {
    const { notes, d } = deps();
    notes.set("s1", { ...session(), extra: { fromForm: "form-1" } });
    expect((await fillFormMemory("s1", d)).status).toBe("skipped");
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe("listFormsToFill", () => {
  it("lists awaiting sessions only once their recording is transcribed", async () => {
    const s = session();
    const store = {
      list: async () => [{ id: "s1", title: s.title, createdAt: 0, updatedAt: 0, extra: s.extra }, { id: "x", title: "x", createdAt: 0, updatedAt: 0 }],
      load: async (id: string) => (id === "s1" ? s : null),
      loadTranscript: vi.fn(async () => null as Transcript | null),
    };
    expect(await listFormsToFill(store)).toEqual([]);
    store.loadTranscript.mockResolvedValue(transcript("hi"));
    expect(await listFormsToFill(store)).toEqual([{ noteId: "s1", title: s.title }]);
  });
});
