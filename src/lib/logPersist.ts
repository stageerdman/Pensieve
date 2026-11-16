import { invoke } from "@tauri-apps/api/core";
import { log, type LogEntry } from "./logger";
import { isTauri } from "./store";

/** Serialize one entry as a single JSON line. `data` can hold anything (Errors, cycles),
 *  so fall back to a string rather than drop the entry. */
export function toLine(e: LogEntry): string {
  try {
    return JSON.stringify(e, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message } : v));
  } catch {
    return JSON.stringify({ ...e, data: String(e.data) });
  }
}

/** Desktop only: mirror every log entry to the capped on-disk store
 *  (~/Library/Logs/xyz.erdman.pensieve/ui.jsonl — query with `npm run logs`). */
export function installLogPersistence(): void {
  if (!isTauri()) return;
  log.setSink((entries) => invoke("append_log", { lines: entries.map(toLine) }));
  window.addEventListener("pagehide", () => log.flush());
}
