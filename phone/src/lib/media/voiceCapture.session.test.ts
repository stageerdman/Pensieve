// Session mode (Forms' one-take walk-through): a phone lock pauses the take instead of
// finishing it, and resuming re-opens the mic into the SAME session → one recording.
// Web Audio, getUserMedia and the IndexedDB stores are faked; the engine logic is real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chunks = new Map<string, Blob[]>();
vi.mock("./recordingStore", () => ({
  createSession: vi.fn(async (s: { id: string }) => void chunks.set(s.id, [])),
  appendChunk: vi.fn(async (id: string, _seq: number, b: Blob) => void chunks.get(id)?.push(b)),
  readChunksOrdered: vi.fn(async (id: string) => chunks.get(id) ?? []),
  listSessions: vi.fn(async () => []),
  deleteSession: vi.fn(async (id: string) => void chunks.delete(id)),
}));
const putMedia = vi.fn(async () => {});
vi.mock("./mediaStore", () => ({ mintAudioRef: (noteId: string) => `media/${noteId}/a.wav`, putMedia: (...a: unknown[]) => putMedia(...(a as [])) }));

import { activeSnapshot, pauseRecording, previewTake, resumeRecording, startRecording, stopRecording } from "./voiceCapture";
import type { Note } from "../../types";

let processors: { onaudioprocess: ((e: unknown) => void) | null }[] = [];
let gum = 0;

class FakeCtx {
  sampleRate = 16000;
  state = "running";
  destination = {};
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 0, connect() {}, disconnect() {}, getByteTimeDomainData() {} }; }
  createScriptProcessor() { const p = { onaudioprocess: null, connect() {}, disconnect() {} }; processors.push(p); return p; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  async close() { this.state = "closed"; }
}

const feed = (seconds: number) => {
  const p = processors[processors.length - 1];
  const buf = new Float32Array(16000);
  for (let i = 0; i < seconds; i++) p.onaudioprocess?.({ inputBuffer: { getChannelData: () => buf } });
};

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("voiceCapture session mode (keepOnHide)", () => {
  const note: Note = { id: "n1", t: "Daily Review — Thu 12 Nov", c: "", cat: "--cat-blue", shape: "vial", fill: 0.2, d: "", created: "", createdAt: 0, updatedAt: 0 };
  const deps = { getNote: () => note, persistAndRender: vi.fn(), toast: vi.fn() };

  beforeEach(() => {
    processors = [];
    gum = 0;
    note.c = "";
    vi.stubGlobal("AudioContext", FakeCtx);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => (gum++, { getTracks: () => [{ stop() {} }], getAudioTracks: () => [{ addEventListener() {} }] }) },
    });
  });
  afterEach(() => {
    setHidden(false);
    vi.unstubAllGlobals();
  });

  it("a lock pauses the take; resuming re-opens the mic and still finalizes ONE recording", async () => {
    expect((await startRecording("n1", "", deps, { keepOnHide: true })).ok).toBe(true);
    feed(2);
    setHidden(true);
    await new Promise((r) => setTimeout(r, 0));
    const snap = activeSnapshot();
    expect(snap?.state).toBe("paused");
    expect(snap?.suspended).toBe(true);
    expect(note.c).toBe(""); // NOT finalized on hide

    setHidden(false);
    expect((await resumeRecording()).ok).toBe(true);
    expect(gum).toBe(2); // mic re-acquired
    expect(activeSnapshot()?.state).toBe("recording");
    feed(2);

    await stopRecording();
    expect(activeSnapshot()).toBeNull();
    expect(putMedia).toHaveBeenCalledTimes(1); // one WAV for the whole session
    expect((note.c.match(/```pensieve:audio/g) ?? []).length).toBe(1);
  });

  it("stopping while suspended still saves the take", async () => {
    putMedia.mockClear();
    await startRecording("n1", "", deps, { keepOnHide: true });
    feed(1);
    setHidden(true);
    await new Promise((r) => setTimeout(r, 0));
    await stopRecording();
    expect(putMedia).toHaveBeenCalledTimes(1);
    expect(note.c).toContain("pensieve:audio");
  });

  it("without session mode a lock still finishes the take (the Record spell's behaviour)", async () => {
    putMedia.mockClear();
    await startRecording("n1", "", deps);
    feed(1);
    setHidden(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(activeSnapshot()).toBeNull();
    expect(putMedia).toHaveBeenCalledTimes(1);
  });

  it("previewTake plays the take so far WITHOUT finishing it (the review screen)", async () => {
    putMedia.mockClear();
    await startRecording("n1", "", deps, { keepOnHide: true });
    feed(2);
    pauseRecording();
    const wav = await previewTake();
    expect(wav?.type).toBe("audio/wav");
    expect(wav!.size).toBeGreaterThan(44); // header + samples
    expect(activeSnapshot()?.state).toBe("paused"); // still open
    expect(putMedia).not.toHaveBeenCalled();
    await resumeRecording();
    feed(1);
    await stopRecording();
    expect(putMedia).toHaveBeenCalledTimes(1);
  });
});
