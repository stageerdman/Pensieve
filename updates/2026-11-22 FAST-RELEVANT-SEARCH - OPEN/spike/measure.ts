// Throwaway measurement spike (P0): where does a keystroke's time go on the REAL vault?
// Read-only. Run: npx tsx "updates/2026-11-22 FAST-RELEVANT-SEARCH - OPEN/spike/measure.ts" <vault/notes dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryIndex } from "../../../src/lib/search/indexer";
import { runSearch } from "../../../src/lib/search/search";
import { searchSections } from "../../../src/lib/gallery/searchSections";
import { plainTextFromMarkdown, titleFromMarkdown } from "../../../src/lib/text";
import type { NoteMeta } from "../../../src/lib/types";

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
const notes: NoteMeta[] = [];
const docs: { id: string; text: string }[] = [];
for (const f of files) {
  const raw = readFileSync(join(dir, f), "utf8");
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  const id = f.replace(/\.md$/, "");
  const ts = Date.parse(/created: (\S+)/.exec(raw)?.[1] ?? "") || 0;
  notes.push({ id, title: titleFromMarkdown(body), createdAt: ts, updatedAt: ts, tags: [], categories: [] } as NoteMeta);
  docs.push({ id, text: plainTextFromMarkdown(body) });
}
const index = new MemoryIndex();
let t = performance.now();
index.set(docs);
console.log(`notes=${notes.length} build=${(performance.now() - t).toFixed(0)}ms`);

const phrase = "What do I want today";
for (let i = 1; i <= phrase.length; i++) {
  const text = phrase.slice(0, i);
  t = performance.now();
  const out = runSearch(notes, { text, items: [] }, index);
  const search = performance.now() - t;
  t = performance.now();
  for (const term of text.toLowerCase().split(/\s+/).filter(Boolean)) index.query(term);
  const vocab = performance.now() - t;
  console.log(`   index.query only=${vocab.toFixed(1)}ms`);
  t = performance.now();
  searchSections(out.notes, out.match, Date.now());
  const sections = performance.now() - t;
  console.log(`${JSON.stringify(text).padEnd(24)} hits=${String(out.notes.length).padStart(5)} search=${search.toFixed(1)}ms sections=${sections.toFixed(1)}ms`);
}
