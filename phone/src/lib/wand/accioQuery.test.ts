import { describe, it, expect } from "vitest";
import { parseQuery, dayBucket, passesDate, passesText } from "./accioQuery";

describe("dayBucket", () => {
  it("classifies today-ish labels", () => {
    expect(dayBucket("Just now")).toBe("today");
    expect(dayBucket("Today")).toBe("today");
    expect(dayBucket("2m ago")).toBe("today");
  });
  it("classifies yesterday", () => {
    expect(dayBucket("Yesterday")).toBe("yesterday");
  });
  it("classifies a weekday label as week", () => {
    expect(dayBucket("Mon")).toBe("week");
    expect(dayBucket("Friday")).toBe("week");
  });
  it("falls back to older", () => {
    expect(dayBucket("Jan 3")).toBe("older");
    expect(dayBucket(undefined)).toBe("older");
  });
});

describe("parseQuery", () => {
  it("strips date tokens out of the text", () => {
    expect(parseQuery("lighthouse yesterday")).toEqual({ text: "lighthouse", dates: ["yesterday"] });
  });
  it("recognizes today/week/recent", () => {
    expect(parseQuery("today").dates).toEqual(["today"]);
    expect(parseQuery("last week").dates).toEqual(["week"]);
    expect(parseQuery("recent").dates).toEqual(["recent"]);
    expect(parseQuery("recently").dates).toEqual(["recent"]);
  });
  it("is just text when there are no date tokens", () => {
    expect(parseQuery("hello world")).toEqual({ text: "hello world", dates: [] });
  });
  it("handles empty/undefined", () => {
    expect(parseQuery("")).toEqual({ text: "", dates: [] });
    expect(parseQuery(undefined)).toEqual({ text: "", dates: [] });
  });
});

describe("passesDate", () => {
  it("passes everything when no date tokens requested", () => {
    expect(passesDate({ created: "Jan 3" }, [])).toBe(true);
  });
  it("matches the created-date bucket", () => {
    expect(passesDate({ created: "Today" }, ["today"])).toBe(true);
    expect(passesDate({ created: "Yesterday" }, ["today"])).toBe(false);
  });
  it("'week' covers today/yesterday/week buckets", () => {
    expect(passesDate({ created: "Today" }, ["week"])).toBe(true);
    expect(passesDate({ created: "Yesterday" }, ["week"])).toBe(true);
    expect(passesDate({ created: "Mon" }, ["week"])).toBe(true);
    expect(passesDate({ created: "Jan 3" }, ["week"])).toBe(false);
  });
  it("'recent' checks openedOrder by id, not the date bucket", () => {
    expect(passesDate({ id: 7, created: "Jan 3" }, ["recent"], [3, 7])).toBe(true);
    expect(passesDate({ id: 9, created: "Today" }, ["recent"], [3, 7])).toBe(false);
  });
  it("falls back to `.d` when `.created` is absent", () => {
    expect(passesDate({ d: "Today" }, ["today"])).toBe(true);
  });
});

describe("passesText", () => {
  it("passes everything when text is empty", () => {
    expect(passesText({ t: "Title", c: "body" }, "")).toBe(true);
  });
  it("matches title or body, case-insensitively", () => {
    expect(passesText({ t: "Lighthouse plan", c: "" }, "lighthouse")).toBe(true);
    expect(passesText({ t: "", c: "mentions a Lighthouse" }, "lighthouse")).toBe(true);
    expect(passesText({ t: "Nope", c: "nothing" }, "lighthouse")).toBe(false);
  });
});
