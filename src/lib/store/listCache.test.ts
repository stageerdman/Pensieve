import { describe, expect, it } from "vitest";
import {
  LIST_CACHE_VERSION,
  emptyListCache,
  knownStamps,
  mergeListing,
  parseListCache,
  type NoteRecord,
} from "./listCache";
import { excerptFromMarkdown, contentCharCount } from "../text";

const meta = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  createdAt: 1,
  updatedAt: 2,
  ...extra,
});

const FILE = "---\ntags: [a]\nlinks: [x1, x2]\nicon: beaker/h43\nform: true\n---\n\n# Hello\nThe body *text* here.";

describe("listCache", () => {
  it("cold: derives every field from the body and marks the cache dirty", () => {
    const recs: NoteRecord[] = [{ id: "n1", meta: meta("Hello", { tags: ["a"], pinned: true }), stamp: [10, 99], md: FILE }];
    const m = mergeListing(recs, emptyListCache());
    expect(m.misses).toBe(1);
    expect(m.dirty).toBe(true);
    const n = m.metas[0];
    expect(n).toMatchObject({ id: "n1", title: "Hello", tags: ["a"], pinned: true, starred: false, links: ["x1", "x2"], openCount: 0 });
    expect(n.icon).toBeDefined();
    expect(n.extra).toEqual({ form: "true" });
    const body = "# Hello\nThe body *text* here.";
    expect(n.excerpt).toBe(excerptFromMarkdown(body));
    expect(n.chars).toBe(contentCharCount(body));
    expect(m.cache.notes.n1.st).toEqual([10, 99]);
  });

  it("warm: a record without a body is served from the cache, identically, and nothing is dirty", () => {
    const cold = mergeListing([{ id: "n1", meta: meta("Hello"), stamp: [10, 99], md: FILE }], emptyListCache());
    // Round-trip through disk to prove the persisted form is enough.
    const cache = parseListCache(JSON.stringify(cold.cache));
    const warm = mergeListing([{ id: "n1", meta: meta("Hello"), stamp: [10, 99], md: null }], cache);
    expect(warm.misses).toBe(0);
    expect(warm.dirty).toBe(false);
    expect(warm.metas).toEqual(cold.metas);
  });

  it("a changed file (body resent) is recomputed; a deleted note is pruned", () => {
    const cold = mergeListing(
      [
        { id: "a", meta: meta("A"), stamp: [1, 1], md: "# A\nold" },
        { id: "b", meta: meta("B"), stamp: [1, 1], md: "# B\nb" },
      ],
      emptyListCache(),
    );
    const next = mergeListing([{ id: "a", meta: meta("A"), stamp: [2, 5], md: "# A\nnew words" }], cold.cache);
    expect(next.metas.map((n) => n.excerpt)).toEqual(["new words"]);
    expect(Object.keys(next.cache.notes)).toEqual(["a"]);
    expect(next.dirty).toBe(true);
    // Pruning alone (no recompute) still dirties the cache.
    const pruneOnly = mergeListing([{ id: "a", meta: meta("A"), stamp: [2, 5], md: null }], {
      ...next.cache,
      notes: { ...next.cache.notes, gone: next.cache.notes.a },
    });
    expect(pruneOnly.misses).toBe(0);
    expect(pruneOnly.dirty).toBe(true);
  });

  it("skips a note with no sidecar, and one with neither body nor cache entry", () => {
    const m = mergeListing(
      [
        { id: "nometa", meta: null, stamp: [1, 1], md: "# x" },
        { id: "vanished", meta: meta("V"), stamp: null, md: null },
      ],
      emptyListCache(),
    );
    expect(m.metas).toEqual([]);
    // The body was still derived for nometa, so its entry is kept for when the sidecar lands.
    expect(Object.keys(m.cache.notes)).toEqual(["nometa"]);
  });

  it("tolerates a missing, corrupt, or old-version cache file", () => {
    expect(parseListCache(null).notes).toEqual({});
    expect(parseListCache("{oops").notes).toEqual({});
    expect(parseListCache(JSON.stringify({ v: LIST_CACHE_VERSION - 1, notes: { a: {} } })).notes).toEqual({});
    const good = { v: LIST_CACHE_VERSION, notes: { a: { st: [1, 2], links: [], excerpt: "", chars: 0 } } };
    expect(knownStamps(parseListCache(JSON.stringify(good)))).toEqual({ a: [1, 2] });
  });
});
