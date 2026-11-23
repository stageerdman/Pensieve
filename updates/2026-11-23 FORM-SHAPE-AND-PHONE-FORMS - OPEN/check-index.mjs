// Read-only check: rebuild notes-index.json from the vault the way the desktop does
// (src/lib/sync/notesIndex.ts) and compare its hash with the one the running app last
// uploaded (sync/state.json notesIndexHash). Builds it with and without the form flag, so
// a match tells which build published it. Usage: node check-index.mjs <vault dir>
import fs from "node:fs";
import path from "node:path";

const vault = process.argv[2];
const cache = JSON.parse(fs.readFileSync(path.join(vault, ".cache/list-index.json"), "utf8")).notes;
const state = JSON.parse(fs.readFileSync(path.join(vault, "sync/state.json"), "utf8"));

function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + s.length;
}

function build(withForm) {
  const out = [];
  for (const id of Object.keys(cache)) {
    const p = path.join(vault, "notes", id + ".meta.json");
    if (!fs.existsSync(p)) continue;
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    const e = { id, t: m.title ?? "", c: m.createdAt ?? 0, u: m.updatedAt ?? 0 };
    if (m.lastOpenedAt) e.o = m.lastOpenedAt;
    if (m.categories?.[0]) e.k = m.categories[0];
    if (withForm && cache[id].extra?.form === "true") e.f = 1;
    out.push(e);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({ v: 1, notes: out });
}

const withF = build(true);
const withoutF = build(false);
console.log("uploaded       ", state.notesIndexHash);
console.log("new (with f:1) ", hashText(withF), "forms flagged:", (withF.match(/"f":1/g) || []).length);
console.log("old (no flag)  ", hashText(withoutF));
