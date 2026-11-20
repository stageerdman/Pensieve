// Chunks are what a recording is made of until it's finalized — they must read back whole and
// in order, whether this build wrote them (ArrayBuffer) or an older one did (Blob).
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { appendChunk, createSession, deleteSession, readChunksOrdered } from "./recordingStore";

// jsdom's Blob has no arrayBuffer(); FileReader reads it the same way.
const bytesOf = (b: Blob) =>
  new Promise<number[]>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(Array.from(new Uint8Array(r.result as ArrayBuffer)));
    r.readAsArrayBuffer(b);
  });

describe("recordingStore chunks", () => {
  it("reads chunks back in seq order with their exact bytes", async () => {
    await createSession({ id: "s1", noteId: "n", mimeType: "audio/wav", sampleRate: 16000, startedAt: 0, placeholderBody: "" });
    await appendChunk("s1", 1, Uint8Array.from([3, 4]).buffer);
    await appendChunk("s1", 0, Uint8Array.from([1, 2]).buffer);
    const chunks = await readChunksOrdered("s1");
    expect(await Promise.all(chunks.map(bytesOf))).toEqual([[1, 2], [3, 4]]);
    await deleteSession("s1");
    expect(await readChunksOrdered("s1")).toEqual([]);
  });
});
