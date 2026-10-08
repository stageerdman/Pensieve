// Point Pensieve at its OWN Azure app registration (public client, no secret) by
// writing the azure-config entry into the native secret store (secrets.json), and
// clearing any stored refresh token so the next launch prompts a fresh Connect against
// the new app and the correct OneDrive account.
//
// This is the file-store successor to the ONEDRIVE-SYNC keychain version — Pensieve no
// longer uses the macOS Keychain (see DROP-KEYCHAIN).
//
// Usage:
//   node "updates/2026-10-08 SYNC-CONNECT - OPEN/setup/set-azure-config.mjs" <CLIENT_ID>
//
// Defaults assume the Pensieve desktop Azure setup:
//   - Mobile & desktop redirect: http://localhost:8711/callback   (NOT :3000)
//   - Personal accounts  (tenant "consumers")
//   - Allow public client flows = Yes  → no client secret
// Override redirect/tenant with extra args if you registered something different:
//   node set-azure-config.mjs <CLIENT_ID> <REDIRECT_URI> <TENANT>

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [clientId, redirectUri = "http://localhost:8711/callback", tenant = "consumers"] =
  process.argv.slice(2);

if (!clientId) {
  console.error("Missing CLIENT_ID.\nUsage: node set-azure-config.mjs <CLIENT_ID> [REDIRECT_URI] [TENANT]");
  process.exit(1);
}

const APP_DATA = join(homedir(), "Library", "Application Support", "xyz.erdman.pensieve");
const SECRETS_FILE = join(APP_DATA, "secrets.json");

if (!existsSync(APP_DATA)) mkdirSync(APP_DATA, { recursive: true });
let store = {};
if (existsSync(SECRETS_FILE)) {
  try {
    store = JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
  } catch {
    store = {};
  }
}

store["azure-config"] = JSON.stringify({ clientId, clientSecret: "", redirectUri, tenant });
delete store["refresh-token"]; // force a fresh Connect against the new app + right account

writeFileSync(SECRETS_FILE, JSON.stringify(store));
chmodSync(SECRETS_FILE, 0o600);

console.log(`Wrote ${SECRETS_FILE}`);
console.log(`Pensieve now points at Azure app ${clientId}`);
console.log(`Redirect: ${redirectUri}  ·  tenant: ${tenant}  ·  public client (no secret)`);
console.log("Reopen Pensieve → click the cloud icon → Connect, and pick the right OneDrive.");
