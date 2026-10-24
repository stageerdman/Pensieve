import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishAuthCallback, isAuthCallback, startConnect } from "./connect";
import { getStoredRefreshToken } from "./tokens";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("isAuthCallback", () => {
  it("is true only on the callback path", () => {
    window.history.pushState({}, "", "/");
    expect(isAuthCallback()).toBe(false);
    window.history.pushState({}, "", "/auth/callback?code=x");
    expect(isAuthCallback()).toBe(true);
  });
});

describe("startConnect", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stashes a pending request before navigating (jsdom won't let us assert the navigation itself — window.location.assign isn't mockable there)", async () => {
    window.history.pushState({}, "", "/home");
    try {
      await startConnect();
    } catch {
      // jsdom's un-mocked location.assign throws "Not implemented" — expected; the
      // sessionStorage write above it already happened by then.
    }
    const pending = JSON.parse(sessionStorage.getItem("pensieve.phone.authPending") ?? "null");
    expect(pending).toMatchObject({ returnTo: "/home" });
    expect(typeof pending.verifier).toBe("string");
    expect(typeof pending.state).toBe("string");
  });
});

describe("finishAuthCallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fails cleanly when no sign-in was pending (e.g. a stale reloaded tab)", async () => {
    window.history.pushState({}, "", "/auth/callback?code=abc&state=xyz");
    await expect(finishAuthCallback()).rejects.toThrow(/no sign-in was in progress/i);
  });

  it("fails on a state mismatch without storing anything", async () => {
    sessionStorage.setItem("pensieve.phone.authPending", JSON.stringify({ verifier: "v", state: "expected", returnTo: "/" }));
    window.history.pushState({}, "", "/auth/callback?code=abc&state=WRONG");
    await expect(finishAuthCallback()).rejects.toThrow(/state mismatch/i);
    expect(getStoredRefreshToken()).toBeNull();
  });

  it("surfaces a refused sign-in (error param) without calling the token endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    sessionStorage.setItem("pensieve.phone.authPending", JSON.stringify({ verifier: "v", state: "s1", returnTo: "/" }));
    window.history.pushState({}, "", "/auth/callback?error=access_denied&error_description=nope");
    await expect(finishAuthCallback()).rejects.toThrow(/refused/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("on success, exchanges the code and stores the refresh token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "a1", refresh_token: "r1", expires_in: 3600, token_type: "Bearer", scope: "x" }), {
        status: 200,
      }),
    );
    sessionStorage.setItem("pensieve.phone.authPending", JSON.stringify({ verifier: "v", state: "s1", returnTo: "/home" }));
    window.history.pushState({}, "", "/auth/callback?code=abc&state=s1");
    const { returnTo } = await finishAuthCallback();
    expect(returnTo).toBe("/home");
    expect(getStoredRefreshToken()).toBe("r1");
    // The pending request is consumed — a reload of the callback page fails cleanly.
    expect(sessionStorage.getItem("pensieve.phone.authPending")).toBeNull();
  });
});
