// Point Pensieve at its OWN Azure app registration (public client, no secret).
//
// Writes the azure-config keychain entry the native app reads, and clears any old
// refresh token so the next launch prompts a fresh Connect against the new app.
//
// Usage:
//   node "updates/2026-10-07 ONEDRIVE-SYNC - OPEN/setup/set-azure-config.mjs" <CLIENT_ID>
//
// Defaults assume the Azure setup from the update doc:
//   - Mobile & desktop redirect: http://localhost:8711/callback
//   - Personal accounts  (tenant "consumers")
//   - Allow public client flows = Yes  → no client secret
// Override redirect/tenant with extra args if you registered something different:
//   node set-azure-config.mjs <CLIENT_ID> <REDIRECT_URI> <TENANT>

import { execFileSync } from "node:child_process";

const SERVICE = "xyz.erdman.pensieve.sync";
const [clientId, redirectUri = "http://localhost:8711/callback", tenant = "consumers"] =
  process.argv.slice(2);

if (!clientId) {
  console.error("Missing CLIENT_ID.\nUsage: node set-azure-config.mjs <CLIENT_ID> [REDIRECT_URI] [TENANT]");
  process.exit(1);
}

const azureConfig = JSON.stringify({ clientId, clientSecret: "", redirectUri, tenant });

function setSecret(account, value) {
  execFileSync("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", value]);
  console.log(`  keychain set: ${SERVICE} / ${account}`);
}
function deleteSecret(account) {
  try {
    execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", account], { stdio: "ignore" });
    console.log(`  keychain cleared: ${account}`);
  } catch {
    /* absent — fine */
  }
}

setSecret("azure-config", azureConfig);
deleteSecret("refresh-token"); // force a fresh Connect against the new app

console.log(`\nPensieve now points at Azure app ${clientId}`);
console.log(`Redirect: ${redirectUri}  ·  tenant: ${tenant}  ·  public client (no secret)`);
console.log("Reopen Pensieve → click the cloud icon → Connect. (No need to free port 3000 now.)");
