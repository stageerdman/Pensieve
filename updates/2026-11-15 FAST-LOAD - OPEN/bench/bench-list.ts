// FAST-LOAD TS-side benchmark: the old list() pipeline vs the new cache-served one, run in
// Node against a vault COPY (never the live vault). IPC is not simulated — the old path's
// ~2 invokes/note cost comes ON TOP of the "old" number here (see wiki.md).
//
//   npx tsx "updates/2026-11-15 FAST-LOAD - OPEN/bench/bench-list.ts" <vault-copy>

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../../../src/lib/md/frontmatter";
import { contentCharCount, excerptFromMarkdown } from "../../../src/lib/text";
import {
  emptyListCache,
  mergeListing,
  parseListCache,
  type ListMeta,
  type NoteRecord,
} from "../../../src/lib/store/listCache";

const root = process.argv[2];
if (!root) throw new Error("usage: bench-list.ts <vault-copy>");
const notes = join(root, "notes");

async function oldList() {
  // Exactly the old TauriStore.list() shape: per note, await meta, await .md, parse, derive.
  const ids = (await readdir(notes)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  const out = [];
  for (const id of ids) {
    const raw = await readFile(join(notes, `${id}.meta.json`), "utf8").catch(() => null);
    if (!raw) continue;
    const m = JSON.parse(raw) as ListMeta;
    const file = await readFile(join(notes, `${id}.md`), "utf8").catch(() => null);
    const parsed = file ? parseFrontmatter(file) : null;
    out.push({ id, ...m, links: parsed?.fields.links ?? [], excerpt: parsed ? excerptFromMarkdown(parsed.body) : "", chars: parsed ? contentCharCount(parsed.body) : 0 });
  }
  return out;
}

// What list_notes_bulk returns (built here in Node; the Rust side is timed by bench-rust.sh).
async function records(withMd: boolean): Promise<NoteRecord[]> {
  const ids = (await readdir(notes)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  return Promise.all(
    ids.map(async (id) => {
      const raw = await readFile(join(notes, `${id}.meta.json`), "utf8").catch(() => null);
      const s = await stat(join(notes, `${id}.md`));
      return {
        id,
        meta: raw ? (JSON.parse(raw) as ListMeta) : null,
        stamp: [Math.round(s.mtimeMs * 1000), s.size] as [number, number],
        md: withMd ? await readFile(join(notes, `${id}.md`), "utf8") : null,
      };
    }),
  );
}

const time = async <T>(f: () => Promise<T> | T): Promise<[T, number]> => {
  const t = performance.now();
  const r = await f();
  return [r, performance.now() - t];
};

const [old, tOld] = await time(oldList);
const cold = await records(true);
const warm = await records(false);
// Cold: no cache → derive every note from its body (one-time, after a cache wipe/version bump).
const [coldMerged, tCold] = await time(() => mergeListing(cold, emptyListCache()));
const cacheJson = JSON.stringify(coldMerged.cache);
// Warm: parse the persisted cache file + fold body-less records (every launch after).
const [warmMerged, tWarm] = await time(() => mergeListing(warm, parseListCache(cacheJson)));
const same = JSON.stringify(warmMerged.metas.map((m) => [m.id, m.excerpt, m.chars])) ===
  JSON.stringify(coldMerged.metas.map((m) => [m.id, m.excerpt, m.chars]));

// The new path must list exactly what the old one did (same ids, excerpts, chars, links).
const key = (xs: { id: string; excerpt?: string; chars?: number; links?: string[] }[]) =>
  JSON.stringify(xs.map((m) => [m.id, m.excerpt, m.chars, m.links]).sort());
const oldEqualsNew = key(old) === key(warmMerged.metas);

console.log(
  JSON.stringify({
    notes: old.length,
    old_serial_ms: Math.round(tOld),
    old_invokes: old.length * 2 + 1,
    new_cold_derive_ms: Math.round(tCold),
    new_warm_merge_ms: Math.round(tWarm),
    cache_bytes: cacheJson.length,
    warm_matches_cold: same,
    old_equals_new: oldEqualsNew,
  }),
);
