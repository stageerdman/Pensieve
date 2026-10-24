import React from "react";
import { createRoot } from "react-dom/client";
import { PhoneApp, RECENTS_KEY } from "./PhoneApp";
import { AuthCallback } from "./AuthCallback";
import { isAuthCallback } from "./lib/sync/connect";
import { clearVault } from "./vaultStore";
import { clearAllMedia } from "./lib/media/mediaStore";
import "./styles/index.css";
import "./styles/wand.css";
import "./styles/dock.css";
import "./styles/spellmenu.css";

const CLEARED_FLAG = "pensieve.phone.clearedSeedOnce";

/** One-time migration: earlier builds ran entirely on in-memory seed demo data with
 *  no real backing store beyond these same localStorage/IndexedDB keys, so a device
 *  that already opened the app could have that demo data sitting here as if it were
 *  real. Wipe notes, media bytes, and stale search recents once so real OneDrive
 *  sync starts from a genuinely blank slate. Idempotent (a flag guards it) — safe to
 *  call on every boot. Device UI prefs (wheel side/radius) are untouched — those
 *  aren't seed data. */
function ensureFreshStart(): void {
  try {
    if (localStorage.getItem(CLEARED_FLAG)) return;
    clearVault();
    localStorage.removeItem(RECENTS_KEY);
    void clearAllMedia();
    localStorage.setItem(CLEARED_FLAG, "1");
  } catch {
    /* unavailable — nothing to migrate */
  }
}

ensureFreshStart();

// The OneDrive OAuth redirect lands back on this same origin at /auth/callback — a
// full page load, not a client-side route. Handle it BEFORE the Wand ever mounts.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isAuthCallback() ? <AuthCallback /> : <PhoneApp />}</React.StrictMode>,
);
