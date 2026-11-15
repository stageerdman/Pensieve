import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SPELL, withPatronus } from ".";
import { runPackage, mediaRefsOf } from "./run";
import { parseForm } from "../forms";

const AUDIO = "media/p1/take.wav";
const BODY = "Daily\n\n**Was I a king?**\n\n**Name of the Day**\n\n```pensieve:audio\n" + AUDIO + "\n```\n\n![](media/p1/photo.jpg)";
const PKG = withPatronus(BODY, { spell: "sync", instruction: "I speak English. Transcribe and fill it in." });
const ids = parseForm(BODY).fields.map((f) => f.id);
const input = { id: "p1", kind: "form" as const, title: "Daily", markdown: PKG, fallbackInstruction: DEFAULT_SPELL.form };

describe("runPackage — Patronus decides, the app executes", () => {
  it("finds every media ref in a package", () => {
    expect(mediaRefsOf(BODY)).toEqual([{ ref: AUDIO, kind: "audio" }, { ref: "media/p1/photo.jpg", kind: "image" }]);
  });

  it("step 1 transcribes (language chosen by Patronus), step 2 fills + finishes; block consumed", async () => {
    const prompts: string[] = [];
    const ask = vi.fn(async (p: string) => {
      prompts.push(p);
      return prompts.length === 1
        ? JSON.stringify({ actions: [{ do: "transcribe", ref: AUDIO, language: "english" }] })
        : JSON.stringify({ actions: [{ do: "fill_form", answers: { [ids[0]]: { text: "Yes, mostly." }, [ids[1]]: { text: "Light in the distance" } } }, { do: "finish" }] });
    });
    const transcribe = vi.fn(async () => "Yes mostly. Name of the day: light in the distance.");
    const statuses: string[] = [];
    const res = await runPackage(input, { ask, transcribe, loadTranscript: async () => null, status: (s) => statuses.push(s) });

    expect(transcribe).toHaveBeenCalledWith(AUDIO, "english");
    expect(prompts[0]).toContain("I speak English.");
    expect(prompts[0]).toContain("NOT transcribed yet");
    expect(prompts[1]).toContain("light in the distance."); // step 2 sees the new transcript
    expect(prompts[1]).toContain(`transcribed ${AUDIO} as english`);
    expect(res.markdown).not.toContain("pensieve:patronus");
    expect(res.markdown).toContain("**Was I a king?**\n\nYes, mostly.");
    expect(res.markdown.indexOf("Light in the distance")).toBeLessThan(res.markdown.indexOf("pensieve:audio"));
    expect(statuses).toEqual(["Reading the spell", "Transcribing · English", "Thinking", "Filling the form", "Finishing"]);
  });

  it("an existing transcript can be used as-is (no re-transcribe)", async () => {
    const transcribe = vi.fn();
    const res = await runPackage(input, {
      ask: async (p) => (expect(p).toContain("transcribed as english"), JSON.stringify({ actions: [{ do: "finish" }] })),
      transcribe,
      loadTranscript: async () => ({ text: "hi", language: "english" }),
      status: () => {},
    });
    expect(transcribe).not.toHaveBeenCalled();
    expect(res.done).toEqual([]);
  });

  it("fails loudly (the row shows it) when Patronus gives nothing usable or never finishes", async () => {
    const deps = { transcribe: async () => "t", loadTranscript: async () => null, status: () => {} };
    await expect(runPackage(input, { ...deps, ask: async () => "I cannot help" })).rejects.toThrow("didn't say what to do");
    await expect(
      runPackage(input, { ...deps, ask: async () => JSON.stringify({ actions: [{ do: "transcribe", ref: AUDIO, language: "czech" }] }) }),
    ).rejects.toThrow("didn't finish");
  });
});
