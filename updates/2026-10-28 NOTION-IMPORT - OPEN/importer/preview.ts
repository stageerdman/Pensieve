// NOTION-IMPORT — owner review page: a self-contained local .html (no network, file://-safe)
// showing the dry-run stats, the report lists, and sample notes rendered from the converted
// .md by the app's own BlockNote parser.
//
//   npx tsx preview.ts --vault <dryvault> --out <file.html>

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { extendedMdToBlocks } from "../../../src/lib/md/extended";
import { parseFrontmatter } from "../../../src/lib/md/frontmatter";

const STAGING = path.join(os.homedir(), "Library/Application Support/xyz.erdman.pensieve/notion-staging");
const args = process.argv.slice(2);
const VAULT = args[args.indexOf("--vault") + 1];
const OUT = args[args.indexOf("--out") + 1];
const editor = ServerBlockNoteEditor.create();

const idmap: Record<string, string> = JSON.parse(fs.readFileSync(path.join(STAGING, "idmap.json"), "utf8"));
const { written, report } = JSON.parse(fs.readFileSync(path.join(STAGING, "report.json"), "utf8"));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type N = { id: string; meta: any; fields: any; body: string };
const notes: N[] = [];
for (const id of Object.values(idmap)) {
  const f = path.join(VAULT, "notes", `${id}.md`);
  if (!fs.existsSync(f)) continue;
  const { fields, body } = parseFrontmatter(fs.readFileSync(f, "utf8"));
  notes.push({ id, fields, body, meta: JSON.parse(fs.readFileSync(path.join(VAULT, "notes", `${id}.meta.json`), "utf8")) });
}
const byId = new Map(notes.map((n) => [n.id, n]));

// Samples: one per category per year where possible, plus feature-bearing notes.
const pick = new Map<string, N>();
const add = (n?: N) => n && pick.size < 16 && pick.set(n.id, n);
const year = (n: N) => new Date(n.meta.createdAt).getFullYear();
for (const y of [2023, 2024, 2025, 2026])
  for (const c of ["Journal", "Execution", "Idea"]) add(notes.find((n) => year(n) === y && n.fields.categories[0] === c && n.body.length > 400));
add(notes.find((n) => n.body.includes("pensieve:gallery")));
add(notes.find((n) => n.body.includes("pensieve:video")));
add(notes.find((n) => /\{@[^|]+\|/.test(n.body)));
add(notes.find((n) => n.meta.starred));
add(notes.find((n) => n.fields.categories.includes("Notion Links")));
add(notes.find((n) => n.body.includes("pensieve:callout")));

const vaultUrl = (ref: string) => "file://" + path.join(VAULT, ref);
async function render(n: N): Promise<string> {
  // Preview only: pensieve:* fences → simple HTML here (the server editor has no custom
  // blocks); everything else goes through BlockNote's own markdown parser.
  const fenced = n.body.replace(/```(pensieve:[a-z]+)\n([\s\S]*?)\n```/g, (_m, lang: string, inner: string) => {
    const refs = inner.split("\n").map((l) => l.split(" | ")[0].trim()).filter((l) => l.startsWith("media/"));
    if (lang === "pensieve:gallery" || lang === "pensieve:image")
      return `\n<div class="gallery">${refs.map((r) => `<img src="${vaultUrl(r)}">`).join("")}</div>\n`;
    if (lang === "pensieve:video") return `\n<video controls preload="none" src="${vaultUrl(refs[0] ?? "")}"></video>\n`;
    return `\n<div class="fence"><b>${lang}</b><pre>${esc(inner)}</pre></div>\n`;
  });
  const parts = fenced.split(/(\n<(?:div|video)[\s\S]*?<\/(?:div|video)>\n)/);
  let html = "";
  for (const part of parts) {
    if (part.startsWith("\n<")) { html += part; continue; }
    const md = part.replace(/!\[([^\]]*)\]\((media\/[^)]+)\)/g, (_m, alt, r) => `![${alt}](${vaultUrl(r)})`);
    const blocks = await editor.tryParseMarkdownToBlocks(md);
    html += await editor.blocksToHTMLLossy(blocks as any);
  }
  html = html.replace(/\{@([^|{}]*)\|([^{}]*)\}/g, (_m, id, t) => `<a class="ref" href="#${id}">↗ ${esc(t)}${byId.has(id) ? "" : " (not in sample)"}</a>`);
  return html;
}

const chips = (n: N) =>
  [...n.fields.categories.map((c: string) => `<span class="chip cat">${esc(c)}</span>`), ...n.fields.tags.map((t: string) => `<span class="chip tag">${esc(t)}</span>`), n.meta.starred ? `<span class="chip star">★ starred</span>` : ""].join(" ");

const list = (k: string, label: string) =>
  report[k]?.length
    ? `<h3>${label} <small>(${report[k].length})</small></h3><ul>${report[k].map((x: any) => `<li>${esc(x.title || x.id)}${x.detail ? ` — <code>${esc(String(x.detail).slice(0, 120))}</code>` : ""}</li>`).join("")}</ul>`
    : "";

const cats: Record<string, number> = {};
const tags: Record<string, number> = {};
for (const n of notes) {
  for (const c of n.fields.categories) cats[c] = (cats[c] ?? 0) + 1;
  for (const t of n.fields.tags) tags[t] = (tags[t] ?? 0) + 1;
}
const kv = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(k)} · ${v}</span>`).join(" ");

const sections: string[] = [];
for (const n of pick.values()) {
  sections.push(`<article id="${n.id}"><header><h2>${esc(n.meta.title)}</h2><div class="sub">${new Date(n.meta.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${chips(n)}</div></header>${await render(n)}<details><summary>Raw .md</summary><pre>${esc(n.body)}</pre></details></article>`);
}

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notion Import Preview</title>
<style>
:root{--bg:#fafaf8;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e2dc;--card:#fff;--accent:#3b6fd8;--gold:#c99a2e}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--muted:#9a9890;--line:#2c2b28;--card:#1e1e1c;--accent:#7aa2f7;--gold:#e0b84d}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,system-ui,sans-serif}
main{max-width:72ch;margin:0 auto;padding:32px 16px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:22px;margin:0}h3{margin:28px 0 8px;font-size:16px}
.sub,small{color:var(--muted);font-size:13px}
article{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin:20px 0}
article header{margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:10px}
.chip{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin:2px 2px 2px 0}
.chip.cat{border-color:var(--accent);color:var(--accent)}.chip.star{border-color:var(--gold);color:var(--gold)}
img{max-width:100%;border-radius:6px}pre{white-space:pre-wrap;font-size:12px;background:var(--bg);padding:10px;border-radius:6px;overflow-x:auto}
code{font-size:12px}a{color:var(--accent)}a.ref{text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:0 6px}
blockquote{border-left:3px solid var(--line);margin:0;padding-left:12px;color:var(--muted)}
table{border-collapse:collapse}.gallery{display:flex;flex-wrap:wrap;gap:6px}.gallery img{max-height:160px;width:auto}video{max-width:100%}.fence{border:1px dashed var(--line);border-radius:6px;padding:6px 10px;margin:8px 0}.fence b{font-size:12px;color:var(--muted)}td,th{border:1px solid var(--line);padding:4px 8px}
</style></head><body><main>
<h1>Notion import — dry run</h1>
<p class="sub">${written} notes converted into a copy of your vault. Nothing has touched your real vault yet.</p>
<h3>Categories</h3><p>${kv(cats)}</p>
<h3>Thread tags</h3><p>${kv(tags) || "<span class='sub'>none</span>"}</p>
${list("fileSkipped", "PDFs / files skipped (as you chose)")}
${list("childPage", "Notion sub-pages (kept as a link back to Notion)")}
${list("columnsUnwrapped", "Columns flattened (content kept, layout not)")}
${list("calloutUnwrapped", "Callouts flattened (content kept, box not)")}
${list("stylesSimplified", "Italics dropped (bold inside italic can't be stored stably)")}
${list("mentionOutsideImport", "References to pages outside the Pensieve database")}
<h3>Not imported, by design</h3><ul><li>${report.childDatabase?.length ?? 0} embedded "View of Standards DB" habit trackers (a live Notion tool, not memory content)</li><li>Notion template buttons</li></ul>
<h2 style="margin-top:36px">Sample notes</h2>
${sections.join("\n")}
</main></body></html>`;
fs.writeFileSync(OUT, page);
console.log(`wrote ${OUT} (${pick.size} samples)`);
