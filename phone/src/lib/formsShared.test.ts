// The phone shares the desktop's pure forms module (src/lib/forms — no duplicate), and its
// own note-body parser must carry a form memory byte-for-byte (scale/charm fences included),
// or a phone edit would corrupt a form.
import { describe, expect, it } from "vitest";
import { instantiate, parseForm } from "../../../src/lib/forms";
import { DAILY_REVIEW } from "../../../src/lib/forms/dailyReview.fixture";
import { parseNoteContent, serializeBlocks } from "./media/noteMedia";

describe("phone ↔ shared forms module", () => {
  it("imports and parses the Daily Review", () => {
    expect(parseForm(DAILY_REVIEW).fields).toHaveLength(9);
  });

  it("a form memory and a template round-trip through the phone body parser unchanged", () => {
    for (const md of [DAILY_REVIEW, instantiate(DAILY_REVIEW)]) {
      expect(serializeBlocks(parseNoteContent(md))).toBe(md);
    }
  });
});
