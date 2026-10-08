// One-time setup: seed Pensieve's local secret store (secrets.json) with the Azure app
// config and a bootstrap refresh token, so the app is "connected" to OneDrive with no
// interactive login and — crucially — NO macOS Keychain prompt, ever.
//
// Replaces the old seed-keychain.mjs. Pensieve no longer uses the OS keychain: the
// native shell now reads/writes a plain JSON file in the app-data dir. macOS gated
// keychain reads by code-signing identity, so a locally-built (ad-hoc-signed) app got a
// password prompt on every launch. A file has no such gate and ports to the future
// iPhone app, which has no desktop keychain at all.
//
// Like the old script this reuses onedrive-manager's Azure registration (.env) and its
// already-stored, AES-encrypted refresh token for the Stage Erdman account — decrypts it
// and writes both values into secrets.json. It reads nothing from the keychain, so it
// never prompts. Re-running is a safe idempotent overwrite.
//
// Run:  node "updates/2026-10-08 DROP-KEYCHAIN - OPEN/setup/seed-secrets.mjs"

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const ODM = "/Users/stage/dev/onedrive-manager";
const ACCOUNT_ID = "974255cf67084b26"; // Stage Erdman — s.microsoft@erdman.xyz

// The native app reads this exact file (app_data_dir()/secrets.json). On macOS the
// app-data dir is ~/Library/Application Support/<bundle identifier>.
const APP_DATA = join(homedir(), "Library", "Application Support", "xyz.erdman.pensieve");
const SECRETS_FILE = join(APP_DATA, "secrets.json");

// ---- load onedrive-manager's .env ----
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

const require = createRequire(ODM + "/");
const Database = require("better-sqlite3");
const db = new Database(ODM + "/data/onedrive-manager.db", { readonly: true });
const row = db.prepare("SELECT refresh_token FROM accounts WHERE id = ?").get(ACCOUNT_ID);
if (!row) throw new Error("account not found in onedrive-manager db");
const refreshToken = decrypt(row.refresh_token, env.TOKEN_ENCRYPTION_KEY);
db.close();

const azureConfig = JSON.stringify({
  clientId: env.AZURE_CLIENT_ID,
  clientSecret: env.AZURE_CLIENT_SECRET,
  redirectUri: env.AZURE_REDIRECT_URI || "http://localhost:3000/api/auth/callback",
  tenant: env.AZURE_TENANT_ID || "consumers",
});

// ---- merge into secrets.json (same flat {key: value} map the Rust side uses) ----
if (!existsSync(APP_DATA)) mkdirSync(APP_DATA, { recursive: true });
let store = {};
if (existsSync(SECRETS_FILE)) {
  try {
    store = JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
  } catch {
    store = {};
  }
}
store["azure-config"] = azureConfig;
store["refresh-token"] = refreshToken;
writeFileSync(SECRETS_FILE, JSON.stringify(store));
chmodSync(SECRETS_FILE, 0o600); // owner-only, matching the Rust writer

console.log(`Wrote ${SECRETS_FILE}`);
console.log("  azure-config ✓");
console.log("  refresh-token ✓");
console.log("Done. Pensieve will see OneDrive as connected on next launch — no keychain, no prompt.");
