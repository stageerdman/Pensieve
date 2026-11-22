// Phase timing on a synthetic 10k vault: where does one keystroke go when almost every note matches?
// Run: npx tsx "updates/2026-11-22 FAST-RELEVANT-SEARCH - OPEN/spike/phases.ts"
import { MemoryIndex } from "../../../src/lib/search/indexer";
import { runSearch } from "../../../src/lib/search/search";
import { planQuery } from "../../../src/lib/search/rank/queryPlan";
import { syntheticVault } from "../../../src/lib/search/testing/syntheticVault";

const { notes, docs } = syntheticVault();
const index = new MemoryIndex();
let t = performance.now();
index.set(docs);
console.log(`build ${(performance.now() - t).toFixed(0)}ms`);

const time = (label: string, f: () => void) => {
  const runs: number[] = [];
  for (let i = 0; i < 15; i++) {
    t = performance.now();
    f();
    runs.push(performance.now() - t);
  }
  runs.sort((a, b) => a - b);
  console.log(`${label.padEnd(28)} median ${runs[7].toFixed(1)}ms`);
};

for (const text of ["What do I want to", "What do I want today", "morning coffee", "zzz"]) {
  const plan = planQuery(text);
  console.log(`-- ${JSON.stringify(text)} terms=${plan.terms.join(",")}`);
  time("termHits (uncached)", () => {
    index.update("n0", docs[0].text); // clears the term cache
    plan.terms.map((x) => index.termHits(x));
  });
  time("hasPhrase x all", () => {
    for (const d of docs) index.hasPhrase(d.id, plan.phrase);
  });
  time("runSearch (cached terms)", () => runSearch(notes, { text, items: [] }, index));
}
