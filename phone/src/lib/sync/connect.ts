// connect.ts — the phone's "Connect OneDrive" flow: a full-page SPA redirect (no
// native loopback server to come back to, unlike desktop's src/lib/sync/connect.ts).
//
//   1. generate PKCE + state, stash them in sessionStorage (survives the navigation
//      away and back — a plain JS variable would not)
//   2. navigate the whole page to the Microsoft consent screen
//   3. (new page load) main.tsx sees the /auth/callback path and calls
//      completeConnect() with the query string — see finishAuthCallback()
//   4. exchange the code, store the refresh token, navigate back to "/"

import { buildAuthorizeUrl, createPkce, exchangeCode, randomState } from "./oauth";
import { clearStoredRefreshToken, clearTokenCache, setStoredRefreshToken } from "./tokens";
import { AUTH_CALLBACK_PATH } from "./config";

const PENDING_KEY = "pensieve.phone.authPending";

interface PendingAuth {
  verifier: string;
  state: string;
  /** Where to return to once the exchange finishes. */
  returnTo: string;
}

/** Kick off the interactive connect: navigates the page away. Never returns
 *  normally (the rest of the flow resumes on the /auth/callback page load). */
export async function startConnect(): Promise<void> {
  const pkce = await createPkce();
  const state = randomState();
  const pending: PendingAuth = { verifier: pkce.verifier, state, returnTo: window.location.pathname };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  window.location.assign(buildAuthorizeUrl({ state, challenge: pkce.challenge }));
}

export function disconnectOneDrive(): void {
  clearStoredRefreshToken();
  clearTokenCache();
}

/** True if the current page load IS the OAuth redirect coming back. Check this
 *  before mounting the Wand UI (see main.tsx). */
export function isAuthCallback(): boolean {
  return window.location.pathname === AUTH_CALLBACK_PATH;
}

/** Complete the redirect: read the query string Microsoft appended, validate
 *  state, exchange the code, store the refresh token. Resolves with the path to
 *  return the user to. Throws with a message fit to show directly (sign-in
 *  refused, state mismatch, no pending request — e.g. a stale/reloaded tab). */
export async function finishAuthCallback(): Promise<{ returnTo: string }> {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) throw new Error("No sign-in was in progress — go back and tap Connect again.");
  sessionStorage.removeItem(PENDING_KEY);
  const pending = JSON.parse(raw) as PendingAuth;

  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  if (error) throw new Error(`Sign-in was refused: ${params.get("error_description") || error}`);
  if (!code) throw new Error("No authorization code was returned.");
  if (state !== pending.state) throw new Error("State mismatch — aborting for safety.");

  const tokens = await exchangeCode(code, pending.verifier);
  if (!tokens.refresh_token) throw new Error("No refresh token returned — check that offline_access was granted.");
  setStoredRefreshToken(tokens.refresh_token);
  clearTokenCache();
  return { returnTo: pending.returnTo || "/" };
}
