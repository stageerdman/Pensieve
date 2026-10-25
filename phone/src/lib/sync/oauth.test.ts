import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, createPkce, randomState } from "./oauth";
import { CLIENT_ID, redirectUri } from "./config";

describe("PKCE", () => {
  it("createPkce produces a verifier + a distinct, base64url-safe challenge", async () => {
    const a = await createPkce();
    const b = await createPkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.verifier);
    for (const s of [a.verifier, a.challenge]) expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("randomState is distinct each call", () => {
    expect(randomState()).not.toBe(randomState());
  });
});

describe("buildAuthorizeUrl", () => {
  it("carries the public client id, this origin's redirect, PKCE challenge, and state", () => {
    const url = buildAuthorizeUrl({ state: "s1", challenge: "c1" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(parsed.searchParams.get("redirect_uri")).toBe(redirectUri());
    expect(parsed.searchParams.get("code_challenge")).toBe("c1");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("s1");
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });
});
