// AuthCallback.tsx — the page rendered at /auth/callback while the OneDrive
// sign-in redirect is exchanged. Deliberately tiny: it's on screen for under a
// second in the success case, and the Wand never mounts underneath it.

import { useEffect, useState } from "react";
import { finishAuthCallback } from "./lib/sync/connect";

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void finishAuthCallback()
      .then(({ returnTo }) => {
        if (alive) window.location.replace(returnTo);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      {error ? (
        <>
          <div>{error}</div>
          <a href="/">Back to Pensieve</a>
        </>
      ) : (
        <div>Connecting to OneDrive…</div>
      )}
    </div>
  );
}
