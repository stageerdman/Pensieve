// Sync configuration: the Azure app registration and the remote vault location.
//
// The Azure config (incl. the client secret) lives in the native secret store, not
// in any committed file — load it via the native bridge. For dev/browser runs we fall
// back to Vite env vars so the portable layer can be exercised without the native store.

import type { AzureConfig } from "./types";
import { secretGet } from "./native";
import { isTauri } from "../store";
import { log } from "../logger";

/** Delegated Graph scopes — ReadWrite on the personal drive + offline refresh.
 *  Identical to the set proven in the Phase 0 spike. */
export const GRAPH_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Files.ReadWrite"].join(" ");

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** The vault's folder on OneDrive — the cloud mirror of the local `.md` tree. */
export const REMOTE_ROOT = "Pensieve";

/** Secret-store keys (within the native sync store). */
export const KEY_AZURE_CONFIG = "azure-config";
export const KEY_REFRESH_TOKEN = "refresh-token";

export function authorityFor(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant || "consumers"}`;
}

let cached: AzureConfig | null = null;

/** Load the Azure app config once (secret store on desktop, env in dev). Throws a
 *  clear error if nothing is configured so a missing setup is one obvious message. */
export async function getAzureConfig(): Promise<AzureConfig> {
  if (cached) return cached;

  if (isTauri()) {
    const raw = await secretGet(KEY_AZURE_CONFIG);
    if (!raw) {
      throw new Error(
        "OneDrive is not configured: no Azure app config in the secret store. Run the one-time setup (see updates/…/wiki.md).",
      );
    }
    cached = normalise(JSON.parse(raw));
    return cached;
  }

  // Browser/dev fallback — lets tests and `npm run dev` build auth URLs etc.
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
  cached = normalise({
    clientId: env.VITE_AZURE_CLIENT_ID ?? "",
    clientSecret: env.VITE_AZURE_CLIENT_SECRET ?? "",
    redirectUri: env.VITE_AZURE_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback",
    tenant: env.VITE_AZURE_TENANT ?? "consumers",
  });
  return cached;
}

function normalise(c: Partial<AzureConfig>): AzureConfig {
  return {
    clientId: c.clientId ?? "",
    clientSecret: c.clientSecret ?? "",
    redirectUri: c.redirectUri ?? "http://localhost:3000/api/auth/callback",
    tenant: c.tenant ?? "consumers",
  };
}

/** Clear the in-memory cache (after re-provisioning or sign-out). */
export function resetConfigCache(): void {
  cached = null;
  log.debug("sync", "config.reset");
}

/** Parse the redirect URI into the port + path the loopback server must bind. */
export function redirectParts(redirectUri: string): { port: number; path: string } {
  const u = new URL(redirectUri);
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  return { port, path: u.pathname };
}
