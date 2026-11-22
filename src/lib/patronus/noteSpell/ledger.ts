// ledger.ts — the Mac's private record of every note spell it has run (never synced). Keyed by
// runKey (note + instruction + voice + run counter), so an old `pending` copy that comes back
// (a phone "keep mine" after a conflict) is recognised and never run twice.

export interface RunRecord {
  status: "applied" | "undone";
  /** ISO time of the run. */
  ranAt: string;
  /** contentHash of the memory as the run left it: Undo only proceeds while it still matches. */
  afterHash: string;
  /** ts of the `before-patronus` Timeline entry Undo restores. */
  restoreTs: number;
}

export interface RunLedger {
  get(key: string): Promise<RunRecord | null>;
  put(key: string, record: RunRecord): Promise<void>;
}

/** A ledger over any string key/value storage (localStorage on the Mac, a Map in tests). */
export function storageLedger(storage: Pick<Storage, "getItem" | "setItem">, storageKey = "pensieve:patronus-runs"): RunLedger {
  const read = (): Record<string, RunRecord> => {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, RunRecord>;
    } catch (e) {
      // A corrupt ledger must not silently allow re-runs: fail loudly.
      throw new Error(`patronus run ledger is unreadable (${storageKey})`, { cause: e });
    }
  };
  return {
    get: async (key) => read()[key] ?? null,
    put: async (key, record) => storage.setItem(storageKey, JSON.stringify({ ...read(), [key]: record })),
  };
}
