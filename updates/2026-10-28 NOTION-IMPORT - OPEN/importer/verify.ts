// NOTION-IMPORT — step 3: prove every imported note survives the editor's own load→save.
// For each note the importer wrote (staging/idmap.json), parse its body with the app's
// extendedMdToBlocks and re-serialize with blocksToExtendedMd. If the result differs, the
// editor would rewrite (and possibly lose) something the first time the note is opened.
//
//   npx tsx verify.ts --vault <dir>

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { blocksToExtendedMd, extendedMdToBlocks } from "../../../src/lib/md/extended";
import { parseFrontmatter } from "../../../src/lib/md/frontmatter";

const STAGING = path.join(os.homedir(), "Library/Application Support/xyz.erdman.pensieve/notion-staging");
const args = process.argv.slice(2);
const VAULT = args[args.indexOf("--vault") + 1];
const idmap: Record<string, string> = JSON.parse(fs.readFileSync(path.join(STAGING, "idmap.json"), "utf8"));
const editor = ServerBlockNoteEditor.create();
const norm = (s: string) => s.replace(/\n+$/, "");

let ok = 0, diff = 0, missingMedia = 0;
const diffs: { id: string; a: string; b: string }[] = [];
for (const id of Object.values(idmap)) {
  const f = path.join(VAULT, "notes", `${id}.md`);
  if (!fs.existsSync(f)) continue;
  const { body } = parseFrontmatter(fs.readFileSync(f, "utf8"));
  for (const m of body.matchAll(/media\/[^\s)|]+/g)) if (!fs.existsSync(path.join(VAULT, m[0]))) missingMedia++;
  const again = await blocksToExtendedMd(editor, await extendedMdToBlocks(editor, body));
  if (norm(again) === norm(body)) ok++;
  else {
    diff++;
    const a = norm(body).split("\n"), b = norm(again).split("\n");
    const k = a.findIndex((l, i) => l !== b[i]);
    diffs.push({ id, a: a.slice(k, k + 3).join("⏎"), b: b.slice(k, k + 3).join("⏎") });
  }
}
console.log(`round-trip identical ${ok} · differs ${diff} · missing media files ${missingMedia}`);
for (const d of diffs.slice(0, 15)) console.log(`\n${d.id}\n  file : ${d.a.slice(0, 200)}\n  again: ${d.b.slice(0, 200)}`);
