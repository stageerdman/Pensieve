import { describe, it, expect, beforeEach, vi } from "vitest";
import { BrowserStore } from "./browser";
import type { MediaBlobStore } from "./idb";
import { parseMediaPath } from "../media";

// In-memory MediaBlobStore so we exercise the adapter logic without IndexedDB (jsdom
// ships none). Blobs are kept whole; get returns the same Blob instance.
function memMediaStore(): MediaBlobStore & { map: Map<string, Blob> } {
  const map = new Map<string, Blob>();
  return {
    map,
    async put(ref, blob) {
      map.set(ref, blob);
    },
    async get(ref) {
      return map.get(ref) ?? null;
    },
    async delete(ref) {
      map.delete(ref);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

describe("BrowserStore media", () => {
  beforeEach(() => {
    // jsdom has no object URLs; stub them to observable values.
    let n = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:mock/${n++}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("saveMedia mints a well-formed ref under the note and persists the bytes", async () => {
    const media = memMediaStore();
    const store = new BrowserStore(media);
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const ref = await store.saveMedia("note42", bytes, "png");

    const parsed = parseMediaPath(ref);
    expect(parsed?.noteId).toBe("note42");
    expect(parsed?.ext).toBe("png");
    expect(parsed?.mediaId).toBeTruthy();

    // bytes landed under that exact ref (jsdom's Blob has no arrayBuffer(); size is the
    // faithful check that all bytes were written)
    const stored = media.map.get(ref)!;
    expect(stored).toBeInstanceOf(Blob);
    expect(stored.size).toBe(bytes.byteLength);
  });

  it("saveMedia -> loadMediaUrl round-trips (returns a loadable URL)", async () => {
    const store = new BrowserStore(memMediaStore());
    const ref = await store.saveMedia("n", new Uint8Array([9, 9, 9]), "jpg");
    const url = await store.loadMediaUrl(ref);
    expect(url).toMatch(/^blob:mock\//);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("gives each saved image a distinct ref", async () => {
    const store = new BrowserStore(memMediaStore());
    const a = await store.saveMedia("n", new Uint8Array([1]), "png");
    const b = await store.saveMedia("n", new Uint8Array([2]), "png");
    expect(a).not.toBe(b);
  });

  it("loadMediaUrl returns null for a missing ref", async () => {
    const store = new BrowserStore(memMediaStore());
    expect(await store.loadMediaUrl("media/n/missing.png")).toBeNull();
  });

  it("removeMedia deletes the bytes", async () => {
    const media = memMediaStore();
    const store = new BrowserStore(media);
    const ref = await store.saveMedia("n", new Uint8Array([7]), "png");
    await store.removeMedia(ref);
    expect(media.map.has(ref)).toBe(false);
    expect(await store.loadMediaUrl(ref)).toBeNull();
  });
});
