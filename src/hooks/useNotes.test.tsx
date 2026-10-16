import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNotes } from "./useNotes";
import { getStore } from "../lib/store";

// Integration test: exercises the real create → type → autosave → session-close →
// timeline pipeline end to end through the hook and the browser store.
describe("useNotes (integration)", () => {
  beforeEach(() => localStorage.clear());

  it("creates a note, autosaves edits, and records a timeline addition on switch", async () => {
    const store = getStore();
    const { result } = renderHook(() => useNotes());

    // Create note A and write into it.
    await act(async () => {
      await result.current.create();
    });
    const aId = result.current.current!.id;

    await act(async () => {
      result.current.change("# Hello\n\nworld words here");
    });

    // Debounced autosave persists the content.
    await waitFor(
      async () => {
        const a = await store.load(aId);
        expect(a?.markdown).toContain("Hello");
        expect(a?.title).toBe("Hello");
      },
      { timeout: 1500 },
    );

    // Switching to a new note flushes + closes A's session, recording one addition.
    await act(async () => {
      await result.current.create();
    });

    const timeline = await store.loadTimeline(aId);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].created).toBe(true);
    expect(timeline[0].wordDelta).toBe(4); // Hello, world, words, here

    // Both notes now show in the list.
    expect(result.current.notes).toHaveLength(2);
  });

  it("restores a past version and drops newer ones (destructive, body + history)", async () => {
    const store = getStore();
    const { result } = renderHook(() => useNotes());

    await act(async () => {
      await result.current.create();
    });
    const id = result.current.current!.id;

    // Session 1: write v1, switch away (closes + snapshots session 1), reopen.
    await act(async () => {
      result.current.change("version one body");
    });
    await act(async () => {
      await result.current.create(); // switch away → closes + snapshots session 1
    });
    await act(async () => {
      await result.current.open(id); // reopen the note → new session baselined on v1
    });

    // Session 2: write v2 and close it too.
    await act(async () => {
      result.current.change("version two body is longer now");
    });
    await act(async () => {
      await result.current.create();
    });
    await act(async () => {
      await result.current.open(id);
    });

    const before = await store.loadTimeline(id);
    expect(before.length).toBe(2);
    const v1 = before[0];
    expect(v1.markdown).toBe("version one body");

    const epochBefore = result.current.loadEpoch;

    // Restore v1 → body reverts, v2 is deleted, editor remount epoch bumps.
    await act(async () => {
      await result.current.restoreVersion(v1.ts);
    });

    expect(result.current.current!.markdown).toBe("version one body");
    expect(result.current.loadEpoch).toBe(epochBefore + 1);

    const after = await store.loadTimeline(id);
    expect(after).toHaveLength(1); // v2 dropped
    expect(after[0].markdown).toBe("version one body");

    const saved = await store.load(id);
    expect(saved?.markdown).toBe("version one body");
  });

  it("derives linkedByCount — how many other memories link to each note", async () => {
    const store = getStore();
    // Seed: B and C both link to A; A links to nothing. So A has 2 backlinks, B/C have 0.
    const a = await store.create();
    const b = await store.create();
    const c = await store.create();
    await store.save({ ...b, markdown: "# B", links: [a.id] });
    await store.save({ ...c, markdown: "# C", links: [a.id] });

    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(3));

    const byId = new Map(result.current.notes.map((n) => [n.id, n]));
    expect(byId.get(a.id)!.linkedByCount).toBe(2);
    expect(byId.get(b.id)!.linkedByCount).toBe(0);
    expect(byId.get(c.id)!.linkedByCount).toBe(0);
  });

  it("recordOpen bumps a note's openCount in the live list", async () => {
    const store = getStore();
    const a = await store.create();
    await store.save({ ...a, markdown: "# A" });

    const { result } = renderHook(() => useNotes());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    await act(async () => {
      await result.current.recordOpen(a.id);
    });
    expect(result.current.notes.find((n) => n.id === a.id)!.openCount).toBe(1);
  });
});
