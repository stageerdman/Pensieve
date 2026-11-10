import { describe, it, expect } from "vitest";
import { parseDescribeResponse, PROMPT_TEMPLATE } from "./describePageTauri";

describe("PROMPT_TEMPLATE — spec lock for the owner's two explicit requirements", () => {
  const prompt = PROMPT_TEMPLATE("/vault/media/raw1/a.jpg");

  it("tells the model to guess + flag illegible words rather than skip them", () => {
    expect(prompt).toMatch(/never skip a word/i);
    expect(prompt).toMatch(/\{guess\}/);
  });

  it("tells the model to standardize the date and use a YYYY placeholder when no year is shown", () => {
    expect(prompt).toMatch(/full English month name/i);
    expect(prompt).toMatch(/"YYYY"/);
    expect(prompt).toMatch(/do not guess a year yourself/i);
  });

  it("tells the model to split a shared boundary page's text at the new date header, not duplicate the whole page into both days", () => {
    expect(prompt).toMatch(/split your transcription/i);
    expect(prompt).toMatch(/"previousPart"/);
  });

  it("tells the model to give a short title and explicitly NEVER use the date as one — the owner's exact complaint", () => {
    expect(prompt).toMatch(/short TITLE/);
    expect(prompt).toMatch(/must NEVER be the date/i);
    expect(prompt).toMatch(/"title"/);
  });
});

describe("parseDescribeResponse", () => {
  it("parses a clean JSON reply", () => {
    const raw = `{"transcript": "Had a quiet morning.", "dateHeader": "Nov 3", "continuesPrevious": false}`;
    expect(parseDescribeResponse(raw)).toEqual({
      transcript: "Had a quiet morning.",
      dateHeader: "Nov 3",
      continuesPrevious: false,
    });
  });

  it("strips a markdown fence the model added anyway", () => {
    const raw = '```json\n{"transcript": "x", "dateHeader": null, "continuesPrevious": false}\n```';
    expect(parseDescribeResponse(raw).transcript).toBe("x");
    expect(parseDescribeResponse(raw).dateHeader).toBeNull();
  });

  it("extracts the JSON object even with leading/trailing prose", () => {
    const raw = 'Sure, here is the result:\n{"transcript": "y", "dateHeader": "Dec 1"}\nLet me know if you need anything else.';
    expect(parseDescribeResponse(raw)).toEqual({ transcript: "y", dateHeader: "Dec 1", continuesPrevious: false });
  });

  it("an empty-string dateHeader normalises to null, not an empty label", () => {
    const raw = `{"transcript": "z", "dateHeader": ""}`;
    expect(parseDescribeResponse(raw).dateHeader).toBeNull();
  });

  it("degrades to a blank page rather than throwing on unparseable junk", () => {
    expect(parseDescribeResponse("not json at all")).toEqual({ transcript: "", dateHeader: null });
    expect(parseDescribeResponse("")).toEqual({ transcript: "", dateHeader: null });
  });

  it("non-string transcript/dateHeader fields degrade safely instead of propagating junk types", () => {
    const raw = `{"transcript": 42, "dateHeader": 7}`;
    expect(parseDescribeResponse(raw)).toEqual({ transcript: "", dateHeader: null, continuesPrevious: false });
  });

  it("parses previousPart when the page is a shared date boundary", () => {
    const raw = `{"transcript": "Day two begins.", "dateHeader": "Nov 4", "continuesPrevious": true, "previousPart": "Tail of day one."}`;
    expect(parseDescribeResponse(raw)).toEqual({
      transcript: "Day two begins.",
      dateHeader: "Nov 4",
      continuesPrevious: true,
      previousPart: "Tail of day one.",
    });
  });

  it("a null/absent previousPart stays undefined, never an empty string someone could mistake for real content", () => {
    const raw = `{"transcript": "x", "dateHeader": "Nov 1", "continuesPrevious": false, "previousPart": null}`;
    expect(parseDescribeResponse(raw).previousPart).toBeUndefined();
  });

  it("parses the title field, trimmed", () => {
    const raw = `{"transcript": "x", "dateHeader": "Nov 1", "continuesPrevious": false, "title": "  A Walk by the River  "}`;
    expect(parseDescribeResponse(raw).title).toBe("A Walk by the River");
  });

  it("a blank/missing title stays undefined, never an empty string that would silently win over the fallback heuristic", () => {
    expect(parseDescribeResponse(`{"transcript": "x", "dateHeader": "Nov 1", "title": ""}`).title).toBeUndefined();
    expect(parseDescribeResponse(`{"transcript": "x", "dateHeader": "Nov 1"}`).title).toBeUndefined();
  });
});
