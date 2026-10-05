import { describe, it, expect, beforeEach } from "vitest";
import { BrowserStore } from "./browser";

describe("BrowserStore", () => {
  let store: BrowserStore;
  beforeEach(() => {
    localStorage.clear();
    store = new BrowserStore();
  });

  const tick = () => new Promise((r) => setTimeout(r, 2));

  it("creates, loads, and lists notes (order is a view concern, see sidebar/arrange)", async () => {
    const a = await store.create();
    const b = await store.create();
    await store.save({ ...a, markdown: "# Alpha\n\nbody" });
    await tick(); // ensure distinct updatedAt (real saves are seconds apart)
    await store.save({ ...b, markdown: "# Beta" });

    const loaded = await store.load(a.id);
    expect(loaded?.title).toBe("Alpha");

    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("surfaces pinned state and a body excerpt in the list", async () => {
    const n = await store.create();
    await store.save({ ...n, markdown: "# Title\n\nThe body preview text.", pinned: true });
    const [meta] = await store.list();
    expect(meta.pinned).toBe(true);
    expect(meta.excerpt).toBe("The body preview text.");
  });

  it("derives the title from the first line on save", async () => {
    const n = await store.create();
    await store.save({ ...n, markdown: "## Deadlines\nmore" });
    expect((await store.load(n.id))?.title).toBe("Deadlines");
  });

  it("keeps addedAt immutable when createdAt is edited", async () => {
    const n = await store.create();
    const added = n.addedAt;
    await store.save({ ...n, markdown: "# Note", createdAt: 1000 }); // backdate creation
    const loaded = await store.load(n.id);
    expect(loaded?.createdAt).toBe(1000);
    expect(loaded?.addedAt).toBe(added); // the real log time is preserved
  });

  it("setPinned toggles pin state without changing updatedAt", async () => {
    const n = await store.create();
    await store.save({ ...n, markdown: "# Note" });
    const before = (await store.load(n.id))!.updatedAt;
    await tick();
    await store.setPinned(n.id, true);
    const after = await store.load(n.id);
    expect(after?.pinned).toBe(true);
    expect(after?.updatedAt).toBe(before); // pinning is not an edit
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
