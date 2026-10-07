// One-time setup: seed the macOS Keychain with the Azure app config and a bootstrap
// refresh token so Pensieve is "connected" to OneDrive without an interactive login.
//
// It reuses onedrive-manager's Azure registration (.env) and the already-stored,
// AES-encrypted refresh token for the Stage Erdman account — decrypts it and writes
// both the app config and the plaintext refresh token into the Pensieve keychain
// namespace that the native app reads (service "xyz.erdman.pensieve.sync").
//
// This is a throwaway bootstrap for the owner's own machine (single-user); the app's
// real "Connect OneDrive" button runs the proper interactive OAuth loopback flow and
// does not need this. Re-running is safe (idempotent overwrite). "Disconnect" in-app
// deletes the refresh-token entry.
//
// Run:  node "updates/2026-10-07 ONEDRIVE-SYNC - OPEN/setup/seed-keychain.mjs"

import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const ODM = "/Users/stage/dev/onedrive-manager";
const ACCOUNT_ID = "974255cf67084b26"; // Stage Erdman — s.microsoft@erdman.xyz
const SERVICE = "xyz.erdman.pensieve.sync";

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

// ---- write to the keychain (generic passwords, service + account) ----
function setSecret(account, value) {
  // -U updates if it exists; -w value, -s service, -a account.
  execFileSync("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", value]);
  console.log(`  keychain: ${SERVICE} / ${account} ✓`);
}

setSecret("azure-config", azureConfig);
setSecret("refresh-token", refreshToken);
console.log("Done. Pensieve will see OneDrive as connected on next launch.");
