import { describe, it, expect } from "vitest";
import { parseDescribeResponse } from "./describePageTauri";

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
});
