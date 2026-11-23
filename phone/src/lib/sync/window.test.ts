import { describe, expect, it } from "vitest";
import { WINDOW_MS, inWindow, parseNotesIndex, planBringIn, planForget, planForgetMedia, type WindowCtx } from "./window";
import type { NoteSyncRecord } from "./types";

const NOW = 1_800_000_000_000;
const OLD = NOW - WINDOW_MS - 1;
const RECENT = NOW - 1000;
const rec = (id: string, localUpdatedAt = 10, extra: Partial<NoteSyncRecord> = {}): NoteSyncRecord => ({
  id, remoteId: "r" + id, cTag: "c", localUpdatedAt, syncedAt: 1, ...extra,
});
const ctx = (index: Array<{ id: string; c: number; o?: number }>, opens: Record<string, number> = {}): WindowCtx => ({
  now: NOW,
  index: new Map(index.map((e) => [e.id, { t: "", u: 0, ...e }])),
  opens,
});

describe("window", () => {
  it("keeps a memory created, desktop-opened or phone-opened inside 14 days", () => {
    const c = ctx([{ id: "a", c: RECENT }, { id: "b", c: OLD, o: RECENT }, { id: "p", c: OLD }, { id: "x", c: OLD }], { p: RECENT });
    expect(["a", "b", "p", "x"].map((id) => inWindow(id, c))).toEqual([true, true, true, false]);
  });

  it("prefers the desktop's original createdAt over the phone copy's", () => {
    expect(inWindow("a", ctx([{ id: "a", c: OLD }]), RECENT)).toBe(false);
    expect(inWindow("new", ctx([]), RECENT)).toBe(true); // not indexed yet → local createdAt
  });

  it("forgets only clean, synced, unprotected, non-draft memories outside the window", () => {
    const c = ctx(["clean", "dirty", "never", "draft", "shown", "fresh"].map((id) => ({ id, c: id === "fresh" ? RECENT : OLD })));
    const local = [
      { id: "clean", updatedAt: 10 },
      { id: "dirty", updatedAt: 11 }, // edited since last sync
      { id: "never", updatedAt: 10 }, // no record
      { id: "draft", updatedAt: 10, draft: "f1" },
      { id: "shown", updatedAt: 10 },
      { id: "fresh", updatedAt: 10 },
    ];
    const records = { clean: rec("clean"), dirty: rec("dirty"), draft: rec("draft"), shown: rec("shown"), fresh: rec("fresh") };
    expect(planForget(local, records, c, new Set(["shown"]))).toEqual(["clean"]);
  });

  it("never forgets a form, however long since it was opened", () => {
    const c = ctx([{ id: "form", c: OLD }, { id: "plain", c: OLD }]);
    const local = [
      { id: "form", updatedAt: 10, form: true },
      { id: "plain", updatedAt: 10 },
    ];
    expect(planForget(local, { form: rec("form"), plain: rec("plain") }, c)).toEqual(["plain"]);
  });

  it("brings in window memories that aren't here, but never resurrects a pending phone delete", () => {
    const c = ctx([{ id: "gone", c: RECENT }, { id: "deleted", c: RECENT }, { id: "here", c: RECENT }, { id: "old", c: OLD }]);
    const records = { gone: rec("gone", 0, { remoteOnly: true }), deleted: rec("deleted"), here: rec("here") };
    expect(planBringIn(new Set(["here"]), records, c)).toEqual(["gone"]);
  });

  it("frees media only when no kept memory uses it and it's backed up", () => {
    expect(planForgetMedia(["a", "b", "c", "a"], new Set(["b"]), (r) => r !== "c")).toEqual(["a"]);
  });

  it("rejects an index format it doesn't understand", () => {
    expect(parseNotesIndex('{"v":2,"notes":[]}')).toBeNull();
    expect(parseNotesIndex("nope")).toBeNull();
    expect(parseNotesIndex('{"v":1,"notes":[{"id":"a","t":"A","c":1,"u":1},{"bad":1}]}')).toHaveLength(1);
  });
});
