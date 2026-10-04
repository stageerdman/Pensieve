import { describe, it, expect } from "vitest";
import { parseFrontmatter, composeFrontmatter } from "./frontmatter";
import type { NoteFields } from "../types";

describe("frontmatter", () => {
  it("returns empty defaults and the raw body when there is no frontmatter", () => {
    const { fields, body } = parseFrontmatter("# Just a note\n\nhello");
    expect(fields).toEqual({ category: undefined, tags: [], links: [] });
    expect(body).toBe("# Just a note\n\nhello");
  });

  it("parses category, tags and links", () => {
    const raw = "---\ncategory: In my mind\ntags: [goals, health]\nlinks: [a1, b2]\n---\n\n# Body\n";
    const { fields, body } = parseFrontmatter(raw);
    expect(fields.category).toBe("In my mind");
    expect(fields.tags).toEqual(["goals", "health"]);
    expect(fields.links).toEqual(["a1", "b2"]);
    expect(body).toBe("# Body\n");
  });

  it("ignores an unknown category value (treats as unset)", () => {
    const { fields } = parseFrontmatter("---\ncategory: Nonsense\n---\nx");
    expect(fields.category).toBeUndefined();
  });

  it("writes no frontmatter block when there is no metadata", () => {
    const empty: NoteFields = { category: undefined, tags: [], links: [] };
    expect(composeFrontmatter(empty, "# plain\n")).toBe("# plain\n");
  });

  it("round-trips fields through compose -> parse", () => {
    const fields: NoteFields = { category: "Execution", tags: ["x", "y"], links: ["id1"] };
    const body = "# Title\n\nsome body\n";
    const file = composeFrontmatter(fields, body);
    const parsed = parseFrontmatter(file);
    expect(parsed.fields).toEqual(fields);
    expect(parsed.body).toBe(body);
  });

  it("handles empty tag/link lists on round-trip", () => {
    const fields: NoteFields = { category: "Notes & Lessons", tags: [], links: [] };
    const parsed = parseFrontmatter(composeFrontmatter(fields, "body"));
    expect(parsed.fields.category).toBe("Notes & Lessons");
    expect(parsed.fields.tags).toEqual([]);
    expect(parsed.fields.links).toEqual([]);
  });
});
