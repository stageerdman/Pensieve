# PATRONUS-AI — wiki

Durable decisions and lessons as this gets built. Seeded from researching
`/Users/stage/dev/masters-wheel` (a sibling Tauri app with this exact pattern already
shipped) before writing any code.

## Ported from masters-wheel, verified by reading its actual source (not guessed)
- **The app's own binary is the MCP server.** No second bundled executable: a
  `PENSIEVE_MCP_SERVER=1` env var, checked at the very top of `lib.rs::run()`, switches
  the process into `mcp::server::run_stdio()` instead of launching the GUI. The
  `--mcp-config` JSON passed to `claude` points `command` at `std::env::current_exe()`
  with that env var set.
- **`claude -p` CLI invocation gotchas** (masters-wheel hit all of these for real):
  - `--system-prompt` *replaces* the default persona; `--append-system-prompt` caused
    persona-breaking bleed-through. Use replace.
  - `--tools ""` is required *in addition to* `--mcp-config`/`--allowedTools`, or the
    built-in tool schemas bloat every single reply ~3x in token cost.
  - `-p` + `--` + the message must be the last positional args — a message that happens
    to start with `-` otherwise misparses as a flag.
  - stderr must be drained concurrently on its own thread while reading stdout, or the
    child process deadlocks on a full pipe.
  - No timeout is implemented on the CLI call — `child.wait()` blocks indefinitely.
    Carried forward as-is for v1; revisit if a hung call is ever reported.
- **Streaming shape:** `--output-format stream-json --include-partial-messages`, stdout
  is NDJSON, forward `content_block_delta` as UI deltas, trust only the final `result`
  event for authoritative text + `session_id` + token usage. `session_id` round-trips via
  `--resume` next turn — conversation history lives in the CLI's own transcript, not in
  app-owned storage.
- **Why Pensieve's existing `ai_vision.rs` (single-shot, stdin-prompt, PATH-augmented)
  doesn't need to change**: it's a different, already-shipped feature (RAW-MEMORY-JOURNAL
  page description). PATRONUS-AI is new code (`assistant.rs`) that reuses its
  PATH/binary-resolve helper, not a replacement of it.

## Pensieve-specific adaptations (the parts masters-wheel didn't need)
- No SQLite/structured index exists yet — MCP read tools hit the vault filesystem
  directly (reusing `vault_root`/`resolve` from `lib.rs`), not a database query. If a real
  index ever ships, only the tool *implementations* change, not their MCP contracts.
- `tokio` + `rmcp` are new Cargo dependencies — Pensieve had neither. Scoped tightly to
  the MCP-server code path so the normal GUI build stays as sync/blocking as it already
  is everywhere else.
- Write MCP tools (`create_note`/`edit_note`/...) are built in this phase but deliberately
  left out of `ALLOWED_TOOLS` — built-but-dormant, not "build later." Turning them on is a
  one-line allowlist change once there's a real undo/permission story, not a new feature.

## Verified end-to-end (2026-11-10)
Smoke-tested the full real pipeline by hand, not just unit tests: wrote a throwaway
vault with one distinctive note ("kayaking alone at sunrise near Bear Lake... calmest
I've been in months"), hand-built the exact `--mcp-config` JSON `assistant.rs` generates,
and ran the real `claude -p --output-format stream-json ... --mcp-config ...
--allowedTools mcp__pensieve__search_notes,... --tools ""` command against it — the same
args the Rust code builds, just typed by hand instead of invoked through Tauri. Result:
`search_notes` was actually called (8 references to `mcp__pensieve__search_notes` in the
stream), and the final answer was correctly grounded in the real note content ("You
wrote about kayaking on Bear Lake at sunrise, feeling calm and peaceful..."). This
confirms the CLI → --mcp-config → own-binary-as-MCP-server → tool → vault file chain
actually works, not just that each piece type-checks in isolation.

Not yet verified: the actual GUI click-through (orb → window → live streaming text) —
no native-macOS-window driving capability available in this environment, only Chrome
browser automation. Needs the owner's own click-test once the native app is built.

## A masters-wheel assumption that doesn't hold on this CLI version (verified by hand)
masters-wheel's own `assistant.rs` reads a tool_result's `content` field as a plain
string (`block.get("content").and_then(|v| v.as_str())`). On the live `claude` CLI
(2.1.212) actually installed here, a tool_result's `content` is an **array of content
blocks** — `[{"type":"text","text":"<the tool's real output>"}]` — matching the real
Anthropic Messages API tool_result shape, not a flattened string. Confirmed by hand:
ran the exact `claude -p --mcp-config ...` command assistant.rs builds against a real
MCP tool call and inspected the raw NDJSON. If a future masters-wheel-ported feature
reads a `tool_result` block, read `content[0].text`, not `content` directly — don't
copy that part of masters-wheel's code without checking the live shape first.

## Open questions / revisit later
- Chat history persistence location (not the note vault — chats aren't notes). Right now
  conversations live only in memory (`useAssistant`'s React state) and are lost on
  app restart. If persisted, likely mirrors `secrets.json`'s precedent:
  `$APPDATA/xyz.erdman.pensieve/` rather than inside the vault folder the owner syncs
  via OneDrive — or could follow `agents.json`'s own precedent and just live in the
  vault instead. Not decided; no persistence exists yet either way.
- Agent roster editing UI now exists (`AgentsEditor.tsx`, backed by `agents.json` via
  `lib/ai/agentStore.ts`) — the "owner may rename/add agents once the picker UI exists"
  note from Phase 1 is resolved. Starting roster is still just Patronus + Curator.
- Write MCP tools (`create_note`/`edit_note`/`add_tag`/`link_note`) have never actually
  been invoked by the CLI in this session — only unit-level/schema-level checks. If
  they're ever flipped on in `mcp/config.rs::ALLOWED_TOOLS`, do a real hand-test the same
  way the read tools got one (see "Verified end-to-end" above) before trusting them.
- No GUI click-through yet at all — see "Paused here" in `update v1.md` for the full list
  of what that would exercise for the first time.
