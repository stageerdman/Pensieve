import { describe, expect, it } from "vitest";
import {
  answerText,
  applyAnswers,
  encodeCharm,
  encodeScale,
  fromFormId,
  instantiate,
  isAwaitingProcessing,
  isFormTemplate,
  parseCharm,
  parseForm,
  parseScale,
  withExtra,
  memoryFromForm,
} from "./index";
import { DAILY_REVIEW } from "./dailyReview.fixture";

describe("forms meta", () => {
  it("reads and writes the three keys, collapsing to undefined when empty", () => {
    let x = withExtra(undefined, "form", "true");
    expect(isFormTemplate(x)).toBe(true);
    x = withExtra(x, "formStatus", "awaiting");
    expect(isAwaitingProcessing(x)).toBe(true);
    x = withExtra(withExtra(x, "form", undefined), "formStatus", undefined);
    expect(x).toBeUndefined();
    expect(fromFormId({ fromForm: " abc " })).toBe("abc");
  });
});

describe("fence codecs", () => {
  it("scale round-trips with and without a value", () => {
    const s = parseScale("value: 4\n1: a\n2: b\n3: c\n4: d\n5: e");
    expect(s).toEqual({ anchors: ["a", "b", "c", "d", "e"], value: 4 });
    expect(parseScale(encodeScale(s))).toEqual(s);
    expect(parseScale("1: a\n2: b")).toEqual({ anchors: ["a", "b"] });
  });
  it("drops an out-of-range value", () => {
    expect(parseScale("value: 9\n1: a\n2: b").value).toBeUndefined();
  });
  it("charm round-trips name + multi-line prompt", () => {
    const c = { name: "Compress", prompt: "Line one\n\nLine two" };
    expect(parseCharm(encodeCharm(c))).toEqual(c);
  });
});

describe("parseForm — the owner's Daily Review", () => {
  const form = parseForm(DAILY_REVIEW);

  it("finds the title, all 9 fields and the charm", () => {
    expect(form.title).toBe("Daily Review");
    expect(form.fields.map((f) => f.kind)).toEqual([
      "scale",
      "checklist",
      "question",
      "question",
      "question",
      "question",
      "question",
      "checklist",
      "question",
    ]);
    expect(form.charms).toHaveLength(1);
    expect(form.charms[0].name).toBe("Compress");
  });

  it("reads the scale's 5 anchors and the checklist items", () => {
    expect(form.fields[0].scale?.anchors).toHaveLength(5);
    expect(form.fields[0].scale?.anchors[3]).toMatch(/^Mini high/);
    expect(form.fields[1].items?.map((i) => i.label)[0]).toBe("Hour of Power");
    expect(form.fields[7].items).toHaveLength(3);
  });

  it("treats 'Traits:' / 'Questions:' lines as guidance, not as new questions", () => {
    const mng = form.fields[8];
    expect(mng.question).toBe("Mr Nice Guy Fights");
    expect(mng.text).toHaveLength(2);
  });

  it("gives every field a unique, stable id", () => {
    const ids = form.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[2]).toBe("was-i-a-king-what-can-i-do-next-time-to-be-more");
    expect(parseForm(DAILY_REVIEW).fields.map((f) => f.id)).toEqual(ids);
  });

  it("dedupes repeated questions", () => {
    const f = parseForm("T\n\n**Why?**\n\n**Why?**");
    expect(f.fields.map((x) => x.id)).toEqual(["why", "why-2"]);
  });

  it("ignores bold/heading lookalikes inside code fences", () => {
    const f = parseForm("T\n\n```\n**not a question**\n```\n\n**Real?**");
    expect(f.fields.map((x) => x.question)).toEqual(["Real?"]);
  });

  it("a plain note has no fields", () => {
    expect(parseForm("Just a thought\n\nwith *some* **bold** words").fields).toHaveLength(0);
  });
});

describe("instantiate", () => {
  it("copies the questions and leaves every charm out", () => {
    const memory = instantiate(DAILY_REVIEW);
    expect(memory).not.toContain("pensieve:charm");
    expect(memory).toContain("pensieve:scale");
    expect(parseForm(memory).fields).toHaveLength(9);
    expect(parseForm(memory).charms).toHaveLength(0);
    expect(memory.endsWith("\n")).toBe(false);
  });

  it("starts blank even if the form itself was rated/ticked", () => {
    const ids = parseForm(DAILY_REVIEW).fields.map((f) => f.id);
    const touched = applyAnswers(DAILY_REVIEW, { [ids[0]]: { scale: 3 }, [ids[1]]: { check: ["Hour of Power"] } });
    const f = parseForm(instantiate(touched)).fields;
    expect(f[0].scale?.value).toBeUndefined();
    expect(f[1].items?.every((i) => !i.checked)).toBe(true);
  });
});

describe("applyAnswers", () => {
  const memory = instantiate(DAILY_REVIEW);
  const ids = parseForm(memory).fields.map((f) => f.id);

  it("fills an empty question, rates an unrated scale, ticks named items", () => {
    const out = applyAnswers(memory, {
      [ids[0]]: { scale: 4 },
      [ids[1]]: { check: ["hour of power", "Conditioning. At least 30 minutes of repeating questions or frames."] },
      [ids[2]]: { text: "Mostly yes — I held the frame on the Novak call." },
    });
    const f = parseForm(out).fields;
    expect(f[0].scale?.value).toBe(4);
    expect(f[1].items?.map((i) => i.checked)).toEqual([true, false, false, true]);
    expect(answerText(f[2])).toBe("Mostly yes — I held the frame on the Novak call.");
    // Nothing else moved: still 9 fields, same ids.
    expect(f.map((x) => x.id)).toEqual(ids);
  });

  it("never overrides: a rated scale stays, a ticked box stays ticked, typed text stays first", () => {
    const owner = applyAnswers(memory, { [ids[0]]: { scale: 2 }, [ids[2]]: { text: "My own words." } });
    const ai = applyAnswers(owner, { [ids[0]]: { scale: 5 }, [ids[2]]: { text: "AI expansion." } });
    const f = parseForm(ai).fields;
    expect(f[0].scale?.value).toBe(2);
    expect(answerText(f[2])).toBe("My own words.\nAI expansion.");
    expect(ai).toContain("My own words.\n\nAI expansion.");
  });

  it("replaces an empty list starter instead of leaving a dangling bullet", () => {
    const out = applyAnswers(memory, { [ids[4]]: { text: "* Helped Tom see his own progress" } });
    const f = parseForm(out).fields[4];
    expect(f.text).toEqual(["* Helped Tom see his own progress"]);
  });

  it("keeps template guidance and separates it from the answer", () => {
    const tmpl = parseForm(memory).fields[8];
    const out = applyAnswers(memory, { [ids[8]]: { text: "Showed Assertive with the landlord." } });
    const f = parseForm(out).fields[8];
    expect(f.text.slice(0, 2)).toEqual(tmpl.text);
    expect(answerText(f, tmpl)).toBe("Showed Assertive with the landlord.");
  });

  it("keeps a blank line between an answer and the next question", () => {
    const out = applyAnswers(memory, { [ids[2]]: { text: "Yes." } });
    expect(out).toContain("Yes.\n\n**Freeform**");
  });

  it("ignores unknown ids and out-of-range ratings", () => {
    expect(applyAnswers(memory, { nope: { text: "x" }, [ids[0]]: { scale: 9 } })).toBe(memory);
  });
});

describe("memoryFromForm", () => {
  it("dates the title and keeps the questions", () => {
    const md = memoryFromForm(DAILY_REVIEW, new Date(2026, 10, 12));
    expect(md.split("\n")[0]).toBe("Daily Review — Thu 12 Nov");
    expect(parseForm(md).fields).toHaveLength(9);
    expect(parseForm(md).charms).toHaveLength(0);
  });
  it("keeps a heading mark on the title", () => {
    expect(memoryFromForm("# Weekly\n\n**Wins?**", new Date(2026, 10, 16)).split("\n")[0]).toBe("# Weekly — Mon 16 Nov");
  });
});
