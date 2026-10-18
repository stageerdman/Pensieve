import { describe, it, expect } from "vitest";
import { partitionAudioRefs, listUntranscribedAudio, queueItemLabel, type QueueStore } from "./queue";
import { isAudioRef, isTranscriptSidecar, audioRefForSidecar } from "./audioRef";
import type { Transcript } from "./types";

const t = (media: string): Transcript => ({ version: 1, media, meta: {}, segments: [] });

describe("audioRef predicates", () => {
  it("recognises audio by extension, rejects images and sidecars", () => {
    expect(isAudioRef("media/n1/a.mp3")).toBe(true);
    expect(isAudioRef("media/n1/a.WAV")).toBe(true); // case-insensitive
    expect(isAudioRef("media/n1/a.m4a")).toBe(true);
    expect(isAudioRef("media/n1/a.png")).toBe(false);
    expect(isAudioRef("media/n1/a.mp3.transcript.json")).toBe(false); // ext is json
    expect(isAudioRef("notes/n1.md")).toBe(false);
  });

  it("inverts the sidecar naming", () => {
    expect(isTranscriptSidecar("media/n1/a.mp3.transcript.json")).toBe(true);
    expect(isTranscriptSidecar("media/n1/a.mp3")).toBe(false);
    expect(audioRefForSidecar("media/n1/a.mp3.transcript.json")).toBe("media/n1/a.mp3");
    expect(audioRefForSidecar("media/n1/a.mp3")).toBeNull();
  });
});

describe("partitionAudioRefs (pure)", () => {
  it("splits audio from sidecars and marks sidecar-backed audio transcribed", () => {
    const { audioRefs, transcribedBySidecar } = partitionAudioRefs([
      "media/n1/a.mp3",
      "media/n1/a.mp3.transcript.json",
      "media/n2/b.wav",
      "media/n2/pic.png",
    ]);
    expect(audioRefs.sort()).toEqual(["media/n1/a.mp3", "media/n2/b.wav"]);
    expect([...transcribedBySidecar]).toEqual(["media/n1/a.mp3"]);
  });
});

/** A fake store over an explicit media listing + a set of refs that have a transcript. */
function fakeStore(media: string[], withTranscript: string[] = []): QueueStore {
  const has = new Set(withTranscript);
  return {
    listMedia: async () => media,
    loadTranscript: async (ref: string) => (has.has(ref) ? t(ref) : null),
  };
}

describe("listUntranscribedAudio", () => {
  const titleFor = (id: string) => `Note ${id}`;

  it("drops audio with a sibling sidecar in the listing (tauri shape)", async () => {
    const store = fakeStore([
      "media/n1/a.mp3",
      "media/n1/a.mp3.transcript.json", // n1 already transcribed
      "media/n2/b.wav",
    ]);
    const q = await listUntranscribedAudio(titleFor, store);
    expect(q.map((i) => i.ref)).toEqual(["media/n2/b.wav"]);
    expect(q[0]).toMatchObject({ ref: "media/n2/b.wav", noteId: "n2", title: "Note n2", audioName: "b.wav" });
  });

  it("labels a row by note title, falling back to the audio file name", async () => {
    const store = fakeStore(["media/n9/rec-9.mp3"]);
    const [withTitle] = await listUntranscribedAudio(() => "Call with Dominik", store);
    expect(queueItemLabel(withTitle)).toBe("Call with Dominik");
    const [noTitle] = await listUntranscribedAudio(() => "   ", store); // blank note title
    expect(queueItemLabel(noTitle)).toBe("rec-9.mp3");
  });

  it("falls back to loadTranscript when sidecars aren't listed (browser shape)", async () => {
    // No sidecars in the listing; n1 nonetheless has a transcript on the side.
    const store = fakeStore(["media/n1/a.mp3", "media/n2/b.wav"], ["media/n1/a.mp3"]);
    const q = await listUntranscribedAudio(titleFor, store);
    expect(q.map((i) => i.ref)).toEqual(["media/n2/b.wav"]);
  });

  it("ignores non-audio media entirely", async () => {
    const store = fakeStore(["media/n1/pic.png", "notes/n1.md"]);
    expect(await listUntranscribedAudio(titleFor, store)).toEqual([]);
  });

  it("newest-tending-first (listing order reversed)", async () => {
    const store = fakeStore(["media/n1/old.mp3", "media/n2/new.mp3"]);
    const q = await listUntranscribedAudio(titleFor, store);
    expect(q.map((i) => i.ref)).toEqual(["media/n2/new.mp3", "media/n1/old.mp3"]);
  });
});
