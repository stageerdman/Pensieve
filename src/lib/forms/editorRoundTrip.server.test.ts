// @vitest-environment node
// A form must survive the desktop editor untouched: load → BlockNote → save gives back the
// same Markdown, so every field (bold questions, scale/charm fences, checklists, empty list
// starters) is still there. Real BlockNote converter, as in md/extended.server.test.ts.
import { describe, expect, it } from "vitest";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { blocksToExtendedMd, extendedMdToBlocks } from "../md/extended";
import { DAILY_REVIEW } from "./dailyReview.fixture";
import { applyAnswers, instantiate, parseForm } from "./index";

const editor = ServerBlockNoteEditor.create();
const roundTrip = async (md: string) => blocksToExtendedMd(editor, await extendedMdToBlocks(editor, md));

describe("forms through the desktop editor", () => {
  it("the Daily Review template round-trips byte-for-byte (bar the trailing newline)", async () => {
    expect((await roundTrip(DAILY_REVIEW)).trimEnd()).toBe(DAILY_REVIEW);
  });

  it("a filled memory keeps all 9 fields and its answers", async () => {
    const memory = instantiate(DAILY_REVIEW);
    const ids = parseForm(memory).fields.map((f) => f.id);
    const filled = applyAnswers(memory, {
      [ids[0]]: { scale: 4 },
      [ids[1]]: { check: ["Hour of Power"] },
      [ids[2]]: { text: "Yes — held the frame." },
      [ids[4]]: { text: "* Helped Tom\n* Called mum" },
    });
    const out = await roundTrip(filled);
    const f = parseForm(out).fields;
    expect(f.map((x) => x.id)).toEqual(ids);
    expect(f[0].scale?.value).toBe(4);
    expect(f[1].items?.[0].checked).toBe(true);
    expect(f[2].text).toEqual(["Yes — held the frame."]);
    expect(f[4].text).toEqual(["* Helped Tom", "* Called mum"]);
  });
});
