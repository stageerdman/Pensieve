import { describe, expect, it, vi } from "vitest";
import { findNoteSpell } from "./block";
import { runNoteSpellJob } from "./job";
import { listNoteSpellsToRun } from "./queue";
import { AUDIO, DREAMS, VOICE, audioFence, fakeVault, note, scripted, spellFence } from "./fixtures";

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

  it("a resurrected pending copy is not run again", async () => {
    const v = fakeVault([note(BODY, HINT)]);
    await runNoteSpellJob("n1", v.deps(scripted(...DREAMS_REPLIES)));
    v.notes.set("n1", note(BODY, HINT)); // the phone's "keep mine"
    const ask = scripted({ actions: [{ do: "finish" }] });
    expect((await runNoteSpellJob("n1", v.deps(ask))).status).toBe("already-ran");
    expect(ask).not.toHaveBeenCalled();
    expect(headersOf(v.notes.get("n1")!.markdown)?.did).toMatch(/^Already ran on 2026-11-22/);
    expect(v.notes.get("n1")!.markdown).toContain(AUDIO); // the phone's copy is left as it is
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
});
