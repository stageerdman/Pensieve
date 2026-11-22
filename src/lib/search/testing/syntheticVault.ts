// A large, deterministic fake vault for search benchmarks (search.bench.test.ts, the
// FAST-RELEVANT-SEARCH spike). A small vocabulary makes it adversarial: most queries hit
// thousands of notes, so ranking cost — not lookup — dominates. One old note titled
// TARGET_TITLE is the memory a "What do I want today" search must put on top.
import type { NoteMeta } from "../../types";
import type { IndexDoc } from "../indexer";

export const TARGET_ID = "target";
export const TARGET_TITLE = "What do I want today";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 22).getTime();
const VOCAB = (
  "want today what do think plan walk morning coffee idea work focus project voice note " +
  "garden family music book read write sleep energy calm list call email meeting design " +
  "build search memory flask summon bottle river light shadow travel train city friend"
).split(" ");

/** Deterministic PRNG (mulberry32) so every run measures the same vault. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function words(rand: () => number, n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(VOCAB[Math.floor(rand() * VOCAB.length)]);
  return out.join(" ");
}

export function syntheticVault(count = 10_000, wordsPerBody = 160): { notes: NoteMeta[]; docs: IndexDoc[] } {
  const rand = rng(42);
  const notes: NoteMeta[] = [];
  const docs: IndexDoc[] = [];
  for (let i = 0; i < count; i++) {
    const id = `n${i}`;
    const ts = NOW - Math.floor(rand() * 900) * DAY;
    notes.push({ id, title: words(rand, 3), createdAt: ts, updatedAt: ts, tags: [], categories: [] });
    docs.push({ id, text: words(rand, wordsPerBody) });
  }
  // Old on purpose, so recency can't be what puts it on top.
  const old = NOW - 700 * DAY;
  notes.push({ id: TARGET_ID, title: TARGET_TITLE, createdAt: old, updatedAt: old, tags: [], categories: [] });
  docs.push({ id: TARGET_ID, text: "A short list for the day." });
  return { notes, docs };
}
