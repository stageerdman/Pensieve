import { describe, it, expect, beforeEach } from "vitest";
import { BrowserStore } from "./browser";

describe("BrowserStore", () => {
  let store: BrowserStore;
  beforeEach(() => {
    localStorage.clear();
    store = new BrowserStore();
  });

  const tick = () => new Promise((r) => setTimeout(r, 2));

  it("creates, loads, and lists notes newest-first", async () => {
    const a = await store.create();
    const b = await store.create();
    await store.save({ ...a, markdown: "# Alpha\n\nbody" });
    await tick(); // ensure distinct updatedAt (real saves are seconds apart)
    await store.save({ ...b, markdown: "# Beta" });

    const loaded = await store.load(a.id);
    expect(loaded?.title).toBe("Alpha");

    const list = await store.list();
    expect(list).toHaveLength(2);
    // b saved last → newest first
    expect(list[0].id).toBe(b.id);
  });

  it("derives the title from the first line on save", async () => {
    const n = await store.create();
    await store.save({ ...n, markdown: "## Deadlines\nmore" });
    expect((await store.load(n.id))?.title).toBe("Deadlines");
  });

  it("removes notes and their timeline", async () => {
    const n = await store.create();
    await store.appendTimeline(n.id, { ts: 1, wordDelta: 5, created: true });
    expect(await store.loadTimeline(n.id)).toHaveLength(1);
    await store.remove(n.id);
    expect(await store.load(n.id)).toBeNull();
    expect(await store.loadTimeline(n.id)).toHaveLength(0);
  });

  it("appends timeline entries in order", async () => {
    const n = await store.create();
    await store.appendTimeline(n.id, { ts: 1, wordDelta: 5, created: true });
    await store.appendTimeline(n.id, { ts: 2, wordDelta: 10 });
    const t = await store.loadTimeline(n.id);
    expect(t.map((e) => e.wordDelta)).toEqual([5, 10]);
  });
});
