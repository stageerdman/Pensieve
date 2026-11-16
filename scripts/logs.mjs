#!/usr/bin/env node
// Query the desktop app's persisted logs (~/Library/Logs/xyz.erdman.pensieve/ui.jsonl +
// its one rotated generation). Small filtered results, newest first — never a full dump.
//   npm run logs -- --module sync --event plan --level info --since 2h --limit 20
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = path.join(os.homedir(), "Library/Logs/xyz.erdman.pensieve");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const min = LEVELS[args.level ?? "debug"] ?? 0;
const limit = Math.min(Number(args.limit ?? 50), 500);
const since = (() => {
  const s = args.since;
  if (!s) return 0;
  const m = /^(\d+)([mhd])$/.exec(s);
  if (m) return Date.now() - Number(m[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
  return Date.parse(s) || 0;
})();

const lines = [];
for (const f of ["ui.1.jsonl", "ui.jsonl"]) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) lines.push(...fs.readFileSync(p, "utf8").split("\n"));
}
const out = [];
for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
  if (!lines[i]) continue;
  let e;
  try { e = JSON.parse(lines[i]); } catch { continue; }
  if ((LEVELS[e.level] ?? 0) < min) continue;
  if (args.module && e.module !== args.module) continue;
  if (args.event && !String(e.event).includes(args.event)) continue;
  if (args.session && e.session !== args.session) continue;
  if (e.ts < since) continue;
  out.push(e);
}
for (const e of out.reverse()) {
  const t = new Date(e.ts).toLocaleString();
  console.log(`${t} [${e.level}] ${e.module}:${e.event} (${e.session})${e.data !== undefined ? " " + JSON.stringify(e.data) : ""}`);
}
if (!out.length) console.log("(no matching log entries)");
