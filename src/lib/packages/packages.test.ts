import { describe, expect, it } from "vitest";
import { DEFAULT_SPELL, encodeHeaders, encodePatronus, findPatronus, parseHeaders, parsePatronus, patronusFence, spellFor, withPatronus, withoutPatronus } from ".";
import { buildStepPrompt, parseStep, type StepContext } from "./protocol";
import { parseForm } from "../forms";
import { fillFieldsOf } from "../formFill/prompt";

const BODY = "Daily\n\n**Was I a king?**\n\n**Rate**\n\n```pensieve:scale\n1: low\n2: high\n```\n\n```pensieve:audio\nmedia/p1/take.wav\n```";

describe("Patronus block", () => {
  it("round-trips: spell line + verbatim instruction", () => {
    const fence = patronusFence({ spell: "sync", instruction: "Transcribe it.\nI speak English." });
    expect(fence).toBe("```pensieve:patronus\nspell: sync\nTranscribe it.\nI speak English.\n```");
    expect(parsePatronus("spell: sync\nTranscribe it.\nI speak English.")).toEqual({ spell: "sync", instruction: "Transcribe it.\nI speak English." });
    expect(parsePatronus("Just do it")).toEqual({ spell: "sync", instruction: "Just do it" });
  });
  it("a package ends with one; found, replaced, consumed", () => {
    const pkg = withPatronus(BODY, { spell: "sync", instruction: DEFAULT_SPELL.form });
    expect(pkg.endsWith("```pensieve:patronus\nspell: sync\n" + DEFAULT_SPELL.form + "\n```")).toBe(true);
    expect(findPatronus(pkg)?.instruction).toBe(DEFAULT_SPELL.form);
    const again = withPatronus(pkg, { spell: "sync", instruction: "Other" });
    expect(again.match(/pensieve:patronus/g)).toHaveLength(1);
    expect(withoutPatronus(pkg)).toBe(BODY);
    expect(findPatronus(BODY)).toBeNull();
  });
  it("spells: sync and compress parse; findPatronus picks the sync one; all are consumed", () => {
    expect(parsePatronus("spell: compress\nShrink my week.")).toEqual({ spell: "compress", instruction: "Shrink my week." });
    expect(parsePatronus("spell: bogus\nX").spell).toBe("sync");
    const form = BODY + "\n\n```pensieve:patronus\nspell: sync\nOnly the King.\n```\n\n```pensieve:patronus\nspell: compress\nShrink.\n```";
    expect(findPatronus(form)?.instruction).toBe("Only the King.");
    expect(findPatronus(form, "compress")?.instruction).toBe("Shrink.");
    expect(withoutPatronus(form)).toBe(BODY);
    const pf = parseForm(form);
    expect(pf.charms.map((c) => [c.name, c.prompt])).toEqual([["Compress", "Shrink."]]);
  });
  it("header lines (note spells): parsed between spell and instruction, encoded in a fixed order", () => {
    const body = "spell: sync\nstate: pending\nvoice: media/n1/v.m4a\nList my dreams.\nstate: not a header now";
    expect(parsePatronus(body)).toEqual({
      spell: "sync", headers: { state: "pending", voice: "media/n1/v.m4a" }, instruction: "List my dreams.\nstate: not a header now",
    });
    expect(encodePatronus(parsePatronus(body))).toBe(body);
    expect(encodePatronus({ spell: "sync", instruction: "X", headers: { did: "a\nb", state: "done" } })).toBe("spell: sync\nstate: done\ndid: a b\nX");
    expect(parseHeaders(encodeHeaders({ state: "failed", error: "Oops" }))).toEqual({ state: "failed", error: "Oops" });
  });
  it("blocks without headers (every form/package block today) parse + encode byte-identically", () => {
    for (const body of ["spell: sync\nTranscribe it.\nI speak English.", "spell: compress\nShrink my week.", "spell: sync", "Just do it", "spell: sync\nState: capital is instruction"]) {
      const p = parsePatronus(body);
      expect(p.headers).toBeUndefined();
      if (body.startsWith("spell:")) expect(encodePatronus(p)).toBe(body);
    }
  });
  it("a form's own instruction overrides the default", () => {
    expect(spellFor("form", "  Only the King question.  ")).toBe("Only the King question.");
    expect(spellFor("form", "")).toBe(DEFAULT_SPELL.form);
  });
});

describe("Patronus step protocol", () => {
  const fields = parseForm(BODY).fields;
  const ctx: StepContext = {
    kind: "form", title: "Daily", instruction: "Transcribe in English and fill it in.", markdown: BODY,
    fields: fillFieldsOf(fields), media: [{ ref: "media/p1/take.wav", kind: "audio", transcript: null }], done: [],
  };
  it("the prompt carries the spell, the fields, the media state and the action menu", () => {
    const p = buildStepPrompt(ctx);
    expect(p).toContain("Transcribe in English and fill it in.");
    expect(p).toContain(`id: ${fields[0].id}`);
    expect(p).toContain("NOT transcribed yet");
    expect(p).toContain('"do": "fill_form"');
    expect(p).toContain('{"actions": [ ... ]}');
  });
  it("journal packages aren't offered fill_form", () => {
    expect(buildStepPrompt({ ...ctx, kind: "journal", fields: [] })).not.toContain("fill_form");
  });
  it("keeps only valid actions, stops at finish", () => {
    const raw = "```json\n" + JSON.stringify({ actions: [
      { do: "transcribe", ref: "media/p1/take.wav", language: "czech" },
      { do: "transcribe", ref: "media/other.wav", language: "english" }, // not in the package
      { do: "fill_form", answers: { [fields[0].id]: { text: "Yes." }, [fields[1].id]: { scale: 2 }, bogus: { text: "x" } } },
      { do: "delete_everything" },
      { do: "finish" },
      { do: "transcribe", ref: "media/p1/take.wav", language: "english" }, // after finish
    ] }) + "\n```";
    const out = parseStep(raw, { kind: "form", media: ctx.media, formFields: fields });
    expect(out).toEqual([
      { do: "transcribe", ref: "media/p1/take.wav", language: "czech" },
      { do: "fill_form", answers: { [fields[0].id]: { text: "Yes." }, [fields[1].id]: { scale: 2 } } },
      { do: "finish" },
    ]);
  });
  it("garbage → no actions (never throws)", () => {
    expect(parseStep("sorry, I can't", { kind: "form", media: [] })).toEqual([]);
    expect(parseStep("{not json}", { kind: "form", media: [] })).toEqual([]);
  });
});
