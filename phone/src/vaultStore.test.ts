// The phone vault moved from localStorage (~5 MB cap, silently failing past it) to
// IndexedDB. These lock in the one-time migration and the write-through behaviour —
// the paths that could lose the owner's notes.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import {
  hydrateVault,
  loadVault,
  persistVault,
  clearVault,
  vaultWritesSettled,
  __resetVaultForTests,
} from "./vaultStore";
import type { Note } from "./types";

const KEY = "pensieve.phone.vault";
const note = (id: string, c = "body"): Note => ({ id, t: id, c } as unknown as Note);

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); // a fresh, empty IndexedDB per test
  localStorage.clear();
  __resetVaultForTests();
});

/** Simulate an app restart: drop in-memory state, keep IndexedDB + localStorage. */
async function reboot() {
  await vaultWritesSettled();
  __resetVaultForTests();
  await hydrateVault();
}

describe("phone vault — IndexedDB storage", () => {
  it("moves an existing localStorage vault into IndexedDB once, then removes the old key", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("a"), note("b")]));
    await hydrateVault();
    expect(loadVault().map((n) => n.id)).toEqual(["a", "b"]);
    expect(localStorage.getItem(KEY)).toBeNull();
    await reboot();
    expect(loadVault().map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("persists writes across a restart", async () => {
    await hydrateVault();
    persistVault([note("x"), note("y")]);
    expect(loadVault().map((n) => n.id)).toEqual(["x", "y"]); // visible immediately
    await reboot();
    expect(loadVault().map((n) => n.id)).toEqual(["x", "y"]);
  });

  it("holds far more than localStorage's ~5 MB (the Notion import is ~7 MB)", async () => {
    await hydrateVault();
    const big = "x".repeat(4000);
    const many = Array.from({ length: 2500 }, (_, i) => note(`n${i}`, big)); // ~10 MB
    persistVault(many);
    await reboot();
    expect(loadVault()).toHaveLength(2500);
  });

  it("the newest of several quick writes wins", async () => {
    await hydrateVault();
    for (let i = 0; i < 20; i++) persistVault([note(`v${i}`)]);
    await reboot();
    expect(loadVault().map((n) => n.id)).toEqual(["v19"]);
  });

  it("returns fresh objects each call (callers mutate what they load)", async () => {
    await hydrateVault();
    persistVault([note("m", "orig")]);
    const a = loadVault();
    (a[0] as unknown as { c: string }).c = "mutated";
    expect((loadVault()[0] as unknown as { c: string }).c).toBe("orig");
  });

  it("a leftover localStorage vault (a previous boot fell back to it) beats the IndexedDB copy", async () => {
    await hydrateVault();
    persistVault([note("old")]);
    await vaultWritesSettled();
    __resetVaultForTests();
    localStorage.setItem(KEY, JSON.stringify([note("newer")]));
    await hydrateVault();
    expect(loadVault().map((n) => n.id)).toEqual(["newer"]);
  });

  it("clearVault empties the hydrated vault", async () => {
    await hydrateVault();
    persistVault([note("a")]);
    clearVault();
    await reboot();
    expect(loadVault()).toEqual([]);
  });

  it("without hydration (IndexedDB unavailable) it keeps the old localStorage behaviour", () => {
    persistVault([note("ls")]);
    expect(JSON.parse(localStorage.getItem(KEY)!)[0].id).toBe("ls");
    expect(loadVault().map((n) => n.id)).toEqual(["ls"]);
  });
});
