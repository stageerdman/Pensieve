// NOTION-IMPORT — step 2: staged Notion JSON (from fetch.mjs) → Pensieve notes.
//
// Builds BlockNote-shaped blocks and serializes them with the APP'S OWN serializer
// (blocksToExtendedMd on the server-side BlockNote editor), so every note is written in
// exactly the format the editor itself writes. Mapping = owner's P5 spec in ../wiki.md.
//
//   npx tsx convert.ts --vault <dir>           write into <dir> (a vault root)
//   npx tsx convert.ts --vault <dir> --limit 50
//
// Two passes: (1) give every Notion page a stable Pensieve id (staging/idmap.json, reused
// across runs → re-running never duplicates), (2) convert, turning page→page references
// into {@id|title} + frontmatter `links`. Notes this importer did not create are never
// touched. A report (staging/report.json) lists PDFs/files skipped, child databases, etc.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../src/lib/md/extended";
import { composeFrontmatter } from "../../../src/lib/md/frontmatter";
import { titleFromMarkdown } from "../../../src/lib/text";
import { tagKey } from "../../../src/lib/tags/vocab";

const APPDATA = path.join(os.homedir(), "Library/Application Support/xyz.erdman.pensieve");
const STAGING = path.join(APPDATA, "notion-staging");
const HERE = path.dirname(new URL(import.meta.url).pathname);
const THREADS_FILE = path.join(HERE, "../../2026-11-13 TAGS - OPEN/notion-threads.json");

const args = process.argv.slice(2);
const argOf = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const VAULT = argOf("--vault");
const LIMIT = Number(argOf("--limit") ?? Infinity);
if (!VAULT) throw new Error("--vault <dir> is required (use a scratch copy first)");

// ── Mapping tables (owner, 2026-11-15) ─────────────────────────────────────────
const CAGS: Record<string, string> = {
  "📄Execution": "Execution",
  "🏆 Goal / Desire": "Execution",
  "📇Database": "Execution",
  "📙 Notes & Lessons": "Execution",
  "🧠 In my mind": "Journal",
  "🎞️ Memory Capture": "Journal",
  "💬 About others": "Journal",
  "💤Dream": "Journal",
  "⚖️ Decision": "Journal",
  "📚 Book": "Journal",
  "💡Ideas": "Idea",
};
const NOTION_LINKS = "Notion Links";

// ── Types (just what we read) ──────────────────────────────────────────────────
type RT = { type: string; plain_text: string; href: string | null; annotations: Record<string, boolean | string>; mention?: any; text?: any };
type NBlock = { id: string; type: string; has_children: boolean; _children?: NBlock[]; _localFile?: string; [k: string]: any };
type Inline = Record<string, unknown>;
type Block = { type: string; props?: Record<string, unknown>; content?: unknown; children?: Block[] };

const hex = (id: string) => id.replace(/-/g, "");
const ID_RE = /([0-9a-f]{32})(?:[?#]|$)/;

// ── State ──────────────────────────────────────────────────────────────────────
const index: any[] = JSON.parse(fs.readFileSync(path.join(STAGING, "index.json"), "utf8"));
const idmapFile = path.join(STAGING, "idmap.json");
const idmap: Record<string, string> = fs.existsSync(idmapFile) ? JSON.parse(fs.readFileSync(idmapFile, "utf8")) : {};
const titles: Record<string, string> = {}; // notion hex id → title
const resultTitles = loadResultTitles();
const threads = loadThreads();
const report: Record<string, { id: string; title: string; detail?: string }[]> = {};
const note = (kind: string, id: string, title: string, detail?: string) => (report[kind] ??= []).push({ id, title, detail });

function loadThreads(): Map<string, string> {
  // alias/name (by tagKey) → canonical thread name. Only names present in the vault's
  // tags.json vocabulary count (owner: threads only, descriptive Dags dropped).
  const vocab = JSON.parse(fs.readFileSync(path.join(VAULT!, "tags.json"), "utf8")).tags.map((t: any) => t.name as string);
  const map = new Map<string, string>();
  for (const v of vocab) map.set(tagKey(v), v);
  const nt = JSON.parse(fs.readFileSync(THREADS_FILE, "utf8"));
  for (const t of nt.threads) {
    if (!vocab.includes(t.name)) continue;
    for (const a of t.aliases ?? []) map.set(tagKey(a), t.name);
  }
  return map;
}

function loadResultTitles(): Map<string, string> {
  // Result pages live in a separate Notion DB the integration can't see. Their titles
  // come from the owner's CSV export (Result(s) column = "Title (url)" pairs).
  const out = new Map<string, string>();
  const zipDir = path.join(STAGING, "csv");
  if (!fs.existsSync(zipDir)) return out;
  for (const f of fs.readdirSync(zipDir, { recursive: true }) as string[]) {
    if (!f.endsWith("_all.csv")) continue;
    const text = fs.readFileSync(path.join(zipDir, f), "utf8");
    for (const m of text.matchAll(/([^,"\n]+?) \((https:\/\/app\.notion\.com\/p\/[^)]+)\)/g)) {
      const id = m[2].match(/([0-9a-f]{32})/)?.[1];
      if (id) out.set(id, m[1].trim());
    }
  }
  return out;
}

function pensieveIdFor(page: any): string {
  const h = hex(page.id);
  if (!idmap[h]) {
    const t = new Date(page.created_time).getTime().toString(36);
    idmap[h] = `${t}-n${h.slice(-5)}`; // same shape as newId(); deterministic suffix
  }
  return idmap[h];
}

const plain = (rts: RT[] = []) => rts.map((r) => r.plain_text).join("");

// ── Inline (rich text) ─────────────────────────────────────────────────────────
function inlines(rts: RT[] = [], ctx: Ctx): Inline[] {
  const out: Inline[] = [];
  for (const r of rts) {
    const a = r.annotations ?? {};
    const styles: Record<string, boolean> = {};
    if (a.bold) styles.bold = true;
    if (a.italic) styles.italic = true;
    if (a.strikethrough) styles.strike = true;
    if (a.code) styles.code = true;
    // page reference → a real Pensieve link when the page is in the import
    const refId =
      r.type === "mention" && r.mention?.type === "page"
        ? hex(r.mention.page.id)
        : r.href && (r.href.startsWith("/") || r.href.includes("notion.")) ? r.href.match(ID_RE)?.[1] : undefined;
    if (refId && idmap[refId] && refId !== ctx.self) {
      out.push({ type: "noteLink", props: { noteId: idmap[refId], title: titles[refId] || r.plain_text } });
      ctx.links.add(idmap[refId]);
      continue;
    }
    if (refId && r.type === "mention") ctx.unresolved.add(r.plain_text);
    const href = r.href && r.href.startsWith("/") ? `https://www.notion.so${r.href}` : r.href;
    // Notion soft line breaks inside a block → separate text runs keep the "\n"; BlockNote
    // serializes a "\n" in text as a hard break, which is what Notion shows.
    const text = { type: "text", text: r.plain_text, styles };
    out.push(href ? { type: "link", href, content: [text] } : text);
  }
  return out;
}

// ── Blocks ─────────────────────────────────────────────────────────────────────
interface Ctx { self: string; noteId: string; title: string; links: Set<string>; unresolved: Set<string>; media: [string, string][] }

const FENCE_OPEN = /```/;

async function toMd(blocks: Block[]): Promise<string> {
  return (await blocksToExtendedMd(editor, blocks)).replace(/\n+$/, "");
}

function mediaRefFor(b: NBlock, ctx: Ctx): string | null {
  if (!b._localFile) return null;
  const ext = path.extname(b._localFile).slice(1) || "png";
  const t = new Date(b.created_time ?? Date.now()).getTime().toString(36);
  const ref = `media/${ctx.noteId}/${t}-${hex(b.id).slice(0, 8)}.${ext}`;
  ctx.media.push([path.join(STAGING, "files", b._localFile), ref]);
  return ref;
}

const urlOf = (v: any): string | undefined => v?.external?.url ?? v?.file?.url ?? v?.url;
const linkPara = (url: string, label?: string): Block => ({
  type: "paragraph",
  content: [{ type: "link", href: url, content: [{ type: "text", text: label || url, styles: {} }] }],
});

async function convertBlocks(nbs: NBlock[], ctx: Ctx, inColumn = false): Promise<Block[]> {
  const out: Block[] = [];
  for (let i = 0; i < nbs.length; i++) {
    const b = nbs[i];
    const v = b[b.type] ?? {};
    const kids = () => convertBlocks(b._children ?? [], ctx, inColumn);
    switch (b.type) {
      case "paragraph":
        out.push({ type: "paragraph", content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const level = Number(b.type.slice(-1));
        if (v.is_toggleable) out.push({ type: "toggleListItem", content: inlines(v.rich_text, ctx), children: await kids() });
        else out.push({ type: "heading", props: { level }, content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      }
      case "bulleted_list_item":
        out.push({ type: "bulletListItem", content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      case "numbered_list_item":
        out.push({ type: "numberedListItem", content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      case "to_do":
        out.push({ type: "checkListItem", props: { checked: !!v.checked }, content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      case "toggle":
        out.push({ type: "toggleListItem", content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      case "quote":
        out.push({ type: "quote", content: inlines(v.rich_text, ctx), children: await kids() });
        break;
      case "code":
        out.push({ type: "codeBlock", props: { language: v.language === "plain text" ? "" : v.language }, content: [{ type: "text", text: plain(v.rich_text), styles: {} }] });
        break;
      case "divider":
        out.push({ type: "paragraph", content: [{ type: "text", text: "———", styles: {} }] });
        break;
      case "equation":
        out.push({ type: "paragraph", content: [{ type: "text", text: v.expression ?? "", styles: { code: true } }] });
        break;
      case "synced_block":
        // owner: keep the text, drop the sync
        out.push(...(await kids()));
        if (b._syncError) note("syncedBlockUnreadable", ctx.self, ctx.title, b._syncError);
        break;
      case "callout": {
        // Not rendered yet — kept in our own fence so a later update can render it.
        const body = [{ type: "paragraph", content: inlines(v.rich_text, ctx) } as Block, ...(await kids())];
        const md = await toMd(body);
        const icon = v.icon?.emoji ?? "";
        if (!md.replace(/​/g, "").trim()) {
          out.push({ type: "paragraph", content: [] }); // an empty "write here" box → a blank line
        } else if (FENCE_OPEN.test(md)) {
          out.push(...body); // a fence can't nest a fence → keep content plain
          note("calloutUnwrapped", ctx.self, ctx.title);
        } else out.push(fence("pensieve:callout", icon ? `icon=${icon}\n${md}` : md));
        break;
      }
      case "column_list": {
        const cols: string[] = [];
        let collide = false;
        const plainOut: Block[] = [];
        for (const col of b._children ?? []) {
          const blocks = await convertBlocks(col._children ?? [], ctx, true);
          plainOut.push(...blocks);
          const md = await toMd(blocks);
          if (FENCE_OPEN.test(md)) collide = true;
          cols.push(md);
        }
        if (collide) {
          out.push(...plainOut);
          note("columnsUnwrapped", ctx.self, ctx.title);
        } else out.push(fence("pensieve:columns", cols.join("\n:::column:::\n")));
        break;
      }
      case "image": {
        // A run of ≥2 images (only blank paragraphs between) → one gallery; a lone image
        // placed in the text stays an inline image. Inside a column: always inline.
        const run: NBlock[] = [b];
        let j = i + 1;
        while (!inColumn && j < nbs.length) {
          const n = nbs[j];
          if (n.type === "image") run.push(n);
          else if (!(n.type === "paragraph" && !plain(n.paragraph.rich_text).trim() && !n.has_children)) break;
          j++;
        }
        const imgs = run.map((x) => ({ url: mediaRefFor(x, ctx) ?? urlOf(x.image), caption: plain(x.image.caption) })).filter((x) => x.url);
        if (run.length >= 2) {
          out.push({ type: "imageGroup", props: { images: JSON.stringify(imgs.map((x) => ({ url: x.url, caption: x.caption || undefined }))) } });
          i = j - 1;
        } else if (imgs[0]) out.push({ type: "image", props: { url: imgs[0].url, caption: imgs[0].caption } });
        break;
      }
      case "video":
      case "audio": {
        const ref = mediaRefFor(b, ctx);
        if (ref) out.push({ type: b.type, props: { url: ref, caption: plain(v.caption) } });
        else if (urlOf(v)) out.push(linkPara(urlOf(v)!)); // owner: YouTube etc. → plain URL
        break;
      }
      case "embed":
      case "bookmark":
      case "link_preview":
        if (urlOf(v)) out.push(linkPara(urlOf(v)!, plain(v.caption) || undefined));
        break;
      case "file":
      case "pdf":
        if (v.type === "external") out.push(linkPara(urlOf(v)!, v.name || undefined));
        else note("fileSkipped", ctx.self, ctx.title, v.name ?? b._localFile); // owner: skip, list them
        break;
      case "link_to_page": {
        const target = hex(v.page_id ?? v.database_id ?? "");
        if (idmap[target]) {
          out.push({ type: "paragraph", content: [{ type: "noteLink", props: { noteId: idmap[target], title: titles[target] } }] });
          ctx.links.add(idmap[target]);
        } else note("linkToPageOutside", ctx.self, ctx.title, target);
        break;
      }
      case "child_page":
        out.push(linkPara(`https://www.notion.so/${hex(b.id)}`, v.title));
        note("childPage", ctx.self, ctx.title, v.title);
        break;
      case "child_database":
        note("childDatabase", ctx.self, ctx.title, v.title);
        break;
      case "table": {
        const rows = (b._children ?? []).filter((r) => r.type === "table_row");
        out.push({
          type: "table",
          content: { type: "tableContent", rows: rows.map((r) => ({ cells: r.table_row.cells.map((c: RT[]) => inlines(c, ctx)) })) },
        });
        break;
      }
      case "table_of_contents":
      case "breadcrumb":
        break;
      default:
        note("unsupportedBlock", ctx.self, ctx.title, b.type);
        if (b._children?.length) out.push(...(await kids()));
    }
  }
  return out;
}

function fence(language: string, text: string): Block {
  return { type: "codeBlock", props: { language }, content: [{ type: "text", text, styles: {} }] };
}

// ── Page → note ────────────────────────────────────────────────────────────────
const prop = (page: any, name: string) => page.properties?.[name];

function categoriesOf(page: any): string[] {
  const cags: string[] = (prop(page, "Cags")?.multi_select ?? []).map((o: any) => o.name);
  const out = new Set(cags.map((c) => CAGS[c]).filter(Boolean));
  for (const c of cags) if (!CAGS[c]) note("unknownCag", hex(page.id), "", c);
  if (out.size === 0) out.add("Journal"); // blank → Journal
  if ((prop(page, "Result(s)")?.relation ?? []).length) out.add(NOTION_LINKS);
  return [...out];
}

function tagsOf(page: any): string[] {
  const out = new Set<string>();
  for (const o of prop(page, "Dags")?.multi_select ?? []) {
    const t = threads.get(tagKey(o.name));
    if (t) out.add(t);
  }
  return [...out];
}

function createdAtOf(page: any): number {
  const created = new Date(page.created_time);
  const ov = prop(page, "Date Overwrite")?.date?.start as string | undefined;
  if (!ov) return created.getTime();
  if (ov.length > 10) return new Date(ov).getTime();
  // date-only override → that day, at the original time of day (local)
  const [y, m, d] = ov.split("-").map(Number);
  const t = new Date(created);
  t.setFullYear(y, m - 1, d);
  return t.getTime();
}

async function convertPage(page: any, blocks: NBlock[]) {
  const self = hex(page.id);
  const noteId = idmap[self];
  const title = titles[self];
  const ctx: Ctx = { self, noteId, title, links: new Set(), unresolved: new Set(), media: [] };

  for (const r of prop(page, "Pensieve (self)")?.relation ?? []) {
    const t = hex(r.id);
    if (idmap[t] && t !== self) ctx.links.add(idmap[t]);
  }

  const body: Block[] = [{ type: "heading", props: { level: 1 }, content: [{ type: "text", text: title || "Untitled", styles: {} }] }];
  body.push(...(await convertBlocks(blocks, ctx)));

  const results = (prop(page, "Result(s)")?.relation ?? []).map((r: any) => hex(r.id));
  if (results.length) {
    const content: Inline[] = [{ type: "text", text: "Results: ", styles: { bold: true } }];
    results.forEach((id: string, k: number) => {
      if (k) content.push({ type: "text", text: " · ", styles: {} });
      content.push({ type: "link", href: `https://www.notion.so/${id}`, content: [{ type: "text", text: resultTitles.get(id) ?? "Result", styles: {} }] });
    });
    body.push({ type: "paragraph", content: [] }, { type: "paragraph", content });
  }

  // Write the editor's own canonical form: load→save until stable, so opening the note
  // in the app never rewrites it (verify.ts checks this holds for every note).
  let md = await toMd(body);
  for (let k = 0; k < 3; k++) {
    const again = (await blocksToExtendedMd(editor, await extendedMdToBlocks(editor, md))).replace(/\n+$/, "");
    if (again === md) break;
    md = again;
  }
  const categories = categoriesOf(page);
  const tags = tagsOf(page);
  const links = [...ctx.links];
  const file = composeFrontmatter({ categories, tags, links }, md);
  const highlight = (prop(page, "Highlight")?.multi_select ?? []).map((o: any) => o.name);
  const createdAt = createdAtOf(page);
  const meta = {
    title: titleFromMarkdown(md),
    createdAt,
    addedAt: new Date(page.created_time).getTime(),
    updatedAt: new Date(page.last_edited_time).getTime(),
    categories,
    tags,
    pinned: highlight.includes("📌"),
    starred: highlight.includes("⭐"),
    notionId: self, // provenance — lets a re-run / later update find the source page
  };
  return { noteId, file, meta, media: ctx.media, unresolved: [...ctx.unresolved] };
}

// ── Main ───────────────────────────────────────────────────────────────────────
const editor = ServerBlockNoteEditor.create();

async function main() {
  // pass 1 — ids + titles for every page in Notion (staged or not), so links resolve
  for (const page of index) {
    pensieveIdFor(page);
    const tp = Object.values(page.properties).find((p: any) => p.type === "title") as any;
    titles[hex(page.id)] = plain(tp?.title).replace(/\s+/g, " ").trim();
  }
  fs.writeFileSync(idmapFile, JSON.stringify(idmap, null, 1));

  const notesDir = path.join(VAULT!, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  // never overwrite a note this importer didn't make
  const ours = new Set(Object.values(idmap));
  let written = 0, missing = 0, failed = 0;
  for (const page of index) {
    if (written >= LIMIT) break;
    const f = path.join(STAGING, "pages", `${page.id}.json`);
    if (!fs.existsSync(f)) { missing++; continue; }
    const { blocks } = JSON.parse(fs.readFileSync(f, "utf8"));
    try {
      const r = await convertPage(page, blocks);
      if (!ours.has(r.noteId)) throw new Error("id not owned by importer");
      for (const [src, ref] of r.media) {
        const dest = path.join(VAULT!, ref);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      fs.writeFileSync(path.join(notesDir, `${r.noteId}.md`), r.file);
      fs.writeFileSync(path.join(notesDir, `${r.noteId}.meta.json`), JSON.stringify(r.meta));
      if (r.unresolved.length) note("mentionOutsideImport", hex(page.id), titles[hex(page.id)], r.unresolved.join(" | "));
      written++;
    } catch (e: any) {
      failed++;
      note("convertFailed", hex(page.id), titles[hex(page.id)], String(e?.stack ?? e).slice(0, 400));
    }
  }

  // the "Notion Links" category must exist for the sidebar to show it
  const catFile = path.join(VAULT!, "categories.json");
  const cats = JSON.parse(fs.readFileSync(catFile, "utf8"));
  if (!cats.categories.some((c: any) => c.name === NOTION_LINKS)) {
    cats.categories.push({ name: NOTION_LINKS, color: "orange" });
    fs.writeFileSync(catFile, JSON.stringify(cats));
  }

  fs.writeFileSync(path.join(STAGING, "report.json"), JSON.stringify({ written, missing, failed, report }, null, 1));
  console.log(`written ${written} · not yet fetched ${missing} · failed ${failed}`);
  for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${v.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
