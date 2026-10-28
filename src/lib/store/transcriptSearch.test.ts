import { describe, it, expect, beforeEach } from "vitest";
import { BrowserStore } from "./browser";
import type { Note } from "../types";
import type { Transcript } from "../transcripts/types";

// P4: a referenced recording's transcript text must be folded into the note's search
// corpus (bodies()), so spoken words are findable in Accio — even though the transcript
// is a sidecar and never part of the .md.

const AUDIO_REF = "media/n1/rec-9.mp3";

function note(markdown: string): Note {
  return {
    id: "n1", title: "Call", createdAt: 1, addedAt: 1, updatedAt: 1,
    markdown, categories: [], tags: [], links: [], pinned: false, starred: false,
  };
}

const transcript: Transcript = {
  version: 1,
  media: "rec-9.mp3",
  meta: { language: "cs", speakers: ["Klient"] },
  segments: [
    { id: 0, speaker: "Klient", start: 0, end: 2, text: "partnerku zatím nemám", words: [] },
    { id: 1, speaker: "Obchodník", start: 2, end: 4, text: "jaký je ten problém", words: [] },
  ],
};

describe("transcript text folded into the search corpus", () => {
  beforeEach(() => localStorage.clear());

  it("bodies() includes a referenced recording's transcript words", async () => {
    const store = new BrowserStore();
    await store.save(note("A note.\n\n```pensieve:audio\n" + AUDIO_REF + "\n```\n"));
    await store.saveTranscript(AUDIO_REF, transcript);

    const bodies = await store.bodies();
    const body = bodies.find((b) => b.id === "n1")!;
    expect(body.text).toContain("partnerku"); // spoken, not typed
    expect(body.text).toContain("problém");
  });

  it("no transcript sidecar → only the typed body is indexed", async () => {
    const store = new BrowserStore();
    await store.save(note("Just typed text.\n\n```pensieve:audio\n" + AUDIO_REF + "\n```\n"));

    const bodies = await store.bodies();
    const body = bodies.find((b) => b.id === "n1")!;
    expect(body.text).toContain("typed");
    expect(body.text).not.toContain("partnerku");
  });

  it("loadTranscript round-trips what saveTranscript wrote", async () => {
    const store = new BrowserStore();
    await store.saveTranscript(AUDIO_REF, transcript);
    const loaded = await store.loadTranscript(AUDIO_REF);
    expect(loaded?.segments.length).toBe(2);
    expect(loaded?.segments[0].text).toBe("partnerku zatím nemám");
    expect(await store.loadTranscript("media/n1/nope.mp3")).toBeNull();
  });
});
