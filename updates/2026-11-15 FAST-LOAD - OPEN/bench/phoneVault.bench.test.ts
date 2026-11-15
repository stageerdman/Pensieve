// FAST-LOAD P3 bench — phone vault boot + a simulated 2,000-note OneDrive pull, BEFORE vs AFTER.
// Opt-in (skipped in `npm test`):
//   BENCH=1 npx vitest run "updates/2026-11-15 FAST-LOAD - OPEN/bench"
// BEFORE = the pre-FAST-LOAD vaultStore (copied verbatim to vaultStore.before.ts) driven exactly the
// way the old lib/sync/vault.ts did (loadVault() per get/put/remove). AFTER = the real modules.
// jsdom + fake-indexeddb, so absolute numbers are a desktop-CPU proxy, not iPhone timings — the
// ratio is the point.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createElement, createRef } from "react";
import * as before from "./vaultStore.before";
import * as after from "../../../phone/src/vaultStore";
import { phoneVault } from "../../../phone/src/lib/sync/vault";
import { noteFromRemoteContent, noteToRemoteContent } from "../../../phone/src/lib/sync/noteFormat";
import { Reel } from "../../../phone/src/components/reel/Reel";
import type { Note } from "../../../phone/src/types";

const N_VAULT = 2090; // the real post-Notion-import vault
const N_PULL = 2000;
const DAY = 86_400_000;
const NOW = Date.now();

function mkNote(i: number): Note {
  const body = `Entry ${i}. ` + "Some journal thought about the day, a lesson, a plan. ".repeat(62); // ~3.4 KB
  const t = NOW - i * DAY * 0.6;
  return {
    id: `n${i.toString(36)}-${i}`,
    t: `Memory ${i}`,
    c: body,
    cat: "--cat-blue",
    shape: "vial",
    fill: 0.5,
    d: "Earlier",
    created: "Earlier",
    createdAt: t,
    updatedAt: t,
    foreign: { categories: ["Journal"], tags: ["life"], links: [], pinned: false, iconColor: "blue" },
  } as Note;
}

const ms = (t0: number) => Math.round(performance.now() - t0);

function fresh() {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  before.__resetVaultForTests();
  after.__resetVaultForTests();
}

describe.skipIf(!process.env.BENCH)("FAST-LOAD phone bench", () => {
  const vaultNotes = Array.from({ length: N_VAULT }, (_, i) => mkNote(i));
  const remote = Array.from({ length: N_PULL }, (_, i) => mkNote(i)).map((n) => ({
    id: n.id,
    content: noteToRemoteContent(n),
    times: { createdAt: n.createdAt, updatedAt: n.updatedAt },
  }));

  it("BEFORE — single-key vault", async () => {
    fresh();
    await before.hydrateVault();
    before.persistVault(vaultNotes);
    await before.vaultWritesSettled();
    before.__resetVaultForTests();

    let t0 = performance.now();
    await before.hydrateVault();
    const data = before.loadVault();
    const tHydrate = ms(t0);
    t0 = performance.now();
    render(createElement(Reel, { view: data, queryText: "", onOpen: () => {}, reelRef: createRef(), trackRef: createRef() }));
    const tRender = ms(t0);
    cleanup();

    // the old lib/sync/vault.ts: loadVault() per op
    fresh();
    await before.hydrateVault();
    before.persistVault([]);
    t0 = performance.now();
    const limit = Number(process.env.BENCH_BEFORE_PULL || N_PULL);
    for (const r of remote.slice(0, limit)) {
      before.loadVault().find((n) => n.id === r.id); // engine reads before a write (readNote)
      const d = before.loadVault();
      const i = d.findIndex((n) => n.id === r.id);
      const note = noteFromRemoteContent(r.id, r.content, r.times, i >= 0 ? d[i] : undefined);
      if (i >= 0) d[i] = note;
      else d.unshift(note);
      before.persistVault(d);
      await Promise.resolve();
    }
    await before.vaultWritesSettled();
    const tPull = ms(t0);
    console.log(
      `BEFORE  boot hydrate+load=${tHydrate}ms  first render (all ${data.length} cards)=${tRender}ms  pull ${limit} notes=${tPull}ms`,
    );
  }, 600_000);

  it("AFTER — per-note vault + windowed reel", async () => {
    fresh();
    await after.hydrateVault();
    after.persistVault(vaultNotes);
    await after.vaultWritesSettled();
    after.__resetVaultForTests();

    let t0 = performance.now();
    await after.hydrateVault();
    const data = after.loadVault();
    const tHydrate = ms(t0);
    t0 = performance.now();
    render(createElement(Reel, { view: data, queryText: "", onOpen: () => {}, reelRef: createRef(), trackRef: createRef() }));
    const tRender = ms(t0);
    const cards = document.querySelectorAll(".card").length;
    cleanup();

    fresh();
    await after.hydrateVault();
    const vault = phoneVault();
    t0 = performance.now();
    for (const r of remote) {
      await vault.readNote(r.id);
      await vault.writeNote(r.id, r.content, r.times);
    }
    await after.vaultWritesSettled();
    const tPull = ms(t0);

    // one edit after the pull — how much does a single save cost now?
    const all = after.loadVault();
    all[5].c += " edited";
    t0 = performance.now();
    after.persistVault(all);
    await after.vaultWritesSettled();
    const tEdit = ms(t0);
    console.log(
      `AFTER   boot hydrate+load=${tHydrate}ms  first render (${cards} cards mounted of ${data.length})=${tRender}ms  pull ${N_PULL} notes=${tPull}ms  one edit persist=${tEdit}ms`,
    );
  }, 600_000);
});
