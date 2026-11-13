/// <reference types="vite/client" />
import { log } from "../logger";

/** Registers /sw.js (emitted by phone/vite.swPlugin.ts) so the installed PWA opens
 *  with no network. Production builds only — the dev server has no sw.js. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => log.info("pwa", "sw-registered", { scope: reg.scope }))
      .catch((err: unknown) => log.warn("pwa", "sw-register-failed", { error: String(err) }));
  });
}
