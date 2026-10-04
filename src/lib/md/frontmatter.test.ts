import { describe, it, expect } from "vitest";
import { parseFrontmatter, composeFrontmatter } from "./frontmatter";
import type { NoteFields } from "../types";

describe("frontmatter", () => {
  it("returns empty defaults and the raw body when there is no frontmatter", () => {
    const { fields, body } = parseFrontmatter("# Just a note\n\nhello");
    expect(fields).toEqual({ categories: [], tags: [], links: [] });
    expect(body).toBe("# Just a note\n\nhello");
  });

  it("parses categories (multi), tags and links", () => {
    const raw = "---\ncategories: [In my mind, Execution]\ntags: [goals, health]\nlinks: [a1, b2]\n---\n\n# Body\n";
    const { fields, body } = parseFrontmatter(raw);
    expect(fields.categories).toEqual(["In my mind", "Execution"]);
    expect(fields.tags).toEqual(["goals", "health"]);
    expect(fields.links).toEqual(["a1", "b2"]);
    expect(body).toBe("# Body\n");
  });

  it("migrates a legacy single `category` to the categories list", () => {
    const { fields } = parseFrontmatter("---\ncategory: In my mind\n---\nx");
    expect(fields.categories).toEqual(["In my mind"]);
  });

  it("keeps any category name (categories are user-defined, not a fixed set)", () => {
    const { fields } = parseFrontmatter("---\ncategories: [health, Execution]\n---\nx");
    expect(fields.categories).toEqual(["health", "Execution"]);
  });

  it("writes no frontmatter block when there is no metadata", () => {
    const empty: NoteFields = { categories: [], tags: [], links: [] };
    expect(composeFrontmatter(empty, "# plain\n")).toBe("# plain\n");
  });

  it("round-trips fields through compose -> parse", () => {
    const fields: NoteFields = { categories: ["Execution", "In my mind"], tags: ["x", "y"], links: ["id1"] };
    const body = "# Title\n\nsome body\n";
    const parsed = parseFrontmatter(composeFrontmatter(fields, body));
    expect(parsed.fields).toEqual(fields);
    expect(parsed.body).toBe(body);
  });

  it("handles empty tag/link lists on round-trip", () => {
    const fields: NoteFields = { categories: ["Notes & Lessons"], tags: [], links: [] };
    const parsed = parseFrontmatter(composeFrontmatter(fields, "body"));
    expect(parsed.fields.categories).toEqual(["Notes & Lessons"]);
    expect(parsed.fields.tags).toEqual([]);
    expect(parsed.fields.links).toEqual([]);
  });
});
