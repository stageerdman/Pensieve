import { describe, expect, it } from "vitest";
import {
  composeFrontmatter,
  desktopColorHue,
  desktopShapeToPhone,
  joinTitleAndBody,
  labelFromEpoch,
  nearestPhoneCat,
  noteFromRemoteContent,
  noteToRemoteContent,
  parseFrontmatter,
  phoneCatToDesktopColor,
  phoneShapeToDesktop,
  splitTitleAndBody,
} from "./noteFormat";
import type { Note } from "../../types";

describe("parseFrontmatter / composeFrontmatter", () => {
  it("round-trips categories/tags/links/icon", () => {
    const raw = [
      "---",
      "categories: [Notes & Lessons, In my mind]",
      "tags: [goals, health]",
      "links: [mut123-abc]",
      "icon: vial/blue/80/30",
      "---",
      "",
      "Hello\n\nBody text",
    ].join("\n");
    const { fields, body } = parseFrontmatter(raw);
    expect(fields.categories).toEqual(["Notes & Lessons", "In my mind"]);
    expect(fields.tags).toEqual(["goals", "health"]);
    expect(fields.links).toEqual(["mut123-abc"]);
    expect(fields.icon).toEqual({ shape: "vial", color: "blue", vibrancy: 0.8, shine: 0.3 });
    expect(body).toBe("Hello\n\nBody text");
    expect(composeFrontmatter(fields, body)).toBe(raw);
  });

  it("a plain note (no metadata) has no frontmatter block", () => {
    const body = "Just a thought.";
    expect(composeFrontmatter({ categories: [], tags: [], links: [] }, body)).toBe(body);
  });

  it("a raw hue icon encodes as h<n> and parses back to a number", () => {
    const fields = { categories: [], tags: [], links: [], icon: { shape: "beaker", color: 212 } };
    const raw = composeFrontmatter(fields, "Body");
    expect(raw).toContain("icon: beaker/h212");
    expect(parseFrontmatter(raw).fields.icon).toEqual({ shape: "beaker", color: 212 });
  });
});

describe("splitTitleAndBody / joinTitleAndBody", () => {
  it("splits a plain first line as the title", () => {
    expect(splitTitleAndBody("My title\n\nThe rest of it.")).toEqual({
      title: "My title",
      body: "The rest of it.",
    });
  });

  it("strips a markdown heading mark from the title", () => {
    expect(splitTitleAndBody("# My title\nBody line.")).toEqual({ title: "My title", body: "Body line." });
  });

  it("skips a lone image line when hunting for the title", () => {
    const { title, body } = splitTitleAndBody("![alt](media/n/x.png)\nReal title\nBody.");
    expect(title).toBe("Real title");
    expect(body).toBe("![alt](media/n/x.png)\nBody.");
  });

  it("a title-less (media-only) note has an empty title", () => {
    expect(splitTitleAndBody("![alt](media/n/x.png)")).toEqual({ title: "", body: "![alt](media/n/x.png)" });
  });

  it("joinTitleAndBody is the inverse for the common cases", () => {
    expect(joinTitleAndBody("My title", "The rest.")).toBe("My title\n\nThe rest.");
    expect(joinTitleAndBody("My title", "")).toBe("My title");
    expect(joinTitleAndBody("", "Just body.")).toBe("Just body.");
  });
});

describe("category/icon mapping", () => {
  it("shared colour names map straight through both ways", () => {
    expect(nearestPhoneCat(desktopColorHue("blue"))).toBe("--cat-blue");
    expect(phoneCatToDesktopColor("--cat-blue")).toBe("blue");
  });

  it("phone's gold (no desktop key) rides as a lossless raw hue", () => {
    const hue = phoneCatToDesktopColor("--cat-gold");
    expect(typeof hue).toBe("number");
    expect(nearestPhoneCat(desktopColorHue(hue as number))).toBe("--cat-gold");
  });

  it("a desktop-only key (gray/brown) renders as the nearest phone token", () => {
    expect(nearestPhoneCat(desktopColorHue("gray"))).toBe("--cat-blue"); // 220 vs 212
    expect(nearestPhoneCat(desktopColorHue("brown"))).toBe("--cat-orange"); // 25 vs 24
  });

  it("shape names round-trip for the two renamed shapes", () => {
    expect(desktopShapeToPhone("round-bottom")).toBe("round");
    expect(phoneShapeToDesktop("round")).toBe("round-bottom");
    expect(desktopShapeToPhone("potion-bottle")).toBe("potion");
    expect(phoneShapeToDesktop("potion")).toBe("potion-bottle");
  });

  it("an unknown desktop shape falls back to vial rather than throwing", () => {
    expect(desktopShapeToPhone("some-future-shape")).toBe("vial");
  });
});

describe("labelFromEpoch", () => {
  const now = new Date("2026-10-24T12:00:00Z").getTime();
  it("buckets recent/today/yesterday/week/older", () => {
    expect(labelFromEpoch(now - 30_000, now)).toBe("Just now");
    expect(labelFromEpoch(now - 5 * 60_000, now)).toBe("5m ago");
    expect(labelFromEpoch(now - 3 * 3_600_000, now)).toBe("Today");
    expect(labelFromEpoch(now - 26 * 3_600_000, now)).toBe("Yesterday");
    expect(labelFromEpoch(now - 60 * 86_400_000, now)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe("Note <-> remote content", () => {
  const BASE: Note = {
    id: "abc123",
    t: "A title",
    c: "Some body text.",
    cat: "--cat-blue",
    shape: "vial",
    fill: 0.5,
    d: "Today",
    created: "Today",
    createdAt: 1_000,
    updatedAt: 2_000,
  };

  it("every phone note carries its flask icon in frontmatter (the Wand has no 'no icon' state)", () => {
    const content = noteToRemoteContent(BASE);
    expect(content).toContain("icon: vial/blue");
    expect(content.endsWith("A title\n\nSome body text.")).toBe(true);
  });

  it("pulling that content back reconstructs title/body/icon", () => {
    const content = noteToRemoteContent(BASE);
    const pulled = noteFromRemoteContent("abc123", content, { createdAt: 1_000, updatedAt: 2_000 });
    expect(pulled.t).toBe("A title");
    expect(pulled.c).toBe("Some body text.");
    expect(pulled.shape).toBe("vial");
  });

  it("desktop-only metadata (categories/tags/links/pinned) survives an untouched round-trip", () => {
    const withForeign: Note = {
      ...BASE,
      foreign: { categories: ["Work"], tags: ["focus"], links: ["other-id"], pinned: true, iconColor: "purple" },
    };
    const content = noteToRemoteContent(withForeign);
    expect(content).toContain("categories: [Work]");
    expect(content).toContain("icon: vial/purple");

    // Re-pull onto the SAME existing note (as a real sync would) — pinned (which has
    // no frontmatter home) must survive because it's merged from `existing`.
    const pulled = noteFromRemoteContent("abc123", content, {}, withForeign);
    expect(pulled.foreign?.categories).toEqual(["Work"]);
    expect(pulled.foreign?.tags).toEqual(["focus"]);
    expect(pulled.foreign?.links).toEqual(["other-id"]);
    expect(pulled.foreign?.pinned).toBe(true);
    expect(pulled.cat).toBe("--cat-purple");
  });

  it("a note's own `created` label never changes on a re-pull (desktop addedAt semantics)", () => {
    const pulled1 = noteFromRemoteContent("x", "Title\n\nBody", { createdAt: 1_000, updatedAt: 1_000 });
    const pulled2 = noteFromRemoteContent("x", "Title\n\nEdited body", { updatedAt: 5_000 }, pulled1);
    expect(pulled2.created).toBe(pulled1.created);
    expect(pulled2.c).toBe("Edited body");
  });
});
