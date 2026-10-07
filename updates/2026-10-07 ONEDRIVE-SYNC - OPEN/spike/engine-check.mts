// Phase 3+4 integration check — drives the REAL engine (src/lib/sync/engine.ts)
// against the live OneDrive with an in-memory vault, simulating a two-device flow:
// push a note, let "another device" edit it remotely, pull it, then force a
// both-changed conflict. Cleans up the test notes at the end.
//
// Run:  npx tsx "updates/2026-10-07 ONEDRIVE-SYNC - OPEN/spike/engine-check.mts"

import { execFileSync } from "node:child_process";
import { makeGraphClient, type TokenProvider } from "../../../src/lib/sync/graph.ts";
import { refreshAccessToken } from "../../../src/lib/sync/oauth.ts";
import { sync } from "../../../src/lib/sync/engine.ts";
import * as A from "../../../src/lib/sync/adapter.ts";
import type { LocalVault, LocalNoteInfo, WriteTimes } from "../../../src/lib/sync/vault.ts";
import { EMPTY_SYNC_STATE, type AzureConfig, type SyncState } from "../../../src/lib/sync/types.ts";

const SERVICE = "xyz.erdman.pensieve.sync";
const read = (a: string) =>
  execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", a, "-w"]).toString().trim();
const cfg: AzureConfig = JSON.parse(read("azure-config"));
let refresh = read("refresh-token");
let cached: { token: string; exp: number } | null = null;
const provider: TokenProvider = {
  async getToken() {
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
    const r = await refreshAccessToken(cfg, refresh);
    if (r.refresh_token) refresh = r.refresh_token;
    cached = { token: r.access_token, exp: Date.now() + r.expires_in * 1000 };
    return r.access_token;
  },
  invalidate() {
    cached = null;
  },
};
const graph = makeGraphClient(provider);

class MemVault implements LocalVault {
  notes = new Map<string, { content: string; updatedAt: number }>();
  state: SyncState = { ...EMPTY_SYNC_STATE, notes: {} };
  async listNotes(): Promise<LocalNoteInfo[]> {
    return [...this.notes].map(([id, n]) => ({ id, updatedAt: n.updatedAt }));
  }
  async readNote(id: string) {
    return this.notes.get(id)?.content ?? null;
  }
  async writeNote(id: string, content: string, t?: WriteTimes) {
    this.notes.set(id, { content, updatedAt: t?.updatedAt ?? Date.now() });
  }
  async deleteNote(id: string) {
    this.notes.delete(id);
  }
  async readState() {
    return JSON.parse(JSON.stringify(this.state)) as SyncState;
  }
  async writeState(s: SyncState) {
    this.state = JSON.parse(JSON.stringify(s)) as SyncState;
  }
}

let pass = 0,
  fail = 0;
const check = (l: string, ok: boolean) => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${l}`);
  ok ? pass++ : fail++;
};

const id = "__engine_check__-" + Math.random().toString(36).slice(2, 8);
const name = `${id}.md`;
const vault = new MemVault();

try {
  // 1. push a new local note
  vault.notes.set(id, { content: "# engine check\n\nv1 local\n", updatedAt: Date.now() });
  let r = await sync(graph, vault);
  check("push: new note sent to remote", r.pushed.includes(id));
  const dl1 = await A.downloadNote(graph, name);
  check("push: remote content matches local", dl1?.content === "# engine check\n\nv1 local\n");

  // 2. second sync is a no-op (echo not re-pulled/pushed)
  r = await sync(graph, vault);
  check("idempotent: second sync does nothing", r.pushed.length === 0 && r.pulled.length === 0);

  // 3. "another device" edits remotely → pull applies it
  await A.uploadNote(graph, id, "# engine check\n\nv2 from other device\n", dl1?.item.cTag);
  r = await sync(graph, vault);
  check("pull: remote-only edit applied locally", r.pulled.includes(id));
  check("pull: local now has the remote content", vault.notes.get(id)?.content === "# engine check\n\nv2 from other device\n");

  // 4. force a both-changed conflict: edit locally AND remotely, then sync
  vault.notes.set(id, { content: "# engine check\n\nv3 local edit\n", updatedAt: Date.now() + 5_000 });
  const cur = await A.downloadNote(graph, name);
  await A.uploadNote(graph, id, "# engine check\n\nv3 remote edit\n", cur?.item.cTag);
  r = await sync(graph, vault);
  check("conflict: both-changed reported once", r.conflicts.length === 1 && r.conflicts[0].reason === "both-changed");
  check("conflict: local copy left untouched", vault.notes.get(id)?.content === "# engine check\n\nv3 local edit\n");

  // 5. local delete propagates to remote (resolve the conflict by overwriting first)
  vault.state.notes[id].cTag = (await A.downloadNote(graph, name))!.item.cTag!;
  vault.state.notes[id].localUpdatedAt = vault.notes.get(id)!.updatedAt;
  vault.notes.delete(id);
  r = await sync(graph, vault);
  check("delete: local deletion propagated to remote", r.pushedDeletes.includes(id));
  check("delete: remote file gone", (await A.downloadNote(graph, name)) === null);
} finally {
  await A.deleteNote(graph, id).catch(() => {});
}

console.log(`\nDONE — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
