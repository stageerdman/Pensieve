// Phase 6 spike: a REAL Compress cast end to end, on a throwaway vault (never the owner's):
// real `claude -p` + the real Pensieve MCP server (the debug app binary re-exec'd with
// PENSIEVE_MCP_SERVER, READ tools only, same flags as ai_text.rs vault_tool_args) → the real
// lib/formSpells castSpell → the memory's markdown with date chips.
// Run: npx tsx "updates/2026-11-12 FORMS - OPEN/spike-p6/live-compress.ts" <scratch-dir> [<app binary>]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { memoryFromForm, parseForm, applyAnswers } from "../../../src/lib/forms";
import { castSpell } from "../../../src/lib/formSpells";
import type { Note, TimelineEntry } from "../../../src/lib/types";

const dir = process.argv[2];
if (!dir) throw new Error("usage: live-compress.ts <scratch-dir> [<binary>]");
const binary = process.argv[3] ?? join(homedir(), ".cargo-shared-target/debug/pensieve");
const vault = join(dir, "vault");
rmSync(vault, { recursive: true, force: true });
mkdirSync(join(vault, "notes"), { recursive: true });

const WEEKLY = `Weekly Reflection

**What were my wins this week?**

**What did I learn?**

**What will I do differently next week?**

\`\`\`pensieve:patronus
spell: compress
Go through my Daily Reviews from this week and pull out the wins, the lessons and what to change.
\`\`\``;

const DAILY = `Daily Review

**Was I a king?**

**What I feel I failed at today? → What's the lesson?**`;

const at = (d: number) => new Date(2026, 10, d, 21).getTime();
const notes = new Map<string, Note>();
function put(id: string, markdown: string, createdAt: number, extra?: Record<string, string>) {
  const n: Note = { id, title: parseForm(markdown).title, markdown, createdAt, addedAt: createdAt, updatedAt: createdAt, categories: [], tags: [], links: [], pinned: false, starred: false, extra };
  notes.set(id, n);
  const fm = extra ? "---\ntags: []\nlinks: []\n" + Object.entries(extra).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n---\n\n" : "";
  writeFileSync(join(vault, "notes", `${id}.md`), fm + markdown);
  writeFileSync(join(vault, "notes", `${id}.meta.json`), JSON.stringify({ title: n.title, createdAt, updatedAt: createdAt }));
}
const daily = (d: number, king: string, fail: string) => {
  const md = memoryFromForm(DAILY, new Date(at(d)));
  const [k, f] = parseForm(md).fields;
  put(`daily-${d}`, applyAnswers(md, { [k.id]: { text: king }, [f.id]: { text: fail } }), at(d), { fromForm: "daily" });
};
put("daily", DAILY, at(1), { form: "true" });
put("weekly", WEEKLY, at(1), { form: "true" });
daily(8, "Old week: shouldn't be cited.", "Old week.");
daily(9, "Na hovoru s Novákem jsem držel rámec a uzavřel deal.", "Odkládal jsem email Petrovi. Lekce: udělat to hned ráno.");
daily(11, "Gym even though I didn't feel like it.", "Gave a discount too fast to the second client — trust my price.");
daily(13, "Led the team call, admitted my mistake openly.", "Scrolled my phone for an hour in the evening. Phone out of the bedroom.");
put("loose-12", "Grocery list\n\nmilk, eggs", at(12));
const weeklyMd = memoryFromForm(WEEKLY, new Date(at(15)));
put("w-15", weeklyMd, at(15), { fromForm: "weekly" });

const config = join(dir, "mcp.json");
writeFileSync(config, JSON.stringify({ mcpServers: { pensieve: { command: binary, args: [], env: { PENSIEVE_MCP_SERVER: "1", PENSIEVE_VAULT_ROOT: vault } } } }));
const READ = ["search_notes", "get_note", "list_recent", "list_notes", "list_tags"].map((t) => `mcp__pensieve__${t}`).join(",");
const cwd = join(dir, "cwd");
mkdirSync(cwd, { recursive: true });

let timeline: TimelineEntry[] = [];
const t0 = Date.now();
const result = await castSpell("w-15", "Compress", {
  load: async (id) => notes.get(id) ?? null,
  save: async (n) => void notes.set(n.id, n),
  loadTimeline: async () => timeline,
  saveTimeline: async (_id, e) => void (timeline = e),
  ask: async (prompt) => {
    const raw = execFileSync(
      "claude",
      ["--mcp-config", config, "--strict-mcp-config", "--allowedTools", READ, "--tools", "", "--permission-mode", "dontAsk", "-p"],
      { input: prompt, cwd, encoding: "utf8", timeout: 300_000 },
    );
    console.log("RAW REPLY\n", raw);
    return raw;
  },
  now: () => new Date(at(15)),
});
console.log("SECONDS", ((Date.now() - t0) / 1000).toFixed(1));
console.log("RESULT", result);
console.log("MEMORY\n" + notes.get("w-15")!.markdown);
console.log("unchanged on disk (MCP is read-only):", readFileSync(join(vault, "notes", "w-15.md"), "utf8").includes(weeklyMd));
