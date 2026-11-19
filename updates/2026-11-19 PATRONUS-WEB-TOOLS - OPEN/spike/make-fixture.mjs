// Trims a recorded spike NDJSON into a small Rust test fixture: only the assistant
// tool_use/text blocks, the user tool_result events and the final result survive, with
// thinking blocks and noisy fields dropped. Usage: node make-fixture.mjs <in> <out>
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const keep = [];
for (const line of readFileSync(input, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const e = JSON.parse(line);
  if (e.type === "assistant") {
    const content = e.message.content.filter((b) => b.type === "tool_use" || b.type === "text");
    if (content.length) keep.push({ type: "assistant", message: { content } });
  } else if (e.type === "user" && !e.isSynthetic) {
    const content = (e.message.content ?? []).filter((b) => b.type === "tool_result");
    if (content.length) keep.push({ type: "user", message: { content }, tool_use_result: e.tool_use_result });
  } else if (e.type === "result") {
    keep.push({ type: "result", subtype: e.subtype, is_error: e.is_error, result: e.result, session_id: e.session_id, permission_denials: e.permission_denials });
  }
}
writeFileSync(output, keep.map((k) => JSON.stringify(k)).join("\n") + "\n");
console.log(`kept ${keep.length} events`);
