// Store selection. In the native app (Tauri present) we use the on-disk vault
// adapter; otherwise the browser adapter. The rest of the app depends only on the
// Store interface, so swapping backends never touches feature code.

import type { Store } from "../types";
import { BrowserStore } from "./browser";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let instance: Store | null = null;

export function getStore(): Store {
  if (instance) return instance;
  // The Tauri adapter is wired in the native-shell phase; until then, and in the
  // browser/tests, the BrowserStore is the backend.
  instance = new BrowserStore();
  return instance;
}
