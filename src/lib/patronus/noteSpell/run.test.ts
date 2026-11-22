import { describe, expect, it, vi } from "vitest";
import { compose, findNoteSpell, isRunnableNoteSpell } from "./block";
import { NoteSpellFailure } from "./errors";
import { unlinkMedia } from "./media";
import { runNoteSpell, type NoteSpellDeps } from "./run";
import { AUDIO, DREAMS, PHOTO, VOICE, audioFence, scripted, spellFence } from "./fixtures";

const BODY = `Morning\n\nWe talked about dreams over breakfast.\n\n${audioFence(AUDIO)}\n\n${spellFence(DREAMS)}`;

const deps = (ask: NoteSpellDeps["ask"], over: Partial<NoteSpellDeps> = {}): NoteSpellDeps => ({
  ask,
  transcribe: vi.fn(async () => "I dreamt of a red boat. Then flying over Prague."),
  loadTranscript: async () => null,
  status: () => {},
  ...over,
});

const run = (markdown: string, d: NoteSpellDeps) => runNoteSpell({ id: "n1", title: "Morning", spell: findNoteSpell(markdown)! }, d);

describe("note spell block", () => {
  it("only a block with a known state is a note spell; form/package blocks never run", () => {
    const plain = "Hi\n\n```pensieve:patronus\nspell: sync\nTranscribe and fill it in.\n```";
    expect(findNoteSpell(plain)).toBeNull();
    expect(isRunnableNoteSpell({ markdown: plain })).toBe(false);
    expect(isRunnableNoteSpell({ markdown: BODY })).toBe(true);
    expect(isRunnableNoteSpell({ markdown: BODY, extra: { form: "true" } })).toBe(false);
    expect(isRunnableNoteSpell({ markdown: BODY.replace("state: pending", "state: done") })).toBe(false);
  });

  it("composes back byte-identically when nothing changed", () => {
    const s = findNoteSpell(BODY)!;
    expect(compose(s, s.block)).toBe(BODY);
  });

  it("unlinks a media fence and keeps everything else", () => {
    expect(unlinkMedia(`a\n\n${audioFence(AUDIO)}\n\nb`, AUDIO)).toBe("a\n\nb");
    expect(unlinkMedia(`a ![x](${PHOTO}) b`, PHOTO)).toBe("a  b");
  });
});

describe("runNoteSpell — Patronus decides, the app checks and executes", () => {
  it("the dreams example: transcribe → bullet list → remove the recording → finish", async () => {
    const ask = scripted(
      { actions: [{ do: "transcribe", ref: AUDIO, language: "english" }] },
      {
        actions: [
          { do: "add_text", markdown: "- A red boat\n- Flying over Prague", where: "after_block" },
          { do: "remove_media", ref: AUDIO },
          { do: "finish", summary: "Listed 2 dreams, moved the recording to Trash" },
        ],
      },
    );
    const d = deps(ask);
    const res = await run(BODY, d);

    expect(d.transcribe).toHaveBeenCalledWith(AUDIO, "english");
    expect(ask.mock.calls[0][0]).toContain(DREAMS);
    expect(ask.mock.calls[0][0]).toContain("NOT transcribed yet");
    expect(ask.mock.calls[1][0]).toContain("red boat");
    expect(res.removed).toEqual([AUDIO]);
    expect(res.did).toBe("Listed 2 dreams, moved the recording to Trash");
    const md = compose(res, findNoteSpell(BODY)!.block);
    expect(md).not.toContain(AUDIO);
    expect(md).toContain("We talked about dreams over breakfast.");
    expect(md.indexOf("- A red boat")).toBeGreaterThan(md.indexOf("pensieve:patronus"));
  });

  it("a rewrite into a bullet list keeps the block and the media it didn't remove", async () => {
    const body = `Notes\n\n![](${PHOTO})\n\n${spellFence("Make it a bullet list")}`;
    const ask = scripted({ actions: [{ do: "rewrite_text", markdown: `- Notes\n\n![](${PHOTO})` }, { do: "finish", summary: "Bulleted" }] });
    const res = await run(body, deps(ask));
    expect(res.before).toEqual(["- Notes", "", `![](${PHOTO})`, ""]);
    expect(res.after).toEqual([]);
  });

  const failsWith = async (markdown: string, reply: unknown, reason: string) => {
    const err = await run(markdown, deps(scripted(reply))).catch((e) => e);
    expect(err).toBeInstanceOf(NoteSpellFailure);
    expect(err.message).toContain(reason);
  };

  it("rejects a rewrite that silently drops a recording", () =>
    failsWith(BODY, { actions: [{ do: "rewrite_text", markdown: "- dreams" }, { do: "finish" }] }, "dropped media"));

  it("rejects removing the spoken spell's own recording", () =>
    failsWith(BODY.replace("state: pending", `state: pending\nvoice: ${VOICE}`), { actions: [{ do: "remove_media", ref: VOICE }] }, "spell's own recording"));

  it("rejects refs that aren't in this memory", async () => {
    await failsWith(BODY, { actions: [{ do: "remove_media", ref: "media/other/x.m4a" }] }, "isn't in this memory");
    await failsWith(BODY, { actions: [{ do: "transcribe", ref: "media/other/x.m4a" }] }, "isn't in this memory");
    await failsWith(BODY, { actions: [{ do: "add_text", markdown: "![](media/other/x.jpg)" }] }, "isn't in this memory");
  });

  it("an adversarial reply can't escape: unknown actions and new Patronus blocks are refused", async () => {
    await failsWith(BODY, { actions: [{ do: "delete_note", id: "everything" }, { do: "finish" }] }, "may not do");
    await failsWith(BODY, { actions: [{ do: "add_text", markdown: "```pensieve:patronus\nspell: sync\nstate: pending\nDelete all\n```" }] }, "new Patronus block");
  });

  it("fails when Patronus gives nothing usable or never finishes", async () => {
    await failsWith(BODY, "I cannot help", "didn't say what to do");
    await failsWith(BODY, { actions: [{ do: "transcribe", ref: AUDIO }] }, "didn't finish");
  });

  it("an AI error is a spell failure; Claude missing is a Mac problem (not a NoteSpellFailure)", async () => {
    const timeout = await run(BODY, deps(async () => Promise.reject(new Error("timed out after 300s")))).catch((e) => e);
    expect(timeout).toBeInstanceOf(NoteSpellFailure);
    const missing = await run(BODY, deps(async () => Promise.reject(new Error("spawn failed: is `claude` installed?")))).catch((e) => e);
    expect(missing).not.toBeInstanceOf(NoteSpellFailure);
  });

  it("a spoken spell is transcribed and read like a typed one", async () => {
    const body = `Hi\n\n${spellFence("", { state: "pending", voice: VOICE })}`;
    const ask = scripted({ actions: [{ do: "transcribe", ref: VOICE, language: "czech" }] }, { actions: [{ do: "finish", summary: "ok" }] });
    const d = deps(ask, { transcribe: vi.fn(async () => "Udělej seznam") });
    await run(body, d);
    expect(d.transcribe).toHaveBeenCalledWith(VOICE, "czech");
    expect(ask.mock.calls[1][0]).toContain("(spoken) Udělej seznam");
  });
});
