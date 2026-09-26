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
});
