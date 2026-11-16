// opens.ts — when each memory was last opened on THIS phone (PHONE-WINDOW). Opening a
// memory keeps it in the rolling window (window.ts). Phone-local, never synced; entries
// older than the window are pruned on write, so it stays tiny.

import { WINDOW_MS } from "./window";

const KEY = "pensieve.phone.opens";

export function loadOpens(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function recordOpen(id: string, now = Date.now()): void {
  const opens = loadOpens();
  opens[id] = now;
  for (const k of Object.keys(opens)) if (opens[k] < now - WINDOW_MS) delete opens[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(opens));
  } catch {
    /* storage unavailable — the note just isn't pinned by this open */
  }
}
