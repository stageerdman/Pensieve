import { describe, expect, it } from "vitest";
import { DAILY_REVIEW } from "../../../../src/lib/forms/dailyReview.fixture";
import { parseForm, answerText, isAwaitingProcessing, fromFormId } from "../../../../src/lib/forms";
import { splitTitleAndBody, noteToRemoteContent, parseFrontmatter } from "../sync/noteFormat";
import { applySession, finishSession, formsIn, mediaBlocksOf, sessionHasContent, sessionMarkdown, startSession, answerShape } from "./session";
import type { Note } from "../../types";

const { title, body } = splitTitleAndBody(DAILY_REVIEW);
const form: Note = {
  id: "form-1", t: title, c: body, cat: "--cat-blue", shape: "vial", fill: 0.5, d: "", created: "", createdAt: 0, updatedAt: 0,
  foreign: { categories: [], tags: [], links: [], pinned: false, iconColor: "blue", extra: { form: "true" } },
};
const blankNote = (): Note => ({ id: "s1", t: "", c: "", cat: "--cat-blue", shape: "vial", fill: 0.2, d: "", created: "", createdAt: 0, updatedAt: 0 });

describe("phone form session", () => {
  const s = startSession(form, "s1", new Date(2026, 10, 12));
  const ids = s.fields.map((f) => f.id);

  it("finds the phone's forms", () => {
    expect(formsIn([blankNote(), form]).map((n) => n.id)).toEqual(["form-1"]);
  });

  it("starts from the form: dated title, 9 fields, no charm", () => {
    expect(s.base.split("\n")[0]).toBe("Daily Review — Thu 12 Nov");
    expect(s.fields).toHaveLength(9);
    expect(s.base).not.toContain("pensieve:charm");
  });

  it("editing an answer REPLACES it (the body is rebuilt, never appended twice)", () => {
    const once = sessionMarkdown(s, { [ids[2]]: { text: "first try" } });
    const twice = sessionMarkdown(s, { [ids[2]]: { text: "Yes — held the frame." } });
    expect(once).toContain("first try");
    expect(twice).not.toContain("first try");
    expect(answerText(parseForm(twice).fields[2])).toBe("Yes — held the frame.");
  });

  it("typed lines take the shape the form asked for (bullets / numbers)", () => {
    expect(answerShape(s.fields[4])).toBe("bullets");
    expect(answerShape(s.fields[5])).toBe("numbers");
    const md = sessionMarkdown(s, { [ids[4]]: { text: "Helped Tom\nCalled mum" }, [ids[5]]: { text: "Gym\nNo sugar" } });
    const f = parseForm(md).fields;
    expect(f[4].text).toEqual(["* Helped Tom", "* Called mum"]);
    expect(f[5].text).toEqual(["1. Gym", "2. No sugar"]);
  });

  it("rating + ticks land in the memory", () => {
    const md = sessionMarkdown(s, { [ids[0]]: { scale: 4 }, [ids[1]]: { checks: ["Hour of Power"] } });
    const f = parseForm(md).fields;
    expect(f[0].scale?.value).toBe(4);
    expect(f[1].items?.[0].checked).toBe(true);
  });

  it("keeps the recording (and photos) at the bottom across rebuilds", () => {
    const note = blankNote();
    applySession(note, s, {});
    note.c += "\n\n```pensieve:audio\nmedia/s1/take.wav\n```"; // what the voice engine appends
    applySession(note, s, { [ids[2]]: { text: "Yes." } });
    expect(note.t).toBe("Daily Review — Thu 12 Nov");
    expect(mediaBlocksOf(note.c)).toHaveLength(1);
    expect(note.c.trimEnd().endsWith("```")).toBe(true);
    expect(note.c.indexOf("Yes.")).toBeLessThan(note.c.indexOf("pensieve:audio"));
    expect(sessionHasContent(note, {})).toBe(true);
    expect(sessionHasContent(blankNote(), {})).toBe(false);
  });

  it("Done marks it awaiting the desktop, from this form — and it syncs that way", () => {
    const note = blankNote();
    applySession(note, s, { [ids[0]]: { scale: 3 } });
    finishSession(note, s);
    expect(isAwaitingProcessing(note.foreign?.extra)).toBe(true);
    expect(fromFormId(note.foreign?.extra)).toBe("form-1");
    const fm = parseFrontmatter(noteToRemoteContent(note)).fields;
    expect(fm.extra).toEqual({ fromForm: "form-1", formStatus: "awaiting" });
  });
});

describe("reel preview of a form memory", () => {
  it("shows the rating as its meaning and hides charm/code", async () => {
    const { stripMediaForPreview } = await import("../media/noteMedia");
    const s = startSession(form, "s1", new Date(2026, 10, 12));
    const md = sessionMarkdown(s, { [s.fields[0].id]: { scale: 4 } });
    const out = stripMediaForPreview(md + "\n\n```pensieve:charm\nname: X\ny\n```");
    expect(out).toContain("4 · Mini high");
    expect(out).not.toContain("```");
  });
});
