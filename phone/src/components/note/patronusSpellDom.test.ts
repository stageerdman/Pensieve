// The note spell block on the phone memory page: renders each state, the field writes the
// instruction into the block, Undo / Try again change only the state, and a memory without a
// spell (or with a form's Patronus block) serializes back exactly as before.
import { describe, expect, it, vi } from "vitest";
import { renderNoteBody, serializeNoteBody } from "./mediaDom";
import { insertNoteSpell } from "./patronusSpellDom";
import { newSpellBody } from "../../lib/patronus/noteSpell";

const fence = (body: string) => "```pensieve:patronus\n" + body + "\n```";

function open(body: string) {
  const el = document.createElement("div");
  el.className = "note-body";
  el.contentEditable = "true";
  document.body.appendChild(el);
  const ctx = { onChange: vi.fn() };
  renderNoteBody(el, "Walk", body, ctx);
  return { el, ctx, spell: () => el.querySelector<HTMLElement>(".ph-spell") };
}

describe("Patronus note spell block", () => {
  it("an armed spell shows the trigger, an editable field and the waiting line", () => {
    const { spell } = open(`Morning walk.\n\n${fence("spell: sync\nstate: pending\nSummarise this")}`);
    const s = spell()!;
    expect(s.dataset.state).toBe("pending");
    expect(s.contentEditable).toBe("false");
    expect(s.querySelector(".ph-spell-trigger")?.textContent).toBe("When synced · Patronus casts");
    expect(s.querySelector<HTMLTextAreaElement>(".ph-spell-input")?.value).toBe("Summarise this");
    expect(s.querySelector(".ph-spell-status")?.textContent).toBe("Waits for the computer");
    expect(s.querySelector(".ph-spell-action")).toBeNull();
  });

  it("typing updates the block and saves; the rest of the memory is untouched", () => {
    const { el, ctx, spell } = open(`Morning walk.\n\n${fence("spell: sync\nstate: pending\n")}`);
    const area = spell()!.querySelector<HTMLTextAreaElement>(".ph-spell-input")!;
    area.value = "Turn this into a list";
    area.dispatchEvent(new Event("input"));
    expect(ctx.onChange).toHaveBeenCalledTimes(1);
    expect(serializeNoteBody(el).content).toBe(`Morning walk.\n\n${fence("spell: sync\nstate: pending\nTurn this into a list")}`);
  });

  it("a cast spell shows what was done and Undo; Undo asks the computer", () => {
    const body = fence("spell: sync\nstate: done\nran: 2026-11-22T14:05:00Z\ndid: Added a summary\nSummarise this");
    const { el, ctx, spell } = open(`Morning walk.\n\n${body}`);
    expect(spell()!.querySelector(".ph-spell-input")).toBeNull();
    expect(spell()!.querySelector(".ph-spell-words")?.textContent).toBe("Summarise this");
    expect(spell()!.querySelector(".ph-spell-did")?.textContent).toBe("Added a summary");
    const undo = spell()!.querySelector<HTMLButtonElement>(".ph-spell-action")!;
    expect(undo.textContent).toBe("Undo");
    undo.click();
    expect(ctx.onChange).toHaveBeenCalledTimes(1);
    expect(spell()!.dataset.state).toBe("undo");
    expect(spell()!.querySelector(".ph-spell-status")?.textContent).toBe("Undo waits for the computer");
    expect(spell()!.querySelector(".ph-spell-action")).toBeNull();
    expect(serializeNoteBody(el).content).toContain("state: undo\nran: 2026-11-22T14:05:00Z\ndid: Added a summary\nSummarise this");
  });

  it("a refused undo shows the reason and no button", () => {
    const { spell } = open(fence("spell: sync\nstate: done\nerror: You edited it since. Undo from Timeline on the computer.\nx"));
    expect(spell()!.querySelector(".ph-spell-note")?.textContent).toBe("You edited it since. Undo from Timeline on the computer.");
    expect(spell()!.querySelector(".ph-spell-action")).toBeNull();
  });

  it("a fizzled spell shows the reason; Try again re-arms it and keeps the run counter", () => {
    const { el, spell } = open(fence("spell: sync\nstate: failed\nrun: 1\nerror: Patronus couldn't answer\nx"));
    expect(spell()!.querySelector(".ph-spell-status")?.textContent).toBe("Fizzled — Patronus couldn't answer");
    expect(spell()!.querySelector(".ph-spell-input")).not.toBeNull();
    spell()!.querySelector<HTMLButtonElement>(".ph-spell-action")!.click();
    expect(spell()!.dataset.state).toBe("pending");
    expect(serializeNoteBody(el).content).toBe(fence("spell: sync\nstate: pending\nrun: 1\nx"));
  });

  it("fixing a fizzled spell's words re-arms it in place, keeping the field the owner types in", () => {
    const { el, ctx, spell } = open(fence("spell: sync\nstate: failed\nrun: 1\nerror: Patronus couldn't answer\nSumarise"));
    const area = spell()!.querySelector<HTMLTextAreaElement>(".ph-spell-input")!;
    area.value = "Summarise";
    area.dispatchEvent(new Event("input"));
    expect(spell()!.querySelector(".ph-spell-input")).toBe(area); // not rebuilt: focus and caret stay
    expect(spell()!.dataset.state).toBe("pending");
    expect(spell()!.querySelector(".ph-spell-status")?.textContent).toBe("Waits for the computer");
    expect(spell()!.querySelector(".ph-spell-action")).toBeNull();
    expect(ctx.onChange).toHaveBeenCalledTimes(1);
    expect(serializeNoteBody(el).content).toBe(fence("spell: sync\nstate: pending\nrun: 1\nSummarise"));
  });

  it("an undone spell is quiet: no field, no button", () => {
    const { spell } = open(fence("spell: sync\nstate: undone\nx"));
    expect(spell()!.querySelector(".ph-spell-status")?.textContent).toBe("Undone");
    expect(spell()!.querySelector(".ph-spell-input, .ph-spell-action")).toBeNull();
  });

  it("a form's Patronus block (no state line) renders as before, not as a spell", () => {
    const body = `Q?\n\n${fence("spell: sync\nTranscribe the recording and fill in the form from it.")}`;
    const { el, spell } = open(body);
    expect(spell()).toBeNull();
    expect(el.querySelector(".ph-patronus")).not.toBeNull();
    expect(serializeNoteBody(el).content).toBe(body);
  });

  it("inserting a spell adds an armed block with a writable line under it and saves", () => {
    const { el, ctx } = open("Morning walk.");
    const s = insertNoteSpell(el, newSpellBody(), ctx);
    expect(s.dataset.state).toBe("pending");
    expect(s.nextElementSibling?.classList.contains("ph-media")).toBe(false);
    expect(ctx.onChange).toHaveBeenCalled();
    expect(serializeNoteBody(el).content).toContain(fence("spell: sync\nstate: pending"));
  });
});
