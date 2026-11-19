# PATRONUS-WEB-TOOLS — web search, and the user picks each chat's tools

## Goal
Any Patronus can search and read the web, but **only when the owner switches it on**.
A **tool picker next to Send** in the chat chooses which tools that chat may use. Off by
default, every time: a fresh chat (and every app start) has no extra tools. The Rust side
is the only authority on what the `claude` CLI is granted — the UI asks, Rust decides.

Desktop-only (CLAUDE.md AI rule). The phone (Wand) is untouched.

## Today (what this changes)
- `assistant.rs::ask_agent` always runs `claude -p` with `--tools ""` (no built-in CLI
  tools), `--strict-mcp-config` (only Pensieve's own MCP server) and
  `--allowedTools <mcp/config.rs::ALLOWED_TOOLS>` (vault read tools + `add_tag`). The
  chat has no say in it.
- `ai_text.rs::vault_tool_args` builds an almost-identical arg list for form spells
  (`READ_TOOLS` only). Two places build the same flags — this update merges them.
- The chat UI (`src/features/assistant/`) has no notion of tools; `askAgent()` takes no
  tool argument.

## Decisions
- **The tool list (v1).** Exactly one grantable tool:

  | id    | Picker label  | Grants to the CLI                                                     | Default |
  |-------|---------------|-----------------------------------------------------------------------|---------|
  | `web` | Web search    | built-in `WebSearch` + `WebFetch` (in `--tools` and `--allowedTools`) | off     |

  Unchanged and **not** in the picker: vault reading (`search_notes`, `get_note`,
  `list_recent`, `list_notes`, `list_tags`) and `add_tag`. These stay on, as today:
  reading your own vault is what Patronus is for, and `add_tag` was the owner's explicit
  ask (TAGS update). Turning them into toggles would take away something the owner
  uses now, and nobody asked for that.
  **Next, not in this update:** `create_note`, `edit_note`, `link_note` (already built,
  dormant in `mcp/config.rs::WRITE_TOOLS`). Each becomes one more registry entry
  when its undo story exists. The registry is shaped so that is a one-entry change, with
  no new code.
- **Web search comes from the CLI's own built-in `WebSearch`/`WebFetch`**, not our own
  MCP tool. No API key, uses the logged-in Claude account (CLAUDE.md), and no
  HTTP/search code of our own to maintain. Phase 1's spike must confirm it works in our
  exact flag set; if it doesn't, the fallback is a `web_fetch` tool on our MCP server
  (reqwest), and Phase 2 changes only behind the same registry.
- **Grant granularity: per chat, sent with every message.** Each agent's chat
  (`useAssistant` session) holds its own `tools` set, starting empty. Every `claude -p`
  call is a fresh process, so the set in effect when Send is pressed is exactly what that
  message is granted. Toggling mid-chat affects the next message only. Each message
  records the tools it was sent with, so the transcript shows when the web was on. Not
  saved to disk, same as chat sessions today, so a restart means everything is off again.
- **Rust owns the registry.** `ask_agent` takes `tools: Vec<String>` of **ids** (`"web"`),
  never raw CLI tool names. An unknown id is a hard error (`UnknownTool`), not ignored.
  The picker reads the list from a `list_assistant_tools` command, so the ids and labels
  live in one place only.
- **Spells never get web.** Form spells (`ai_text.rs`) keep the read-only vault set
  through the same shared arg builder, called with no grants.
- **The user sees when the web was used.** The stream parser already maps `tool_use`
  ids to names (for note chips). It also emits `assistant-tool-used` for web calls
  (query or URL), and the reply shows a quiet "Searched the web: …" line.
- **Accepted risk: web + vault in one chat.** With web on, a fetched page could steer the
  model (prompt injection), and in theory `WebFetch` could carry vault text out in a
  URL. We accept this because the app has one user, web is off by default, it is granted
  per chat by the owner, and the UI shows every web call. Write tools must **not** join
  the registry until this is weighed again for them (noted in wiki.md).

## Architecture
```
Composer ─┬─ ToolPicker (popover: switch per tool, from list_assistant_tools)
          └─ Send ──► useAssistant.send(text)  // session.tools travels with the message
                         └─► askAgent(..., tools: ["web"])
                                └─► ask_agent (Rust)
                                      ├─ grants::resolve(&ids)?  → ToolGrants
                                      └─ claude_args::tool_args(&config, &grants)
                                           --strict-mcp-config --mcp-config …
                                           --tools "WebSearch,WebFetch" | ""
                                           --allowedTools <vault set + granted>
                                           --permission-mode dontAsk
```
New Rust module `src-tauri/src/ai_tools/`:
- `registry.rs`: the `ToolDef { id, label, description, cli_builtins, mcp_tools }` table
  and `resolve(ids) -> Result<ToolGrants, UnknownTool>`. Pure, no I/O.
- `args.rs`: `tool_args(mcp_config, base: &[&str], grants) -> Vec<String>`. One
  builder, used by both `assistant.rs` (base = `ALLOWED_TOOLS`) and `ai_text.rs`
  (base = `READ_TOOLS`, empty grants). It replaces `vault_tool_args` and the inline
  flags in `assistant.rs`.
- `commands.rs`: `list_assistant_tools` (Tauri glue).

Every call logs `assistant.ask` with `{agentId, jobId, tools}` through the central logger.
A refused/unknown grant logs at error level with the ids it got.

## Roadmap
Each phase ends with its tests, then a real run. Commit after each phase.

### Phase 0 — Plan *(this doc)*: done
Tests: n/a. Exit: plan, phases and tool list agreed.

### Phase 1 — Spike: the CLI's web tools under our flags
Throwaway script in this folder (`spike/`), never in `src/`. Hand-run `claude -p` with
our exact flags plus `--tools "WebSearch,WebFetch"`, and answer:
1. Does `--tools` take a comma list of built-ins, and do only those schemas load?
   Measure the input tokens per reply against `--tools ""`, so we don't bring back the
   ~20k-token bloat.
2. With `--permission-mode dontAsk`, do they run when allowlisted and get refused when
   not? (This is the off-by-default guarantee.)
3. Does `--resume` work when turn N has web and turn N+1 doesn't (and the other way
   round)? Without web, is the tool truly gone?
4. What does a `WebSearch`/`WebFetch` `tool_use` block look like in stream-json (name,
   `input.query` / `input.url`)? Save a real NDJSON sample as a test fixture.
5. Does it work on the owner's logged-in account with no extra setup?

**Tests / exit:** the answers to all 5 are written in `wiki.md`, with the NDJSON fixture
saved under `spike/`. If 1, 2 or 5 fails, switch to the MCP `web_fetch` fallback and
update this plan (v2) before Phase 2.

### Phase 2 — Backend: grants the chat call respects
- `ai_tools/registry.rs`, `args.rs` and `commands.rs` as above. Register
  `list_assistant_tools`.
- `ask_agent` gains `tools: Vec<String>`. It resolves them first (fail fast) and builds
  the args with the shared builder. `ai_text.rs` moves to the same builder, and
  `vault_tool_args` is deleted.
- Stream parser: on a web `tool_use`, emit `assistant-tool-used {jobId, tool, detail}`.
  This is a small extraction next to `extract_note_refs`.
- Logging as above.

**Tests (Rust unit, `cargo test`):**
- No grants → args contain `--tools ""` and the `--allowedTools` value equals today's
  `ALLOWED_TOOLS` exactly. This locks in the current behavior so it can't silently change.
- `["web"]` → `--tools "WebSearch,WebFetch"` and the allowlist = base + both.
- Unknown id → `UnknownTool` error naming the id. Duplicate ids → granted once.
- Spell args (READ_TOOLS base, no grants) never contain `Web*` or `add_tag`.
- Parser: the Phase 1 fixture yields one `assistant-tool-used` with the query. Note
  tools still yield note refs (the existing tests stay green).
**Real run:** invoke `ask_agent` from `npm run tauri dev` devtools, with and without
`["web"]`, and check the `assistant.ask` log lines show the tools.

### Phase 3 — Frontend: tool picker in the chat
UX experts review the picker first (CLAUDE.md: several in parallel, synthesized). The
brief to them: one button next to Send, a popover with one switch per tool, its state
easy to see at a glance when a tool is on, and nothing more.
- `src/lib/ai/askAgent.ts`: `askAgent(..., tools: string[])`, `listAssistantTools()`,
  `onAssistantToolUsed()`.
- `useAssistant.ts`: `AgentSession.tools: string[]` (default `[]`), `setTools`. `send`
  passes the session's tools and stamps them on the user message
  (`ChatMessage.tools`). Web calls go into `ChatMessage.toolUses` on the reply.
- `features/assistant/ToolPicker.tsx` (new, its own file), mounted in `Composer.tsx`
  beside Send. `MessageList.tsx` shows the "Searched the web: …" line.

**Tests (Vitest, `npm test`):**
- A new chat starts with no tools, and `askAgent` is called with `[]`.
- After enabling web, the next `send` passes `["web"]` and the user message records it.
  Disabling it means the following send passes `[]`.
- Tools are scoped per agent: enabling web in Patronus's chat leaves Curator's at `[]`.
- `assistant-tool-used` events land on the right reply only (filtered by jobId).
Plus `npx tsc --noEmit`.

### Phase 4 — End to end, ship
- Hand test in the real app: ask "what's the weather in Paris today?" with web off
  (it should say it can't look it up, and there must be no WebSearch in the log), then
  switch web on and ask again (it should answer, with the "Searched the web" line).
  Restart the app and check web is off again.
- Run `npm run tauri:build`, so the installed `.app` is the one with the feature.
- Close out wiki.md, rename the folder `- CLOSED`, merge into `main`.

**Tests:** the full `cargo test` + `npm test` + `tsc` all green, plus the hand test above
with log excerpts pasted into the status below.

## Status
- 2026-11-19: Phase 0 done. The plan and tool list are decided. Next: Phase 1 spike.
