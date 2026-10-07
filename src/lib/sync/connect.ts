// The desktop "Connect OneDrive" flow. Orchestrates the native loopback OAuth:
//   1. generate PKCE + state
//   2. start the one-shot loopback server on the registered redirect
//   3. open the system browser to the consent screen
//   4. catch the redirect, validate state, exchange the code (PKCE + secret)
//   5. store the refresh token in the keychain
// Everything that needs the native shell goes through ./native; the rest is fetch.

import { getAzureConfig, KEY_REFRESH_TOKEN, redirectParts } from "./config";
import { buildAuthorizeUrl, createPkce, exchangeCode, randomState } from "./oauth";
import { oauthListen, openUrl, portAvailable, secretDelete, secretSet } from "./native";
import { clearTokenCache } from "./tokens";
import { log } from "../logger";

/** Run the full interactive connect flow. Resolves once a refresh token is stored. */
export async function connectOneDrive(opts: { timeoutSecs?: number } = {}): Promise<void> {
  const cfg = await getAzureConfig();
  if (!cfg.clientId) throw new Error("Azure app is not configured (missing client id).");

  const { port, path } = redirectParts(cfg.redirectUri);

  // The sign-in code comes back to this loopback port. If another app holds it
  // (e.g. a dev server on 3000), Microsoft's redirect lands on THAT app and we
  // never receive the code — so fail early with a message that says exactly what to do.
  if (!(await portAvailable(port))) {
    throw new Error(
      `Port ${port} is in use by another app, so the sign-in can't complete. Quit whatever is running on localhost:${port} (e.g. the onedrive-manager dev server), then click Connect again.`,
    );
  }

  const pkce = await createPkce();
  const state = randomState();

  log.info("sync", "connect.start", { port, path });

  // Start listening BEFORE opening the browser so the redirect is never missed.
  const waiting = oauthListen(port, path, opts.timeoutSecs ?? 180);

  const authorizeUrl = buildAuthorizeUrl(cfg, { state, challenge: pkce.challenge });
  await openUrl(authorizeUrl);

  const result = await waiting;
  if (result.error) throw new Error(`Sign-in was refused: ${result.error}`);
  if (!result.code) throw new Error("No authorization code was returned.");
  if (result.state !== state) throw new Error("State mismatch — aborting for safety.");

  const tokens = await exchangeCode(cfg, result.code, pkce.verifier);
  if (!tokens.refresh_token) {
    throw new Error("No refresh token returned — check that 'offline_access' is granted.");
  }
  await secretSet(KEY_REFRESH_TOKEN, tokens.refresh_token);
  clearTokenCache();
  log.info("sync", "connect.ok");
}

/** Sign out: forget the refresh token and in-memory access token. Leaves the
 *  local vault and the remote files untouched — this only disconnects. */
export async function disconnectOneDrive(): Promise<void> {
  await secretDelete(KEY_REFRESH_TOKEN);
  clearTokenCache();
  log.info("sync", "disconnect");
}
