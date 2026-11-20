import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutosave } from "./useAutosave";
import type { Note } from "../types";

function setup(note: Note, html: string) {
  const body = document.createElement("div");
  body.innerHTML = html;
  const cb = { onInsert: vi.fn(), onRender: vi.fn(), onDirty: vi.fn() };
  const { result } = renderHook(() =>
    useAutosave({ current: body }, { current: document.createElement("span") }, { current: note }, cb),
  );
  return { autosave: result.current, cb };
}

const synced = (): Note => ({ id: "n", t: "Title", c: "Body", updatedAt: 100 }) as Note;

describe("useAutosave.commit", () => {
  it("closing an unchanged memory is a no-op: no updatedAt bump, no dirty (regression: it made sync see a phone edit and stop pulling the computer's rename)", () => {
    const note = synced();
    const { autosave, cb } = setup(note, "<h1>Title</h1><p>Body</p>");
    autosave.commit();
    expect(note.updatedAt).toBe(100);
    expect(cb.onDirty).not.toHaveBeenCalled();
  });

  it("a real edit still saves and marks dirty", () => {
    const note = synced();
    const { autosave, cb } = setup(note, "<h1>Renamed</h1><p>Body</p>");
    autosave.commit();
    expect(note.t).toBe("Renamed");
    expect(note.updatedAt).toBeGreaterThan(100);
    expect(cb.onDirty).toHaveBeenCalledOnce();
  });
});
