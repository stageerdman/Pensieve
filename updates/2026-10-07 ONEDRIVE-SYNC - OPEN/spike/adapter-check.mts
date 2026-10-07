// Phase 2+ integration check — drives the REAL adapter code (src/lib/sync/adapter.ts)
// against the live OneDrive, using the keychain-seeded token. Creates throwaway test
// notes under the real Pensieve folder and deletes them at the end.
//
// Run:  npx tsx "updates/2026-10-07 ONEDRIVE-SYNC - OPEN/spike/adapter-check.mts"

import { execFileSync } from "node:child_process";
import { makeGraphClient, type TokenProvider } from "../../../src/lib/sync/graph.ts";
import { refreshAccessToken } from "../../../src/lib/sync/oauth.ts";
import * as A from "../../../src/lib/sync/adapter.ts";
import { ConflictError, type AzureConfig } from "../../../src/lib/sync/types.ts";

const SERVICE = "xyz.erdman.pensieve.sync";
const read = (acct: string) =>
  execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", acct, "-w"]).toString().trim();

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
const hr = (t: string) => console.log("\n" + "=".repeat(68) + "\n" + t + "\n" + "=".repeat(68));
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${label}`);
  ok ? pass++ : fail++;
};

const id = "__adapter_check__-" + Math.random().toString(36).slice(2, 8);

hr("ensureRoot");
await A.ensureRoot(graph);
check("ensureRoot resolves (Pensieve folder exists)", true);

hr("uploadNote (create)");
const body1 = `# adapter check\n\nfirst write at run ${id}\n`;
const up1 = await A.uploadNote(graph, id, body1);
check("create returned a cTag", !!up1.cTag);

hr("listNotes includes our note");
const list = await A.listNotes(graph);
check("listNotes finds the uploaded note", list.some((i) => i.name === `${id}.md`));
check("listNotes excludes folders/non-.md", list.every((i) => i.name.endsWith(".md")));

hr("downloadNote is byte-exact");
const dl = await A.downloadNote(graph, `${id}.md`);
check("download returns content", !!dl);
check("content byte-exact with what we wrote", dl?.content === body1);

hr("conditional upload with CORRECT cTag → succeeds, cTag bumps");
const body2 = body1 + "second write, conditional\n";
const up2 = await A.uploadNote(graph, id, body2, up1.cTag);
check("conditional write accepted", !!up2.cTag);
check("cTag changed after write", up2.cTag !== up1.cTag);

hr("conditional upload with STALE cTag → ConflictError (no silent clobber)");
let conflicted = false;
try {
  await A.uploadNote(graph, id, body2 + "must not win\n", up1.cTag /* stale now */);
} catch (e) {
  conflicted = e instanceof ConflictError;
}
check("stale conditional write threw ConflictError", conflicted);

hr("delta sees our changes then settles");
const base = await A.delta(graph, null);
check("baseline delta returned a deltaLink", !!base.deltaLink);
const probeId = id + "-probe";
await A.uploadNote(graph, probeId, "# probe\n");
const since = await A.delta(graph, base.deltaLink);
const names = since.items.map((i) => i.name);
check("delta since baseline includes the probe", names.includes(`${probeId}.md`));

hr("deleteNote cleans up");
await A.deleteNote(graph, id);
await A.deleteNote(graph, probeId);
const after = await A.listNotes(graph);
check("both test notes gone after delete", !after.some((i) => i.name.startsWith(id)));

hr(`DONE — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
