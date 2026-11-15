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

  it("loads the fences as real scale/patronus blocks (not code blocks)", async () => {
    const blocks = (await extendedMdToBlocks(editor, DAILY_REVIEW)) as { type: string; props: Record<string, unknown> }[];
    const scale = blocks.find((b) => b.type === "scale");
    const spell = blocks.find((b) => b.type === "patronus");
    expect(JSON.parse(String(scale?.props.anchors))).toHaveLength(5);
    expect(scale?.props.value).toBe(0);
    expect(spell?.props).toEqual({ spell: "compress", instruction: "Summarise what mattered across my recent Daily Reviews." });
    expect(blocks.some((b) => b.type === "codeBlock")).toBe(false);
  });

  it("a legacy charm fence opens as a Patronus Compress spell and saves as one", async () => {
    const legacy = "Weekly\n\n**How was it?**\n\n```pensieve:charm\nname: Compress\nShrink my week.\n```";
    const blocks = (await extendedMdToBlocks(editor, legacy)) as { type: string; props: Record<string, unknown> }[];
    expect(blocks.find((b) => b.type === "patronus")?.props).toEqual({ spell: "compress", instruction: "Shrink my week." });
    expect((await roundTrip(legacy)).trimEnd()).toBe(legacy.replace("pensieve:charm\nname: Compress", "pensieve:patronus\nspell: compress"));
  });
});

describe("the Patronus block through the desktop editor", () => {
  const FORM = DAILY_REVIEW + "\n\n```pensieve:patronus\nspell: sync\nI speak English. Fill only what I said.\n```";
  it("loads as a real patronus block and round-trips byte-for-byte", async () => {
    const blocks = (await extendedMdToBlocks(editor, FORM)) as { type: string; props: Record<string, unknown> }[];
    expect(blocks.find((b) => b.type === "patronus" && b.props.spell === "sync")?.props.instruction).toBe("I speak English. Fill only what I said.");
    expect((await roundTrip(FORM)).trimEnd()).toBe(FORM);
  });
  it("a memory made from the form leaves it out (it lives in the form + each phone package)", () => {
    expect(instantiate(FORM)).not.toContain("pensieve:patronus");
    expect(parseForm(instantiate(FORM)).fields.map((f) => f.id)).toEqual(parseForm(DAILY_REVIEW).fields.map((f) => f.id));
  });
});

describe("a compressed memory through the desktop editor (FORMS Phase 6)", () => {
  it("cited bullets keep their date chips (note links) and the field keeps its answer", async () => {
    const memory = instantiate(DAILY_REVIEW);
    const ids = parseForm(memory).fields.map((f) => f.id);
    const text = "* Closed the Novák deal {@daily-9|Mon 9 Nov}\n* Admitted my mistake {@daily-11|Wed 11 Nov} {@daily-13|Fri 13 Nov}";
    const out = await roundTrip(applyAnswers(memory, { [ids[2]]: { text } }));
    expect(parseForm(out).fields[2].text).toEqual(text.split("\n"));
  });
});
