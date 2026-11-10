import { describe, expect, it } from "vitest";
import { mediaContentType, rawIdFromItem, remoteRawName } from "./adapter";
import type { RemoteItem } from "./types";

describe("mediaContentType", () => {
  it("maps common image extensions", () => {
    expect(mediaContentType("media/1/a.png")).toBe("image/png");
    expect(mediaContentType("media/1/a.JPG")).toBe("image/jpeg");
  });

  it("maps common audio extensions — a missing/wrong type here is exactly why only some recordings played (see vault.ts's writeMediaBytes)", () => {
    expect(mediaContentType("media/1/a.m4a")).toBe("audio/mp4");
    expect(mediaContentType("media/1/a.mp3")).toBe("audio/mpeg");
    expect(mediaContentType("media/1/a.wav")).toBe("audio/wav");
    expect(mediaContentType("media/1/a.webm")).toBe("audio/webm");
  });

  it("falls back to a generic octet-stream for an unknown extension (e.g. a transcript sidecar)", () => {
    expect(mediaContentType("media/1/a.m4a.transcript.json")).toBe("application/octet-stream");
  });
});

describe("rawIdFromItem — Raw Memory records are recognised by PARENT PATH, not just name", () => {
  const item = (over: Partial<RemoteItem>): RemoteItem => ({ id: "x", name: "r1.json", ...over });

  it("recognises a record directly inside the raw/ subfolder", () => {
    expect(rawIdFromItem(item({ parentReference: { path: "/drive/root:/Pensieve/raw" } }))).toBe("r1");
  });

  it("rejects a .json file anywhere else (e.g. the root, or a note's own folder)", () => {
    expect(rawIdFromItem(item({ parentReference: { path: "/drive/root:/Pensieve" } }))).toBeNull();
    expect(rawIdFromItem(item({ parentReference: { path: "/drive/root:/Pensieve/media/note1" } }))).toBeNull();
  });

  it("rejects a non-.json name even inside raw/", () => {
    expect(rawIdFromItem(item({ name: "r1.md", parentReference: { path: "/drive/root:/Pensieve/raw" } }))).toBeNull();
  });

  it("rejects a folder entry and a tombstone with no parentReference", () => {
    expect(rawIdFromItem(item({ folder: {}, parentReference: { path: "/drive/root:/Pensieve/raw" } }))).toBeNull();
    expect(rawIdFromItem({ id: "x", name: "r1.json", deleted: {} })).toBeNull();
  });

  it("remoteRawName round-trips the id", () => {
    expect(remoteRawName("r1")).toBe("raw/r1.json");
  });
});
