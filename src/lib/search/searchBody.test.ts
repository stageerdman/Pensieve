import { describe, it, expect } from "vitest";
import { buildSearchBody } from "./searchBody";
import type { Transcript } from "../transcripts/types";

// buildSearchBody is the single definition of a note's searchable text: markdown as plain
// text PLUS every referenced recording's transcript. It backs both Store.bodies() and the
// single-note reindex, so they fold identically.

const AUDIO_REF = "media/n1/rec-9.mp3";
const AUDIO_REF_2 = "media/n1/rec-10.mp3";

const transcript = (text: string): Transcript => ({
  version: 1,
  media: "rec.mp3",
  meta: { language: "cs", speakers: ["Klient"] },
  segments: [{ id: 0, speaker: "Klient", start: 0, end: 2, text, words: [] }],
});

const audioBlock = (ref: string) => "```pensieve:audio\n" + ref + "\n```\n";

describe("buildSearchBody", () => {
  it("folds a referenced recording's transcript words into the body text", async () => {
    const md = "Typed note.\n\n" + audioBlock(AUDIO_REF);
    const text = await buildSearchBody(md, async (ref) =>
      ref === AUDIO_REF ? transcript("partnerku zatím nemám") : null,
    );
    expect(text).toContain("Typed"); // the typed markdown
    expect(text).toContain("partnerku"); // the spoken transcript
  });

  it("returns only the typed text when no sidecar exists", async () => {
    const md = "Just typed.\n\n" + audioBlock(AUDIO_REF);
    const text = await buildSearchBody(md, async () => null);
    expect(text).toContain("typed");
    expect(text).not.toContain("partnerku");
  });

  it("folds every referenced recording, not just the first", async () => {
    const md = "Note.\n\n" + audioBlock(AUDIO_REF) + "\n" + audioBlock(AUDIO_REF_2);
    const text = await buildSearchBody(md, async (ref) =>
      ref === AUDIO_REF ? transcript("alpha") : ref === AUDIO_REF_2 ? transcript("omega") : null,
    );
    expect(text).toContain("alpha");
    expect(text).toContain("omega");
  });
});
