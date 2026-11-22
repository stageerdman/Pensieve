import { describe, it, expect, beforeAll } from "vitest";
import { MemoryIndex } from "./indexer";
import { runSearch } from "./search";
import { syntheticVault, TARGET_ID, TARGET_TITLE } from "./testing/syntheticVault";
import type { NoteMeta } from "../types";

// Latency benchmark on a large vault: typing a query one character at a time must stay
// within a frame or two per keystroke, and the right memory must be on top. The vault is
// 10k notes from a tiny vocabulary, so most keystrokes hit thousands of notes (worst case
// for ranking); the real vault is measured by spike/measure.ts in the FAST-RELEVANT-SEARCH update.

const P95_BUDGET_MS = 30;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}

/** Type `phrase` one character at a time, as the owner would; per-keystroke ms. Each keystroke
 *  is the best of a few runs, so a test worker being preempted isn't billed to the search. */
function typeQuery(notes: NoteMeta[], index: MemoryIndex, phrase: string, tries = 3): number[] {
  const best = Array.from(phrase, () => Infinity);
  for (let run = 0; run < tries; run++) {
    index.remove("bench-cache-buster"); // any change drops the term/phrase caches: every run starts cold
    for (let i = 1; i <= phrase.length; i++) {
      const t = performance.now();
      runSearch(notes, { text: phrase.slice(0, i), items: [] }, index);
      best[i - 1] = Math.min(best[i - 1], performance.now() - t);
    }
  }
  return best;
}

// Retried because this machine is shared: a busy neighbour can slow every run 3-4x for a few
// seconds. A real regression fails every attempt; a noisy moment doesn't.
describe("search latency on a 10k-note vault", { retry: 2 }, () => {
  const { notes, docs } = syntheticVault();
  const index = new MemoryIndex();

  beforeAll(() => {
    index.set(docs);
    typeQuery(notes, index, "warm up the jit", 1); // first calls pay for compilation, not search
  });

  it.each([TARGET_TITLE, "morning coffee", "summon bottle river", "zzz nothing matches"])(
    "every keystroke of %j stays under the per-keystroke budget",
    (phrase) => {
      expect(p95(typeQuery(notes, index, phrase))).toBeLessThan(P95_BUDGET_MS);
    },
    60_000,
  );

  it("the exact title is on top among thousands of partial matches", () => {
    const out = runSearch(notes, { text: TARGET_TITLE, items: [] }, index);
    expect(out.notes.length).toBeGreaterThan(1000);
    expect(out.notes[0].id).toBe(TARGET_ID);
  });
});
