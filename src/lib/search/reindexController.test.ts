import { describe, it, expect, vi } from "vitest";
import { reindex } from "./reindexController";

describe("reindexController", () => {
  it("delivers a requested note id to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = reindex.subscribe(a);
    const offB = reindex.subscribe(b);
    reindex.request("note-7");
    expect(a).toHaveBeenCalledWith("note-7");
    expect(b).toHaveBeenCalledWith("note-7");
    offA();
    offB();
  });

  it("stops delivering after unsubscribe", () => {
    const cb = vi.fn();
    const off = reindex.subscribe(cb);
    off();
    reindex.request("note-9");
    expect(cb).not.toHaveBeenCalled();
  });

  it("ignores an empty note id (nothing to re-index)", () => {
    const cb = vi.fn();
    const off = reindex.subscribe(cb);
    reindex.request("");
    expect(cb).not.toHaveBeenCalled();
    off();
  });
});
