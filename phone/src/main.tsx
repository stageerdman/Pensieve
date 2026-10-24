import React from "react";
import { createRoot } from "react-dom/client";
import { PhoneApp } from "./PhoneApp";
import { AuthCallback } from "./AuthCallback";
import { isAuthCallback } from "./lib/sync/connect";
import "./styles/index.css";
import "./styles/wand.css";
import "./styles/dock.css";
import "./styles/spellmenu.css";

// The OneDrive OAuth redirect lands back on this same origin at /auth/callback — a
// full page load, not a client-side route. Handle it BEFORE the Wand ever mounts.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isAuthCallback() ? <AuthCallback /> : <PhoneApp />}</React.StrictMode>,
);
