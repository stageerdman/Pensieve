// Store selection. In the native app (Tauri present) we use the on-disk vault
// adapter; otherwise the browser adapter. The rest of the app depends only on the
// Store interface, so swapping backends never touches feature code.

import type { Store } from "../types";
import { BrowserStore } from "./browser";
import { TauriStore } from "./tauri";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let instance: Store | null = null;

export function getStore(): Store {
  if (instance) return instance;
  // Native app → on-disk vault; browser/tests → localStorage. Feature code only
  // ever sees the Store interface.
  instance = isTauri() ? new TauriStore() : new BrowserStore();
  return instance;
}
