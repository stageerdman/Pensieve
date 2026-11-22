// Measurement spike: where does a keystroke's time go on the REAL vault? Read-only.
// Run: npx tsx "updates/2026-11-22 FAST-RELEVANT-SEARCH - OPEN/spike/measure.ts" <vault/notes dir> [query]
// (P0 measured the old code with this same script — numbers in wiki.md.)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryIndex } from "../../../src/lib/search/indexer";
import { runSearch } from "../../../src/lib/search/search";
import { plainTextFromMarkdown, titleFromMarkdown } from "../../../src/lib/text";
import type { NoteMeta } from "../../../src/lib/types";

const dir = process.argv[2];
const phrase = process.argv[3] ?? "What do I want today";
const notes: NoteMeta[] = [];
const docs: { id: string; text: string }[] = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  const raw = readFileSync(join(dir, f), "utf8");
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  const id = f.replace(/\.md$/, "");
  const ts = Date.parse(/created: (\S+)/.exec(raw)?.[1] ?? "") || 0;
  notes.push({ id, title: titleFromMarkdown(body), createdAt: ts, updatedAt: ts, tags: [], categories: [] } as unknown as NoteMeta);
  docs.push({ id, text: plainTextFromMarkdown(body) });
}
const index = new MemoryIndex();
let t = performance.now();
index.set(docs);
console.log(`notes=${notes.length} build=${(performance.now() - t).toFixed(0)}ms`);

const times: number[] = [];
for (let i = 1; i <= phrase.length; i++) {
  const text = phrase.slice(0, i);
  t = performance.now();
  const out = runSearch(notes, { text, items: [] }, index);
  const ms = performance.now() - t;
  times.push(ms);
  const top = out.notes[0];
  console.log(`${JSON.stringify(text).padEnd(24)} hits=${String(out.notes.length).padStart(5)} ${ms.toFixed(1).padStart(6)}ms  top=${JSON.stringify(top?.title ?? "")}`);
}
times.sort((a, b) => a - b);
console.log(`median=${times[times.length >> 1].toFixed(1)}ms max=${times[times.length - 1].toFixed(1)}ms`);
