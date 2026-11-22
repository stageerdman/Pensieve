import { describe, expect, it, vi } from "vitest";
import { findNoteSpell } from "./block";
import { runNoteSpellJob } from "./job";
import { listNoteSpellsToRun } from "./queue";
import { AUDIO, DREAMS, VOICE, audioFence, fakeVault, note, scripted, spellFence } from "./fixtures";
import { parseNoteContent, serializeBlocks } from "../../../../phone/src/lib/media/noteMedia";

const BODY = `Morning\n\nWe talked about dreams.\n\n${audioFence(AUDIO)}\n\n${spellFence(DREAMS)}`;
const HINT = { patronus: "pending" };

const DREAMS_REPLIES = [
  { actions: [{ do: "transcribe", ref: AUDIO, language: "english" }] },
  {
    actions: [
      { do: "add_text", markdown: "- A red boat\n- Flying over Prague", where: "after_block" },
      { do: "remove_media", ref: AUDIO },
      { do: "finish", summary: "Listed 2 dreams, moved the recording to Trash" },
    ],
  },
];

const headersOf = (markdown: string) => findNoteSpell(markdown)!.block.headers;

describe("listNoteSpellsToRun", () => {
  it("a vault of today's memories (no hint, form blocks, plain notes) gives zero rows", async () => {
    const formBlock = "Daily\n\n```pensieve:patronus\nspell: sync\nTranscribe it.\n```";
    const v = fakeVault([note("Just text"), { ...note(formBlock, { form: "true" }), id: "f1" }, { ...note(BODY), id: "n2" }]);
    expect(await listNoteSpellsToRun(v.store)).toEqual([]);
  });

  it("lists a hinted runnable spell; ignores a hint without a pending block", async () => {
    const v = fakeVault([note(BODY, HINT), { ...note("No block", HINT), id: "n2" }]);
    expect(await listNoteSpellsToRun(v.store)).toEqual([{ noteId: "n1", title: "Morning", audioRefs: [AUDIO] }]);
  });

  it("waits (not fails) while its media or spoken spell hasn't arrived", async () => {
    const late = BODY.replace("state: pending", "state: pending\nvoice: media/n1/late.m4a");
    const v = fakeVault([note(late, HINT)]);
    expect(await listNoteSpellsToRun(v.store)).toEqual([]);
  });
});

describe("runNoteSpellJob — run once, write once", () => {
  it("a note without a block: no AI call, no write", async () => {
    const v = fakeVault([note("Just a memory", HINT)]);
    const ask = scripted({ actions: [{ do: "finish" }] });
    expect((await runNoteSpellJob("n1", v.deps(ask))).status).toBe("skipped");
    expect(ask).not.toHaveBeenCalled();
    expect(v.saves).toEqual([]);
  });

  it("the dreams example: one save with the list, recording unlinked, done receipt, hint cleared, restore point", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    expect(await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)))).toEqual({ status: "done" });

    expect(v.saves).toHaveLength(1);
    const saved = v.saves[0];
    expect(saved.extra).toBeUndefined();
    expect(saved.markdown).toContain("- A red boat\n- Flying over Prague");
    expect(saved.markdown).not.toContain(AUDIO);
    expect(headersOf(saved.markdown)).toEqual({
      state: "done",
      ran: "2026-11-22T08:00:00.000Z",
      did: "Listed 2 dreams, moved the recording to Trash",
    });
    expect(v.timelines.get("n1")).toMatchObject([{ label: "before-patronus", markdown: BODY }]);
  });

  it("a resurrected pending copy is not run again: Fizzled with a reason, and Try again runs it", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)));
    v.notes.set("n1", note(BODY, HINT)); // the phone's "keep mine"
    const ask = scripted({ actions: [{ do: "finish" }] });
    expect((await runNoteSpellJob("n1", v.deps(ask))).status).toBe("already-ran");
    expect(ask).not.toHaveBeenCalled();
    const md = v.notes.get("n1")!.markdown;
    expect(headersOf(md)).toMatchObject({ state: "failed", run: "1", error: expect.stringMatching(/^Already ran on 2026-11-22/) });
    expect(md).toContain(AUDIO); // the phone's copy is left as it is

    // the phone's Try again: failed → pending (error dropped, run kept) — a new run
    const retried = md.replace("state: failed", "state: pending").replace(/\nerror: .*/, "");
    v.notes.set("n1", note(retried, HINT));
    expect((await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)))).status).toBe("done");
  });

  it("Run again (run: counter bumped) is a new run", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)));
    v.notes.set("n1", note(BODY.replace("state: pending", "state: pending\nrun: 1"), HINT));
    expect((await runNoteSpellJob("n1", v.deps(scripted({ actions: [{ do: "finish", summary: "again" }] })))).status).toBe("done");
  });

  it("the owner edited during the run: the result is thrown away, nothing written", async () => {
    const v = fakeVault([note(BODY, HINT)], (notes) => notes.set("n1", note(BODY.replace("dreams.", "dreams!"), HINT)));
    expect((await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)))).status).toBe("discarded");
    expect(v.saves).toEqual([]);
    expect(headersOf(v.notes.get("n1")!.markdown)?.state).toBe("pending");
  });

  it("a failure is written once (failed + error) and keeps the content", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    const res = await runNoteSpellJob("n1", v.deps(scripted({ actions: [{ do: "rewrite_text", markdown: "gone" }] })));
    expect(res.status).toBe("failed");
    expect(v.saves).toHaveLength(1);
    expect(headersOf(v.saves[0].markdown)).toMatchObject({ state: "failed", error: expect.stringContaining("dropped media") });
    expect(v.saves[0].markdown).toContain(AUDIO);
  });

  it("a Mac problem writes nothing and stays pending (the row shows the error)", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    const ask = vi.fn(async () => Promise.reject(new Error("spawn failed: is `claude` installed?")));
    await expect(runNoteSpellJob("n1", v.deps(ask))).rejects.toThrow("spawn failed");
    expect(v.saves).toEqual([]);
  });

  it("a spell it can't do ends Fizzled with Patronus's reason, the memory untouched", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    const res = await runNoteSpellJob("n1", v.deps(scripted({ actions: [{ do: "cannot", reason: "I can't add tags or move memories." }] })));
    expect(res).toEqual({ status: "failed", reason: "I can't add tags or move memories." });
    expect(headersOf(v.saves[0].markdown)).toMatchObject({ state: "failed", error: "I can't add tags or move memories." });
    expect(findNoteSpell(v.saves[0].markdown)!.before).toEqual(findNoteSpell(BODY)!.before);
  });

  it("keeps the spoken spell's voice line in the receipt", async () => {
    const body = BODY.replace("state: pending", `state: pending\nvoice: ${VOICE}`);
    const v = fakeVault([note(body, HINT)]);
    await runNoteSpellJob("n1", v.deps(scripted({ actions: [{ do: "finish", summary: "ok" }] })));
    expect(headersOf(v.saves[0].markdown)).toMatchObject({ state: "done", voice: VOICE });
  });
});

describe("runNoteSpellJob — undo", () => {
  const ranThenUndo = async (edit?: (md: string) => string) => {
    const v = fakeVault([note(BODY, HINT)]);
    await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)));
    let md = v.notes.get("n1")!.markdown.replace("state: done", "state: undo");
    if (edit) md = edit(md);
    v.notes.set("n1", note(md, { patronus: "undo" }));
    return v;
  };

  it("restores the exact snapshot, removed recording included, block marked undone", async () => {
    const v = await ranThenUndo();
    expect((await runNoteSpellJob("n1", v.deps(scripted()))).status).toBe("undone");
    const md = v.notes.get("n1")!.markdown;
    expect(md).toBe(BODY.replace("state: pending", "state: undone"));
    expect(v.timelines.get("n1")!.at(-1)?.label).toBe("before-undo");
  });

  it("is refused once the owner edited the result, and never runs twice", async () => {
    const v = await ranThenUndo((md) => md.replace("- A red boat", "- A blue boat"));
    expect(await runNoteSpellJob("n1", v.deps(scripted()))).toMatchObject({ status: "undo-refused", reason: expect.stringContaining("You edited it since") });
    expect(v.notes.get("n1")!.markdown).toContain("- A blue boat");

    const w = await ranThenUndo();
    await runNoteSpellJob("n1", w.deps(scripted()));
    const again = w.notes.get("n1")!.markdown.replace("state: undone", "state: undo");
    w.notes.set("n1", note(again, { patronus: "undo" }));
    expect((await runNoteSpellJob("n1", w.deps(scripted()))).status).toBe("undo-refused");
  });

  it("works after the phone re-saved the result (its `* ` bullets are not an edit)", async () => {
    const v = await ranThenUndo((md) => serializeBlocks(parseNoteContent(md)));
    expect(v.notes.get("n1")!.markdown).toContain("* A red boat"); // the phone did rewrite it
    expect((await runNoteSpellJob("n1", v.deps(scripted()))).status).toBe("undone");
    expect(v.notes.get("n1")!.markdown).toContain(AUDIO);
  });

  it("keeps a spell added since the run, as it is now", async () => {
    const later = spellFence("Translate it", { state: "failed", error: "boom" });
    const v = await ranThenUndo((md) => `${md}\n\n${later}`);
    expect((await runNoteSpellJob("n1", v.deps(scripted()))).status).toBe("undone");
    expect(v.notes.get("n1")!.markdown).toBe(`${BODY.replace("state: pending", "state: undone")}\n\n${later}`);
  });
});

describe("runNoteSpellJob — several spells in one memory", () => {
  const CAST = spellFence("Summarise it", { state: "done", ran: "2026-11-21T08:00:00.000Z", did: "Summarised" });

  it("a new spell under a cast one runs; the cast one is not shown to Patronus and stays as it was", async () => {
    const md = `Morning\n\nSome text.\n\n${CAST}\n\n${spellFence("Add a title")}`;
    const v = fakeVault([note(md, HINT)]);
    expect(await listNoteSpellsToRun(v.store)).toHaveLength(1);
    const ask = scripted({ actions: [{ do: "rewrite_text", markdown: "# Morning\n\nSome text." }, { do: "finish", summary: "Titled" }] });
    expect((await runNoteSpellJob("n1", v.deps(ask))).status).toBe("done");
    expect(ask.mock.calls[0][0]).not.toContain("Summarise it");
    const saved = v.saves[0];
    expect(saved.markdown).toBe(`# Morning\n\nSome text.\n\n${CAST}\n\n${spellFence("Add a title", { state: "done", ran: "2026-11-22T08:00:00.000Z", did: "Titled" })}`);
    expect(saved.extra).toBeUndefined();
  });

  it("two pending spells: the first runs, a rewrite keeps the second, the hint stays for it", async () => {
    const second = spellFence("Add a title");
    const v = fakeVault([note(`Morning\n\nSome text.\n\n${spellFence("Fix the typos")}\n\n${second}`, HINT)]);
    const ask = scripted({ actions: [{ do: "rewrite_text", markdown: "Morning\n\nSome text, fixed." }, { do: "finish", summary: "Fixed" }] });
    expect((await runNoteSpellJob("n1", v.deps(ask))).status).toBe("done");
    const saved = v.saves[0];
    expect(saved.markdown).toContain(`Some text, fixed.`);
    expect(saved.markdown.endsWith(second)).toBe(true);
    expect(saved.extra).toEqual(HINT);
    expect(findNoteSpell(saved.markdown)!.block.instruction).toBe("Add a title"); // next sync runs it
  });

  it("a blank pending spell (a stray tap) is not run", async () => {
    const v = fakeVault([note(`Morning\n\n${spellFence("")}`, HINT)]);
    expect(await listNoteSpellsToRun(v.store)).toEqual([]);
    expect((await runNoteSpellJob("n1", v.deps(scripted()))).status).toBe("skipped");
  });
});
