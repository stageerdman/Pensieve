// ONEDRIVE-SYNC — Phase 0 research spike (throwaway).
//
// Proves the end-to-end sync primitives against a REAL personal OneDrive, in an
// isolated /Pensieve-Spike/ folder, reusing onedrive-manager's Azure app and the
// stored (encrypted) refresh token for the Stage Erdman account.
//
// It demonstrates:
//   1. refresh_token -> access_token  (and, as a data point, WITHOUT the secret)
//   2. create isolated folder
//   3. upload a fake .md note
//   4. read it back + capture eTag/cTag
//   5. conditional update with If-Match (correct eTag -> succeeds, new eTag)
//   6. conditional update with a STALE If-Match (-> 412 = conflict detected)
//   7. /delta cursor: baseline link, then make a change, then see ONLY the change
//
// Run: node "updates/2026-10-07 ONEDRIVE-SYNC - OPEN/spike/spike.mjs"

import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { createRequire } from "node:module";

const ODM = "/Users/stage/dev/onedrive-manager";
const require = createRequire(ODM + "/");
const Database = require("better-sqlite3");

const ACCOUNT_ID = "974255cf67084b26"; // Stage Erdman — s.microsoft@erdman.xyz
const FOLDER = "Pensieve-Spike";
const AUTHORITY = "https://login.microsoftonline.com/consumers";
const GRAPH = "https://graph.microsoft.com/v1.0";

// ---- load .env (simple parse, no dep) ----
const env = {};
for (const line of readFileSync(ODM + "/.env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !line.trimStart().startsWith("#")) env[m[1]] = m[2];
}

// ---- decrypt the stored refresh token (mirrors onedrive-manager/lib/crypto.ts) ----
function decrypt(payload, keyHex) {
  const [iv, tag, data] = payload.split(":");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

const db = new Database(ODM + "/data/onedrive-manager.db", { readonly: true });
const row = db.prepare("SELECT refresh_token FROM accounts WHERE id = ?").get(ACCOUNT_ID);
const refreshToken = decrypt(row.refresh_token, env.TOKEN_ENCRYPTION_KEY);

// ---- helpers ----
const SCOPE = "openid profile offline_access User.Read Files.ReadWrite";

async function redeem(body) {
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function g(token, path, opts = {}) {
  const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

const log = (...a) => console.log(...a);
const hr = (t) => log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));

// ---- run ----
hr("STEP 1 — refresh_token -> access_token");

// 1a. Data point for the PWA: does refresh work WITHOUT the client secret?
const noSecret = await redeem({
  client_id: env.AZURE_CLIENT_ID,
  grant_type: "refresh_token",
  refresh_token: refreshToken,
  scope: SCOPE,
});
log("secret-less refresh:", noSecret.status, noSecret.ok ? "OK" : noSecret.json.error,
    noSecret.ok ? "" : "— " + (noSecret.json.error_description || "").split("\n")[0]);

// 1b. The real token we'll use (with secret, matching onedrive-manager's working path).
const withSecret = await redeem({
  client_id: env.AZURE_CLIENT_ID,
  client_secret: env.AZURE_CLIENT_SECRET,
  grant_type: "refresh_token",
  refresh_token: refreshToken,
  scope: SCOPE,
});
if (!withSecret.ok) { log("FATAL: token refresh failed:", withSecret.json); process.exit(1); }
const token = withSecret.json.access_token;
log("with-secret refresh:", withSecret.status, "OK — got access token, expires_in",
    withSecret.json.expires_in, "s");

hr("STEP 2 — create isolated folder /" + FOLDER);
const mk = await g(token, "/me/drive/root/children", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: FOLDER, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
});
log("folder:", mk.status, mk.ok ? `id=${mk.body.id}` : mk.body);

hr("STEP 3 — upload a fake .md note");
const noteName = `note-${Date.now()}.md`;
const v1 = `# Spike note\n\nCaptured from the ONEDRIVE-SYNC spike at ${new Date().toISOString()}.\n\n- first thought\n`;
const up = await g(token, `/me/drive/root:/${FOLDER}/${noteName}:/content`, {
  method: "PUT",
  headers: { "Content-Type": "text/markdown" },
  body: v1,
});
log("upload:", up.status, up.ok ? `id=${up.body.id}` : up.body);
const fileId = up.body.id;
let eTag = up.body.eTag;
let cTag = up.body.cTag;
log("eTag:", eTag, "\ncTag:", cTag);

hr("STEP 4 — read it back");
const meta = await g(token, `/me/drive/items/${fileId}`);
log("meta:", meta.status, "name=", meta.body.name, "size=", meta.body.size,
    "lastModified=", meta.body.lastModifiedDateTime);
const content = await g(token, `/me/drive/items/${fileId}/content`);
log("content matches what we wrote:", content.body === v1);

hr("STEP 5 — conditional update with CORRECT If-Match (should succeed)");
const v2 = v1 + "- a second thought, added by a correct conditional write\n";
const good = await g(token, `/me/drive/items/${fileId}/content`, {
  method: "PUT",
  headers: { "Content-Type": "text/markdown", "If-Match": cTag || eTag },
  body: v2,
});
log("conditional update:", good.status, good.ok ? "OK — accepted" : good.body);
const newCTag = good.ok ? good.body.cTag : cTag;
log("new cTag:", newCTag, "(changed:", newCTag !== cTag, ")");

hr("STEP 6 — conditional update with STALE If-Match (should be REJECTED = conflict)");
const stale = await g(token, `/me/drive/items/${fileId}/content`, {
  method: "PUT",
  headers: { "Content-Type": "text/markdown", "If-Match": cTag || eTag }, // old tag, now stale
  body: v2 + "- this write must NOT silently win\n",
});
log("stale conditional update:", stale.status,
    stale.status === 412 ? "412 Precondition Failed — CONFLICT DETECTED (good!)"
    : stale.ok ? "!! ACCEPTED — conflict NOT detected (bad)" : stale.body);

hr("STEP 7 — /delta cursor");
// Baseline: walk delta to the latest token (drains current state).
let deltaUrl = `/me/drive/root:/${FOLDER}:/delta`;
let latestLink = null;
for (let i = 0; i < 20; i++) {
  const d = await g(token, deltaUrl);
  if (!d.ok) { log("delta error:", d.status, d.body); break; }
  if (d.body["@odata.nextLink"]) { deltaUrl = d.body["@odata.nextLink"]; continue; }
  latestLink = d.body["@odata.deltaLink"];
  break;
}
log("got baseline deltaLink:", !!latestLink);

// Make one change: add a brand-new note.
const newName = `delta-probe-${Date.now()}.md`;
await g(token, `/me/drive/root:/${FOLDER}/${newName}:/content`, {
  method: "PUT", headers: { "Content-Type": "text/markdown" },
  body: "# delta probe\n\nShould be the ONLY thing the delta query returns.\n",
});

// Query the delta link — should return only the change(s) since baseline.
const since = await g(token, latestLink);
const changed = (since.body.value || []).map((x) => x.name);
log("changes since baseline:", since.status, JSON.stringify(changed));
log("delta returned ONLY the new probe:",
    changed.length > 0 && changed.every((n) => n === newName || n === FOLDER));

hr("DONE — check /" + FOLDER + " in OneDrive to see the artifacts");
db.close();
