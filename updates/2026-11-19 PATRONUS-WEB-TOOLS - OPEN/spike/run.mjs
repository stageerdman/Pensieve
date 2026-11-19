// Phase 1 spike (throwaway): runs `claude -p` with Pensieve's flag shape and a given
// built-in tool grant, saves the NDJSON, prints the facts we need.
// Usage: node run.mjs <case> where case is one of: none | granted | notAllowed
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const which = process.argv[2] ?? "none";
const resume = process.argv[3];
const prompt = process.argv[4] ?? "Search the web: what is the latest stable Rust version? Answer in one line.";

const cases = {
  none: { tools: "", allowed: "" },
  granted: { tools: "WebSearch,WebFetch", allowed: "WebSearch,WebFetch" },
  notAllowed: { tools: "WebSearch,WebFetch", allowed: "" },
  // The exact "off" shape ai_tools/args.rs builds.
  off: { tools: "", allowed: "", disallowed: "WebSearch,WebFetch" },
  denied: { tools: "WebSearch,WebFetch", allowed: "", disallowed: "WebSearch,WebFetch" },
};
const c = cases[which];
const args = [
  "--output-format", "stream-json", "--include-partial-messages", "--verbose",
  "--permission-mode", "dontAsk", "--strict-mcp-config",
  "--allowedTools", c.allowed, "--tools", c.tools,
];
if (c.disallowed) args.push("--disallowedTools", c.disallowed);
if (process.env.SYS) args.push("--system-prompt", process.env.SYS);
if (resume) args.push("--resume", resume);
args.push("-p", "--", prompt);

const out = spawnSync("claude", args, { cwd: tmpdir(), encoding: "utf8", timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
const lines = out.stdout.split("\n").filter((l) => l.trim());
writeFileSync(join(here, `sample-${which}${resume ? "-resumed" : ""}.ndjson`), lines.filter((l) => !l.includes('"stream_event"')).join("\n") + "\n");

for (const line of lines) {
  const e = JSON.parse(line);
  if (e.type === "system" && e.subtype === "init") console.log("init tools:", JSON.stringify(e.tools));
  if (e.type === "assistant") for (const b of e.message.content) if (b.type === "tool_use") console.log("tool_use:", b.name, JSON.stringify(b.input));
  if (e.type === "user") for (const b of e.message.content ?? []) if (b.type === "tool_result") console.log("tool_result is_error:", b.is_error, JSON.stringify(b.content).slice(0, 200));
  if (e.type === "result") console.log("result:", JSON.stringify({ is_error: e.is_error, session: e.session_id, usage: e.usage, text: e.result, denials: e.permission_denials }));
}
console.log("exit:", out.status, out.signal, out.error?.message ?? "");
if (out.stderr) console.log("stderr:", out.stderr.slice(0, 500));
