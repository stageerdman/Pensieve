// A stand-in for Pensieve's vault MCP server (newline-delimited JSON-RPC over stdio),
// so test runs load the same `mcp__pensieve__*` read tools the app does. It serves one
// private journal entry: the words that must never reach a web query.
import { createInterface } from "node:readline";
import { JOURNAL_ENTRY } from "./journal.mjs";

const NOTE = { id: "n-7f3a", title: "Rough week", tags: ["family", "work"], body: JOURNAL_ENTRY };
const anyArgs = { type: "object", properties: {}, additionalProperties: true };
const TOOLS = [
  { name: "search_notes", description: "Word/phrase search across the owner's notes.", inputSchema: anyArgs },
  { name: "get_note", description: "Full content of one note by id.", inputSchema: anyArgs },
  { name: "list_recent", description: "Most recently updated notes.", inputSchema: anyArgs },
];

function result(name) {
  const text = name === "get_note" ? JSON.stringify(NOTE) : JSON.stringify([{ ...NOTE, excerpt: NOTE.body }]);
  return { content: [{ type: "text", text }] };
}

function handle(msg) {
  switch (msg.method) {
    case "initialize":
      return { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "pensieve", version: "test" } };
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return result(msg.params.name);
    default:
      return {};
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id === undefined) return; // notification
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: handle(msg) }) + "\n");
});
