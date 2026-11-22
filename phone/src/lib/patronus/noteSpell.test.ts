import { describe, expect, it } from "vitest";
import { encodePatronus, parsePatronus } from "../../../../src/lib/packages/patronus";
import { PATRONUS_HINT_KEY as MAC_HINT_KEY, findNoteSpell } from "../../../../src/lib/patronus/noteSpell/block";
import {
  PATRONUS_HINT_KEY,
  computerWork,
  editSpell,
  isNoteSpell,
  newSpellBody,
  requestUndo,
  retrySpell,
  spellView,
  spellsWaiting,
  withPatronusHint,
} from "./noteSpell";

const fence = (body: string) => "```pensieve:patronus\n" + body + "\n```";
const block = (headers: Record<string, string>, instruction = "Summarise this") => parsePatronus(encodePatronus({ spell: "sync", instruction, headers }));

describe("note spell — the phone's model", () => {
  it("a new spell is armed and the computer's own parser reads it as pending", () => {
    expect(newSpellBody("Tidy this up")).toBe("spell: sync\nstate: pending\nTidy this up");
    expect(findNoteSpell(`Hello\n\n${fence(newSpellBody("Tidy this up"))}`)?.state).toBe("pending");
    expect(PATRONUS_HINT_KEY).toBe(MAC_HINT_KEY);
  });

  it("only blocks with a state line are note spells (forms, packages, legacy stay as they are)", () => {
    expect(isNoteSpell(newSpellBody())).toBe(true);
    expect(isNoteSpell("spell: sync\nTranscribe the recording and fill in the form from it.")).toBe(false);
    expect(isNoteSpell("spell: compress\nSum up the week")).toBe(false);
    expect(isNoteSpell("Just some words")).toBe(false);
    expect(isNoteSpell("spell: sync\nstate: running\nx")).toBe(false); // the phone never shows `running`
  });

  it("views: one status line and at most one action per state", () => {
    expect(spellView(block({ state: "pending" }))).toMatchObject({ editable: true, status: "Waits for the computer" });
    expect(spellView(block({ state: "pending" })).action).toBeUndefined();

    const done = spellView(block({ state: "done", ran: "2026-11-22T14:05:00Z", did: "Added a summary; moved the recording to Trash" }));
    expect(done).toMatchObject({ editable: false, action: "undo", did: "Added a summary; moved the recording to Trash" });
    expect(done.status).toMatch(/^Cast · /);

    const refused = spellView(block({ state: "done", error: "You edited it since. Undo from Timeline on the computer." }));
    expect(refused.action).toBeUndefined();
    expect(refused.undoNote).toBe("You edited it since. Undo from Timeline on the computer.");

    expect(spellView(block({ state: "failed", error: "Patronus couldn't answer" }))).toMatchObject({
      editable: true,
      action: "retry",
      status: "Fizzled — Patronus couldn't answer",
    });
    expect(spellView(block({ state: "undo" }))).toMatchObject({ editable: false, status: "Undo waits for the computer" });
    expect(spellView(block({ state: "undone", did: "x" }))).toMatchObject({ editable: false, status: "Undone" });
    expect(spellView(block({ state: "undone" })).action).toBeUndefined();
  });

  it("Try again: failed → pending, error dropped, run counter kept", () => {
    const next = retrySpell(block({ state: "failed", run: "2", error: "boom" }));
    expect(next.headers).toEqual({ state: "pending", run: "2" });
    expect(encodePatronus(next)).toBe("spell: sync\nstate: pending\nrun: 2\nSummarise this");
    const pending = block({ state: "pending" });
    expect(retrySpell(pending)).toBe(pending);
  });

  it("editing a fizzled spell's words re-arms it; other edits only change the words", () => {
    const fizzled = block({ state: "failed", run: "1", error: "Patronus couldn't answer" }, "Sumarise this");
    const fixed = editSpell(fizzled, "Summarise this");
    expect(fixed.headers).toEqual({ state: "pending", run: "1" });
    expect(fixed.instruction).toBe("Summarise this");
    expect(editSpell(fizzled, "Sumarise this").headers?.state).toBe("failed"); // same words: still fizzled
    expect(editSpell(block({ state: "pending" }), "y")).toMatchObject({ instruction: "y", headers: { state: "pending" } });
  });

  it("counts the memories whose spell still waits for the computer", () => {
    const bodies = [
      `Notes\n\n${fence(newSpellBody("Tidy"))}`,
      fence("spell: sync\nstate: undo\nx"),
      fence("spell: sync\nstate: done\nx"),
      fence(newSpellBody()), // blank: not sent
      "plain",
      undefined,
    ];
    expect(spellsWaiting(bodies)).toBe(2);
    expect(spellsWaiting([])).toBe(0);
  });

  it("Undo: done → undo; refused or not-done spells don't change", () => {
    expect(requestUndo(block({ state: "done", did: "x", ran: "t" })).headers).toEqual({ state: "undo", did: "x", ran: "t" });
    const refused = block({ state: "done", error: "no" });
    expect(requestUndo(refused)).toBe(refused);
    const failed = block({ state: "failed" });
    expect(requestUndo(failed)).toBe(failed);
  });

  it("the hint follows the state the computer has to act on", () => {
    expect(computerWork(fence(newSpellBody("x")))).toBe("pending");
    expect(computerWork(fence("spell: sync\nstate: undo\nx"))).toBe("undo");
    expect(computerWork(fence("spell: sync\nstate: done\nx"))).toBeUndefined();
    expect(computerWork(fence(newSpellBody()))).toBeUndefined(); // a blank spell: nothing to cast yet
    expect(computerWork(fence("spell: sync\nstate: pending\nvoice: media/a.m4a"))).toBe("pending");

    expect(withPatronusHint(undefined, fence(newSpellBody("x")))).toEqual({ patronus: "pending" });
    expect(withPatronusHint({ a: "1" }, fence("spell: sync\nstate: undo\nx"))).toEqual({ a: "1", patronus: "undo" });
    expect(withPatronusHint({ a: "1", patronus: "pending" }, fence("spell: sync\nstate: done\nx"))).toEqual({ a: "1" });
    expect(withPatronusHint({ patronus: "undo" }, "no spell any more")).toBeUndefined();
  });

  it("a memory without a note spell keeps its extra untouched (same object)", () => {
    const extra = { form: "daily" };
    expect(withPatronusHint(extra, "Plain text")).toBe(extra);
    expect(withPatronusHint(extra, fence("spell: sync\nTranscribe it."))).toBe(extra);
    expect(withPatronusHint(undefined, "Plain text")).toBeUndefined();
    const armed = { patronus: "pending" };
    expect(withPatronusHint(armed, fence(newSpellBody("x")))).toBe(armed);
  });
});
