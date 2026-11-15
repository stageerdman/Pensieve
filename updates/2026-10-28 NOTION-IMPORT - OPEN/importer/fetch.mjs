#!/usr/bin/env node
// NOTION-IMPORT — step 1: pull the Notion "Pensieve / My Knowledge / Journal" data source
// into a local staging folder, newest page first, at the rate the Notion API allows.
//
// One-time migration tool (lives in the update folder, not in src/). No dependencies.
//   node fetch.mjs            → fetch everything not fetched yet (resumable, safe to re-run)
//   node fetch.mjs --limit 20 → stop after 20 new pages (for a trial run)
//
// Token: NOTION_TOKEN env var, or the file <appdata>/notion-token.txt (never in git).
// Output (personal data → outside the repo): <appdata>/notion-staging/
//   index.json            every page's properties, newest first (from the DB query)
//   pages/<pageId>.json   { page, blocks } — the full block tree, children inlined
//   files/<blockId>.<ext> uploaded images/files, downloaded right away (Notion URLs expire in 1h)
//   progress.json         counts + last error, rewritten after every page

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const APPDATA = path.join(os.homedir(), "Library/Application Support/xyz.erdman.pensieve");
const STAGING = path.join(APPDATA, "notion-staging");
const DATA_SOURCE = "80b931ad-abca-481d-a276-0ee392c30532";
const NOTION_VERSION = "2025-09-03";
const MIN_GAP_MS = 350; // Notion allows ~3 req/s on average

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

function readToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN.trim();
  const f = path.join(APPDATA, "notion-token.txt");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  console.error(`No token. Put the integration secret in ${f} (or NOTION_TOKEN).`);
  process.exit(1);
}
const TOKEN = readToken();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
let requests = 0;

async function notion(method, endpoint, body) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    requests++;
    let res;
    try {
      res = await fetch(`https://api.notion.com/v1/${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (attempt >= 6) throw e;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(ra > 0 ? ra * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    throw new Error(`${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function paginate(method, endpoint, body = {}) {
  const out = [];
  let cursor;
  do {
    const page =
      method === "GET"
        ? await notion("GET", `${endpoint}?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`)
        : await notion("POST", endpoint, { ...body, page_size: 100, start_cursor: cursor });
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

const FILE_TYPES = new Set(["image", "file", "pdf", "video", "audio"]);

function extFrom(url, fallback) {
  const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : fallback;
}

async function download(block) {
  const v = block[block.type];
  if (v?.type !== "file" || !v.file?.url) return; // external (e.g. YouTube) → nothing to download
  const ext = extFrom(v.file.url, block.type === "image" ? "png" : "bin");
  const dest = path.join(STAGING, "files", `${block.id}.${ext}`);
  if (!fs.existsSync(dest)) {
    const res = await fetch(v.file.url);
    if (!res.ok) throw new Error(`download ${block.id} → ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  block._localFile = path.basename(dest);
}

// Full block tree. Children are inlined as block._children. A synced-block copy pulls
// the ORIGINAL's children (owner: keep the text, not the sync). Child pages / inline
// databases are recorded but not descended into (they are separate pages).
async function blockTree(id, depth = 0) {
  const blocks = await paginate("GET", `blocks/${id}/children`);
  for (const b of blocks) {
    if (FILE_TYPES.has(b.type)) await download(b);
    if (b.type === "child_page" || b.type === "child_database") continue;
    if (b.type === "synced_block" && b.synced_block?.synced_from?.block_id) {
      try {
        b._children = await blockTree(b.synced_block.synced_from.block_id, depth + 1);
      } catch (e) {
        b._syncError = String(e.message); // original not shared with the integration
      }
      continue;
    }
    if (b.has_children && depth < 12) b._children = await blockTree(b.id, depth + 1);
  }
  return blocks;
}

function writeJson(f, v) {
  fs.writeFileSync(f + ".tmp", JSON.stringify(v));
  fs.renameSync(f + ".tmp", f); // atomic — a killed run never leaves half a file
}

async function main() {
  fs.mkdirSync(path.join(STAGING, "pages"), { recursive: true });
  fs.mkdirSync(path.join(STAGING, "files"), { recursive: true });

  console.log("Listing pages (newest first)…");
  const index = await paginate("POST", `data_sources/${DATA_SOURCE}/query`, {
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  });
  writeJson(path.join(STAGING, "index.json"), index);
  console.log(`${index.length} pages in Notion.`);

  const progress = { total: index.length, done: 0, fetchedThisRun: 0, failed: [], startedAt: new Date().toISOString() };
  const t0 = Date.now();
  for (const page of index) {
    const f = path.join(STAGING, "pages", `${page.id}.json`);
    const fresh = fs.existsSync(f) && JSON.parse(fs.readFileSync(f, "utf8")).page.last_edited_time === page.last_edited_time;
    if (fresh) { progress.done++; continue; }
    if (progress.fetchedThisRun >= LIMIT) break;
    try {
      const blocks = await blockTree(page.id);
      writeJson(f, { page, blocks });
      progress.done++;
      progress.fetchedThisRun++;
    } catch (e) {
      progress.failed.push({ id: page.id, created: page.created_time, error: String(e.message).slice(0, 300) });
    }
    const rate = progress.fetchedThisRun / ((Date.now() - t0) / 60000 || 1);
    const left = progress.total - progress.done;
    progress.etaMinutes = rate > 0 ? Math.round(left / rate) : null;
    writeJson(path.join(STAGING, "progress.json"), { ...progress, requests });
    process.stdout.write(`\r${progress.done}/${progress.total} pages · ${requests} requests · ${progress.failed.length} failed · ~${progress.etaMinutes ?? "?"} min left   `);
  }
  console.log(`\nDone. ${progress.done}/${progress.total} staged, ${progress.failed.length} failed.`);
  if (progress.failed.length) console.log("Re-run to retry the failed ones.");
}

main().catch((e) => {
  console.error("\n" + e.message);
  process.exit(1);
});
