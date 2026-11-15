import { describe, expect, it, vi } from "vitest";
import { answerText, applyAnswers, memoryFromForm, parseForm } from "../forms";
import type { Note, TimelineEntry } from "../types";
import { castSpell, citedIds, cleanPointText, buildSpellPrompt, isoDay, openFields, parseSpellResponse, spellErrorText, spellsOf, toAnswers } from ".";

// The owner's bug report form: "Weekly Reflection" with a Patronus → Compress block.
const WEEKLY = `Weekly Reflection

**What were my wins this week?**

*Big and small.*

**What did I learn?**

**How was my energy (1-3)?**

\`\`\`pensieve:scale
1: Low
2: Fine
3: High
\`\`\`

**Habits**

* [ ] Gym 3×
* [ ] Read daily

\`\`\`pensieve:patronus
spell: compress
Go through my Daily Reviews from this week and pull out the wins and lessons.
\`\`\``;

const FORM_ID = "weekly";
const memoryMd = memoryFromForm(WEEKLY, new Date(2026, 10, 15));
const ids = parseForm(memoryMd).fields.map((f) => f.id); // wins, learn, energy, habits

const note = (id: string, markdown: string, extra?: Record<string, string>, createdAt = 0): Note => ({
  id, title: parseForm(markdown).title, markdown, createdAt, addedAt: createdAt, updatedAt: createdAt,
  categories: [], tags: [], links: [], pinned: false, starred: false, extra,
});

describe("spellsOf — which buttons a memory gets", () => {
  it("a memory made from a form gets one button per button spell (not the sync spell)", () => {
    const form = WEEKLY + "\n\n```pensieve:patronus\nspell: sync\nfill it\n```\n\n```pensieve:charm\nname: Compress\nduplicate name\n```";
    expect(spellsOf({ fromForm: FORM_ID }, form)).toEqual([
      { name: "Compress", prompt: "Go through my Daily Reviews from this week and pull out the wins and lessons." },
    ]);
  });
  it("nothing for a form itself, a plain memory, or a vanished form", () => {
    expect(spellsOf({ form: "true", fromForm: "x" }, WEEKLY)).toEqual([]);
    expect(spellsOf(undefined, WEEKLY)).toEqual([]);
    expect(spellsOf({ fromForm: FORM_ID }, null)).toEqual([]);
    expect(spellsOf({ fromForm: FORM_ID }, "Plain\n\n**Q?**")).toEqual([]);
  });
});

describe("openFields — a spell never touches what the owner answered", () => {
  const formFields = parseForm(WEEKLY).fields;
  it("a fresh copy is all open (guidance lines aren't answers)", () => {
    expect(openFields(memoryMd, formFields).map((f) => f.id)).toEqual(ids);
  });
  it("typed text, a rating and a tick each close their field", () => {
    const md = applyAnswers(memoryMd, { [ids[1]]: { text: "Patience." }, [ids[2]]: { scale: 2 }, [ids[3]]: { check: ["Read daily"] } });
    expect(openFields(md, formFields).map((f) => f.id)).toEqual([ids[0]]);
  });
});

describe("buildSpellPrompt", () => {
  it("carries the instruction, today, this memory's id/date, the form id, and only the open fields", () => {
    const fields = openFields(memoryMd, parseForm(WEEKLY).fields).slice(0, 2);
    const p = buildSpellPrompt({
      spell: { name: "Compress", prompt: "Pull out the wins." }, formId: FORM_ID, formTitle: "Weekly Reflection",
      memoryId: "m1", memoryTitle: "Weekly Reflection — Sun 15 Nov", memoryDate: new Date(2026, 10, 15), today: new Date(2026, 10, 16), fields,
    });
    expect(p).toContain("Pull out the wins.");
    expect(p).toContain("Today is 2026-11-16 (Monday)");
    expect(p).toContain("id m1, dated 2026-11-15");
    expect(p).toContain("form id weekly");
    expect(p).toContain(`id: ${ids[0]}`);
    expect(p).toContain(`id: ${ids[1]}`);
    expect(p).not.toContain(`id: ${ids[2]}`);
    expect(p).toContain("list_notes");
    expect(p).toContain("Never use this memory itself (m1)");
    expect(p).toContain("Respond with ONLY one JSON object");
  });
  it("an empty instruction still gets a sensible default", () => {
    const p = buildSpellPrompt({
      spell: { name: "Compress", prompt: "" }, formId: "f", formTitle: "F", memoryId: "m", memoryTitle: "M",
      memoryDate: new Date(2026, 0, 1), today: new Date(2026, 0, 1), fields: [],
    });
    expect(p).toContain("period this memory covers");
  });
  it("isoDay is the local calendar day", () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("parseSpellResponse", () => {
  const fields = parseForm(memoryMd).fields;
  it("keeps points with sources for questions, validated scale/checks, drops junk", () => {
    const raw = "Here you go:\n" + JSON.stringify({
      period: { from: "2026-11-09", to: "2026-11-15" },
      answers: {
        [ids[0]]: { points: [{ text: "* Closed the Novák deal\n", sources: ["d1", "d1", 7] }, { text: "  " }, { text: "No source" }] },
        [ids[2]]: { scale: 3, points: [{ text: "ignored for a scale", sources: ["d1"] }] },
        [ids[3]]: { check: ["gym 3×", "Not an item"] },
        "made-up": { points: [{ text: "x", sources: ["d1"] }] },
      },
    });
    expect(parseSpellResponse(raw, fields)).toEqual({
      [ids[0]]: { points: [{ text: "Closed the Novák deal", sources: ["d1"] }, { text: "No source", sources: [] }] },
      [ids[2]]: { scale: 3 },
      [ids[3]]: { check: ["gym 3×"] },
    });
  });
  it("never throws on garbage", () => {
    expect(parseSpellResponse("no", fields)).toEqual({});
    expect(parseSpellResponse('{"answers": [1]}', fields)).toEqual({});
    expect(parseSpellResponse('{"answers": {"' + ids[0] + '": {"points": "x"}}}', fields)).toEqual({});
  });
  it("point text is one clean line with no token braces", () => {
    expect(cleanPointText("1. Did {@x|y} things\n again")).toBe("Did @x|y things again");
  });
});

describe("toAnswers — date chips", () => {
  const cited = new Map([
    ["d2", { id: "d2", createdAt: new Date(2026, 10, 11).getTime() }],
    ["d1", { id: "d1", createdAt: new Date(2026, 10, 9).getTime() }],
  ]);
  it("each point → a bullet with note-link chips labelled by the memory's day, oldest first", () => {
    const { answers, dropped } = toAnswers({ q: { points: [{ text: "Won", sources: ["d2", "d1", "ghost"] }, { text: "Unsourced", sources: ["ghost"] }] } }, cited);
    expect(answers).toEqual({ q: { text: "* Won {@d1|Mon 9 Nov} {@d2|Wed 11 Nov}" } });
    expect(dropped).toBe(1);
  });
  it("citedIds dedupes across fields", () => {
    expect(citedIds({ a: { points: [{ text: "x", sources: ["d1", "d2"] }] }, b: { points: [{ text: "y", sources: ["d2"] }] } })).toEqual(["d1", "d2"]);
  });
});

describe("castSpell", () => {
  function world(reply: object, over: Partial<Parameters<typeof castSpell>[2]> = {}) {
    const notes = new Map<string, Note>([
      [FORM_ID, note(FORM_ID, WEEKLY, { form: "true" })],
      ["m1", note("m1", memoryMd, { fromForm: FORM_ID }, new Date(2026, 10, 15).getTime())],
      ["d1", note("d1", "Daily Review — Mon 9 Nov\n\nwon", { fromForm: "daily" }, new Date(2026, 10, 9).getTime())],
      ["d2", note("d2", "Daily Review — Wed 11 Nov\n\nlearned", { fromForm: "daily" }, new Date(2026, 10, 11).getTime())],
    ]);
    let timeline: TimelineEntry[] = [];
    const deps = {
      load: async (id: string) => notes.get(id) ?? null,
      save: vi.fn(async (n: Note) => void notes.set(n.id, n)),
      loadTimeline: async () => timeline,
      saveTimeline: async (_: string, e: TimelineEntry[]) => void (timeline = e),
      ask: vi.fn(async () => JSON.stringify(reply)),
      now: () => new Date(2026, 10, 15, 20),
      ...over,
    };
    return { notes, deps, timeline: () => timeline };
  }

  it("fills the open fields with chips, leaves a restore point, never cites itself or a form", async () => {
    const w = world({
      answers: {
        [ids[0]]: { points: [{ text: "Closed the Novák deal", sources: ["d1"] }, { text: "Self-cite", sources: ["m1", "weekly"] }] },
        [ids[1]]: { points: [{ text: "Slow is smooth", sources: ["d2", "d1"] }] },
        [ids[3]]: { check: ["Gym 3×"] },
      },
    });
    const res = await castSpell("m1", "Compress", w.deps);
    expect(res).toEqual({ status: "filled", fields: 3, cited: 2 });
    const out = w.notes.get("m1")!;
    const f = parseForm(out.markdown).fields;
    const tf = parseForm(WEEKLY).fields;
    expect(answerText(f[0], tf[0])).toBe("* Closed the Novák deal {@d1|Mon 9 Nov}");
    expect(answerText(f[1], tf[1])).toBe("* Slow is smooth {@d1|Mon 9 Nov} {@d2|Wed 11 Nov}");
    expect(f[3].items?.[0].checked).toBe(true);
    expect(out.extra).toEqual({ fromForm: FORM_ID });
    expect(w.timeline().at(-1)).toMatchObject({ label: "before-spell", markdown: memoryMd });
    const prompt = (w.deps.ask as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("Go through my Daily Reviews");
    expect(prompt).toContain("Today is 2026-11-15");
  });

  it("skips a field the owner typed into while the spell ran", async () => {
    const w = world({ answers: { [ids[0]]: { points: [{ text: "AI win", sources: ["d1"] }] }, [ids[1]]: { points: [{ text: "AI lesson", sources: ["d2"] }] } } });
    const settle = vi.fn(async () => {
      const m = w.notes.get("m1")!;
      w.notes.set("m1", { ...m, markdown: applyAnswers(m.markdown, { [ids[0]]: { text: "My own win" } }) });
    });
    const res = await castSpell("m1", "Compress", { ...w.deps, settle });
    expect(settle).toHaveBeenCalled();
    expect(res).toEqual({ status: "filled", fields: 1, cited: 2 });
    const md = w.notes.get("m1")!.markdown;
    expect(md).toContain("My own win");
    expect(md).not.toContain("AI win");
    expect(md).toContain("AI lesson {@d2|Wed 11 Nov}");
  });

  it("all answered → no AI call", async () => {
    const w = world({});
    const md = applyAnswers(memoryMd, { [ids[0]]: { text: "a" }, [ids[1]]: { text: "b" }, [ids[2]]: { scale: 1 }, [ids[3]]: { check: ["Gym 3×"] } });
    w.notes.set("m1", { ...w.notes.get("m1")!, markdown: md });
    expect(await castSpell("m1", "Compress", w.deps)).toEqual({ status: "all-answered" });
    expect(w.deps.ask).not.toHaveBeenCalled();
  });

  it("nothing citable → nothing written", async () => {
    const w = world({ answers: { [ids[0]]: { points: [{ text: "Invented", sources: ["nope"] }] } } });
    expect(await castSpell("m1", "Compress", w.deps)).toEqual({ status: "nothing-found" });
    expect(w.deps.save).not.toHaveBeenCalled();
    expect(w.timeline()).toEqual([]);
  });

  it("a vanished form / unknown spell is skipped; an AI failure propagates", async () => {
    const w = world({});
    w.notes.delete(FORM_ID);
    expect((await castSpell("m1", "Compress", w.deps)).status).toBe("skipped");
    const w2 = world({});
    expect((await castSpell("m1", "Expand", w2.deps)).status).toBe("skipped");
    const w3 = world({}, { ask: vi.fn(async () => Promise.reject(new Error("Claude didn't answer within 300 s"))) });
    await expect(castSpell("m1", "Compress", w3.deps)).rejects.toThrow(/300 s/);
  });
});

describe("spellErrorText", () => {
  it("short, honest lines", () => {
    expect(spellErrorText(new Error("Claude didn't answer within 300 s"))).toBe("Claude took too long");
    expect(spellErrorText("spawn failed (is `claude` installed?): No such file")).toBe("Claude Code isn't installed");
    expect(spellErrorText(new TypeError("Cannot read properties of undefined (reading 'invoke')"))).toBe("Needs the desktop app");
    expect(spellErrorText("Invalid API key · Please run /login")).toBe("Claude Code isn't signed in");
    expect(spellErrorText("x".repeat(200)).length).toBe(80);
  });
});
