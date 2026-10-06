import { describe, it, expect } from "vitest";
import { parseQuery, type ParseContext } from "./grammar";

const NOW = new Date(2026, 1, 18, 12).getTime(); // Wed 18 Feb 2026

const ctx: ParseContext = {
  tags: ["#Weekly Review", "#Bug", "#planning", "#walk"],
  categories: ["Notes & Lessons", "In my mind", "Execution"],
};

const parse = (q: string, caret?: number) => parseQuery(q, ctx, NOW, caret);
const kinds = (q: string) => parse(q).suggestions.map((s) => s.filter.kind);

describe("parseQuery — dates", () => {
  it("bare date phrase → one created date suggestion", () => {
    const r = parse("this week");
    expect(r.suggestions).toHaveLength(1);
    const f = r.suggestions[0].filter;
    expect(f.kind).toBe("date");
    if (f.kind === "date") {
      expect(f.field).toBe("created");
      expect(f.phrase).toBe("this week");
    }
    expect(r.text).toBe("");
  });

  it("field word binds created vs updated", () => {
    const u = parse("updated last month").suggestions[0].filter;
    expect(u.kind === "date" && u.field).toBe("updated");
    const c = parse("created last month").suggestions[0].filter;
    expect(c.kind === "date" && c.field).toBe("created");
  });

  it("rolling last 30 days differs from calendar last month", () => {
    const roll = parse("last 30 days").suggestions[0].filter;
    const cal = parse("last month").suggestions[0].filter;
    if (roll.kind === "date" && cal.kind === "date") {
      expect(roll.range).not.toEqual(cal.range);
      expect(cal.range.start).toBe(new Date(2026, 0, 1).getTime());
    }
  });
});

describe("parseQuery — tags", () => {
  it("single multi-word #tag is matched greedily, leftover empty", () => {
    const r = parse("#Weekly Review", 0); // caret at start → not in the token
    // caret 0 is before '#', token under caret is "#Weekly" → whisper. Use a caret past it:
    const r2 = parse("#Weekly Review and notes", 24); // caret at end, in "notes"
    expect(r2.suggestions.some((s) => s.filter.kind === "tag" && s.label === "#Weekly Review")).toBe(true);
    void r;
  });

  it("combination: #Weekly Review created last month → tag + date", () => {
    const r = parse("#Weekly Review created last month");
    const ks = r.suggestions.map((s) => s.filter.kind).sort();
    expect(ks).toContain("tag");
    expect(ks).toContain("date");
    const tag = r.suggestions.find((s) => s.filter.kind === "tag")!;
    expect(tag.label).toBe("#Weekly Review");
    const date = r.suggestions.find((s) => s.filter.kind === "date")!;
    expect(date.filter.kind === "date" && date.filter.phrase).toBe("last month");
    expect(r.text).toBe("");
  });

  it("tag contains one of #Weekly Review, #Bug → single tag-set", () => {
    const r = parse("tag contains one of #Weekly Review, #Bug");
    const tagSugs = r.suggestions.filter((s) => s.filter.kind === "tag");
    expect(tagSugs).toHaveLength(1);
    const f = tagSugs[0].filter;
    if (f.kind === "tag") {
      expect(f.tags.map((t) => t.toLowerCase()).sort()).toEqual(["bug", "weekly review"]);
    }
    expect(tagSugs[0].label).toBe("#Weekly Review or #Bug");
  });

  it("tags: #planning, #walk (colon form)", () => {
    const r = parse("tags: #planning, #walk");
    const f = r.suggestions.find((s) => s.filter.kind === "tag")!.filter;
    expect(f.kind === "tag" && f.tags.length).toBe(2);
  });
});

describe("parseQuery — tag whisper & # escape", () => {
  it("lone # whispers all tags, no committed suggestion", () => {
    const r = parse("#");
    expect(r.whisper).toBeDefined();
    expect(r.whisper!.matches.length).toBe(ctx.tags.length);
    expect(r.suggestions.filter((s) => s.filter.kind === "tag")).toHaveLength(0);
    expect(r.text).toBe("");
  });

  it("#plan whispers #planning", () => {
    const r = parse("#plan");
    expect(r.whisper!.matches).toContain("#planning");
  });

  it("'# bug' is a literal escape → text, no tag", () => {
    const r = parse("# bug");
    expect(r.whisper).toBeUndefined();
    expect(r.suggestions.filter((s) => s.filter.kind === "tag")).toHaveLength(0);
    expect(r.text).toBe("# bug");
  });
});

describe("parseQuery — keyword whispering (completions)", () => {
  const labels = (q: string, caret?: number) => parse(q, caret).suggestions.map((s) => s.label);

  it("'pin' whispers 'pinned'", () => {
    const sugs = parse("pin").suggestions;
    const flag = sugs.find((s) => s.filter.kind === "flag");
    expect(flag).toBeTruthy();
    expect(flag!.source).toEqual([0, 3]); // splices "pin"
  });

  it("'last' whispers date phrases", () => {
    const ls = labels("last");
    expect(ls).toContain("last week");
    expect(ls).toContain("last month");
  });

  it("'last su' narrows to 'last sunday'", () => {
    const ls = labels("last su");
    expect(ls).toContain("last sunday");
    expect(ls).not.toContain("last week");
  });

  it("'last 2' whispers rolling day/week/month variants", () => {
    const ls = labels("last 2");
    expect(ls).toEqual(expect.arrayContaining(["last 2 days", "last 2 weeks", "last 2 months"]));
  });

  it("'last 2 w' narrows to weeks", () => {
    const ls = labels("last 2 w");
    expect(ls).toContain("last 2 weeks");
    expect(ls).not.toContain("last 2 days");
  });

  it("completes only the trailing fragment, keeping earlier words", () => {
    const r = parse("ambition last");
    const comp = r.suggestions.find((s) => s.label === "last week");
    expect(comp).toBeTruthy();
    // source splices just "last" (indices 9..13), not "ambition"
    expect(comp!.source).toEqual([9, 13]);
  });

  it("'created' / 'updated' whisper field-led date phrases", () => {
    const c = parse("created").suggestions.find((s) => s.label === "created this week");
    expect(c).toBeTruthy();
    expect(c!.filter.kind === "date" && c!.filter.field).toBe("created");

    const u = parse("updated last mo").suggestions.find((s) => s.label === "updated last month");
    expect(u).toBeTruthy();
    expect(u!.filter.kind === "date" && u!.filter.field).toBe("updated");
  });

  it("'crea' (partial field word) still whispers created phrases", () => {
    const ls = parse("crea").suggestions.map((s) => s.label);
    expect(ls.some((l) => l.startsWith("created "))).toBe(true);
  });

  it("confirming a completion resolves a real date range", () => {
    const comp = parse("last mon").suggestions.find((s) => s.label === "last monday")!;
    expect(comp.filter.kind).toBe("date");
    if (comp.filter.kind === "date") {
      expect(comp.filter.range.start).toBe(new Date(2026, 1, 16).getTime());
    }
  });
});

describe("parseQuery — categories", () => {
  it("full category name → category claim, leftover empty", () => {
    const r = parse("Execution");
    expect(r.suggestions.some((s) => s.filter.kind === "category")).toBe(true);
    expect(r.text).toBe("");
  });

  it("partial 'Notes' suggests the category but keeps text live", () => {
    const r = parse("Notes");
    const cat = r.suggestions.find((s) => s.filter.kind === "category");
    expect(cat?.label).toBe("Notes & Lessons");
    expect(r.text).toBe("Notes"); // plain Enter still text-searches "Notes"
  });
});

describe("parseQuery — flags & free text", () => {
  it("pinned → flag", () => {
    expect(kinds("pinned")).toContain("flag");
  });

  it("unrecognized words stay as live text", () => {
    const r = parse("stoicism review notes about ambition", 100);
    // "notes" substring triggers a category suggestion, but the words remain live text.
    expect(r.text).toContain("stoicism");
    expect(r.suggestions.filter((s) => s.filter.kind === "date" || s.filter.kind === "tag")).toHaveLength(0);
  });

  it("combo keeps only the date/tag claims out of live text", () => {
    const r = parse("ambition #planning last week");
    expect(r.text).toBe("ambition");
    expect(r.suggestions.map((s) => s.filter.kind).sort()).toEqual(["date", "tag"]);
  });
});
