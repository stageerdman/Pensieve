// config.ts — the phone's Azure app config. Public client, no secret (a PWA can't
// hold one), so the client id/tenant aren't sensitive — unlike the desktop, which
// loads this from the native secret store, the phone can just ship it in the bundle.
//
// The redirect URI is computed from wherever the app is actually running (not a
// build-time env var), so the SAME build works at `npm run dev:phone` and at
// whatever the Cloudflare Pages URL turns out to be — as long as BOTH origins have
// a matching "Single-page application" redirect registered on the Azure app (see
// updates/2026-10-07 PWA-CAPTURE - OPEN/update v2.md's "one manual step").

export const CLIENT_ID = "51c918c5-4039-4834-9cf8-39d3fa475ade";
export const TENANT = "consumers";
export const GRAPH_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Files.ReadWrite"].join(" ");
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const REMOTE_ROOT = "Pensieve";

export const AUTH_CALLBACK_PATH = "/auth/callback";

export function redirectUri(): string {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export function authority(): string {
  return `https://login.microsoftonline.com/${TENANT}`;
}
