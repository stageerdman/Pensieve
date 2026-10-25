import { beforeEach, describe, expect, it } from "vitest";
import { phoneVault } from "./vault";
import { persistVault } from "../../vaultStore";
import type { Note } from "../../types";

const NOTE: Note = {
  id: "n1",
  t: "Hello",
  c: "World",
  cat: "--cat-blue",
  shape: "vial",
  fill: 0.3,
  d: "Today",
  created: "Today",
  createdAt: 1000,
  updatedAt: 2000,
};

beforeEach(() => {
  localStorage.clear();
});

describe("phoneVault", () => {
  it("listNotes reflects what's in the vault", async () => {
    persistVault([NOTE]);
    const vault = phoneVault();
    expect(await vault.listNotes()).toEqual([{ id: "n1", updatedAt: 2000 }]);
  });

  it("readNote composes the markdown .md for an existing note, null for a missing one", async () => {
    persistVault([NOTE]);
    const vault = phoneVault();
    expect((await vault.readNote("n1"))?.endsWith("Hello\n\nWorld")).toBe(true);
    expect(await vault.readNote("missing")).toBeNull();
  });

  it("writeNote inserts a new note and makes it readable", async () => {
    persistVault([]); // an explicit empty vault, not "no vault yet" (which falls back to seed)
    const vault = phoneVault();
    await vault.writeNote("new1", "Title\n\nBody", { createdAt: 10, updatedAt: 20 });
    const notes = await vault.listNotes();
    expect(notes).toEqual([{ id: "new1", updatedAt: 20 }]);
    expect((await vault.readNote("new1"))?.endsWith("Title\n\nBody")).toBe(true);
  });

  it("writeNote on an existing id updates it in place rather than duplicating", async () => {
    persistVault([NOTE]);
    const vault = phoneVault();
    await vault.writeNote("n1", "Hello\n\nEdited", { updatedAt: 3000 });
    const notes = await vault.listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ id: "n1", updatedAt: 3000 });
  });

  it("deleteNote removes it", async () => {
    persistVault([NOTE]);
    const vault = phoneVault();
    await vault.deleteNote("n1");
    expect(await vault.listNotes()).toEqual([]);
  });

  it("readState/writeState round-trip, defaulting to empty when absent", async () => {
    const vault = phoneVault();
    expect(await vault.readState()).toEqual({ deltaLink: null, notes: {}, media: {}, lastSyncedAt: null });
    const state = {
      deltaLink: "abc",
      notes: { n1: { id: "n1", remoteId: "r1", cTag: "t1", localUpdatedAt: 1, syncedAt: 2 } },
      media: {},
      lastSyncedAt: 42,
    };
    await vault.writeState(state);
    expect(await vault.readState()).toEqual(state);
  });
});
