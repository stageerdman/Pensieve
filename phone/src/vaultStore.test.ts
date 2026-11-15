// The phone vault moved from localStorage (~5 MB cap, silently failing past it) to
// IndexedDB. These lock in the one-time migration and the write-through behaviour —
// the paths that could lose the owner's notes.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hydrateVault,
  loadVault,
  persistVault,
  clearVault,
  getNote,
  putNote,
  vaultWritesSettled,
  __resetVaultForTests,
} from "./vaultStore";
import { phoneVault } from "./lib/sync/vault";
import { noteToRemoteContent } from "./lib/sync/noteFormat";
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

// ---- FAST-LOAD: per-note records, migration from the single-key layout, crash safety ----

/** Build the PRE-FAST-LOAD IndexedDB (v1: one "kv" store, the whole vault as one JSON string). */
function seedSingleKeyDb(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pensieve-phone-vault", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => {
      const t = req.result.transaction("kv", "readwrite");
      t.objectStore("kv").put(value, KEY);
      t.oncomplete = () => (req.result.close(), resolve());
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Read a raw kv value straight from the DB (whatever version it's at). */
function rawKv(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pensieve-phone-vault");
    req.onsuccess = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("kv")) return d.close(), resolve(undefined);
      const g = d.transaction("kv").objectStore("kv").get(key);
      g.onsuccess = () => (d.close(), resolve(g.result));
      g.onerror = () => reject(g.error);
    };
    req.onerror = () => reject(req.error);
  });
}

const sample = (n: number, size = 50) =>
  Array.from({ length: n }, (_, i) => ({ ...note(`k${i}`, "b".repeat(size)), createdAt: n - i, updatedAt: n - i }) as Note);

describe("phone vault — FAST-LOAD per-note layout", () => {
  it("migrates the single-key vault into per-note records, keeping order, and drops the old key", async () => {
    await seedSingleKeyDb(JSON.stringify([note("a"), note("b"), note("c")]));
    await hydrateVault();
    expect(loadVault().map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(await rawKv(KEY)).toBeUndefined();
    await reboot();
    expect(loadVault().map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("a crash mid-migration loses nothing: the old key survives and the next boot migrates", async () => {
    await seedSingleKeyDb(JSON.stringify(sample(40)));
    // the migration transaction dies part-way through writing records
    const real = IDBObjectStore.prototype.put;
    let calls = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === "notes" && ++calls === 20) throw new Error("simulated crash");
      return real.apply(this, args as Parameters<IDBObjectStore["put"]>);
    });
    await hydrateVault();
    spy.mockRestore();
    // this boot fell back to localStorage (empty) — but IndexedDB is untouched:
    expect(typeof (await rawKv(KEY))).toBe("string");
    expect(await rawKv("pensieve.phone.vault.layout")).toBeUndefined();
    __resetVaultForTests();
    await hydrateVault();
    expect(loadVault()).toHaveLength(40);
    expect(await rawKv(KEY)).toBeUndefined();
  });

  it("a corrupt old blob is parked under a backup key, never deleted", async () => {
    await seedSingleKeyDb("{not json");
    await hydrateVault();
    expect(loadVault()).toEqual([]);
    expect(await rawKv("pensieve.phone.vault.corrupt")).toEqual(["{not json"]);
  });

  it("an edit rewrites ONE record, not the whole vault", async () => {
    await hydrateVault();
    persistVault(sample(500));
    await vaultWritesSettled();
    const data = loadVault();
    (data[3] as unknown as { c: string }).c = "edited";
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    persistVault(data);
    await vaultWritesSettled();
    expect(put).toHaveBeenCalledTimes(1);
    put.mockRestore();
    await reboot();
    expect(loadVault()[3].c).toBe("edited");
  });

  it("a whole-array save from the UI never wipes or reverts notes a sync wrote meanwhile", async () => {
    await hydrateVault();
    persistVault([note("a", "a0"), note("b", "b0")]);
    const ui = loadVault(); // the UI's working copy
    putNote(note("pulled", "new from OneDrive")); // a sync pull, behind the UI's back
    putNote(note("b", "b-remote"));
    (ui[0] as unknown as { c: string }).c = "a-edited"; // the owner edits meanwhile
    persistVault(ui);
    await reboot();
    const byId = Object.fromEntries(loadVault().map((n) => [n.id, n.c]));
    expect(byId).toEqual({ pulled: "new from OneDrive", a: "a-edited", b: "b-remote" });
  });

  it("per-note reads are copies too", async () => {
    await hydrateVault();
    putNote(note("m", "orig"));
    (getNote("m") as unknown as { c: string }).c = "mutated";
    expect(getNote("m")!.c).toBe("orig");
  });

  it("a 2,500-note sync pull is linear (was O(n²) — ~47 s for 2,000 in the bench)", async () => {
    await hydrateVault();
    const vault = phoneVault();
    const big = "x".repeat(3000);
    const remote = sample(2500).map((n) => ({ id: n.id, content: noteToRemoteContent({ ...n, c: big, cat: "--cat-blue", shape: "vial" }) }));
    const t0 = performance.now();
    for (const r of remote) {
      await vault.readNote(r.id);
      await vault.writeNote(r.id, r.content, { updatedAt: 1 });
    }
    await vaultWritesSettled();
    const elapsed = performance.now() - t0;
    expect(await vault.listNotes()).toHaveLength(2500);
    expect(elapsed).toBeLessThan(5000);
    await reboot();
    expect(loadVault()).toHaveLength(2500);
  }, 20_000);
});
