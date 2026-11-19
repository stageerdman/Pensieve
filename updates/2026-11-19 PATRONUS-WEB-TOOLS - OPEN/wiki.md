# PATRONUS-WEB-TOOLS — wiki

Lasting decisions and lessons. The plan lives in `update v1.md`.

## Principles
- **Off unless granted.** The `claude` CLI never gets a built-in tool unless that
  message's grant includes it. `--tools ""` is still the default (it also keeps out the
  ~20k-token built-in schema bloat), plus a hard `--disallowedTools` for every
  registry built-in not granted: leaving a tool off the allowlist is not enough (spike
  point 2).
- **Ids in, CLI names out.** The UI sends tool ids (`"web"`). Only
  `src-tauri/src/ai_tools/registry.rs` knows which CLI tool names they map to. Unknown
  ids fail loudly.
- **One arg builder.** Chat (`assistant.rs`) and spells (`ai_text.rs`) build their tool
  flags through the same function, so they can't drift apart.

## Open risk: write tools after web
Web content in a chat can carry prompt injection. Today the worst a page can do is
steer the reply, or `add_tag`. Before `create_note`/`edit_note`/`link_note` join the
picker, decide whether they may be granted **together with** `web` in the same message.
The safe default is no: make them mutually exclusive in `registry.rs`.

## Spike findings (Phase 1, 2026-11-19, claude CLI 2.1.322)
Script: `spike/run.mjs` (cases `none`, `granted`, `notAllowed`, `off`, `denied`).
Trimmed recordings live as test fixtures in `src-tauri/src/assistant/fixtures/`.

1. **`--tools "WebSearch,WebFetch"` works** and loads only those two (init event lists
   exactly `["WebFetch","WebSearch"]`). Cost: about +3k input tokens per reply against
   `--tools ""` (~5.9k vs ~2.9k on a bare prompt), not the ~20k full built-in set.
2. **The allowlist alone is NOT a safe "off".** With the web tools loaded but left off
   `--allowedTools` under `dontAsk`, most calls were refused, but a `WebFetch` to
   nodejs.org **ran anyway** (the CLI pre-approves some sites). So "off" must mean
   not loaded: `--tools ""` **plus** `--disallowedTools WebSearch,WebFetch` as a hard
   deny (the deny also removes them from the schema; verified). `ai_tools/args.rs`
   builds exactly that.
3. **`--resume` across grant changes.** Off → on works. On → off works for normal
   questions (e.g. a private reflection). But on → off followed by a question that
   *wants* the web returns an **empty reply** (repeatable): changing the tool list
   drops the earlier thinking (`thinking_dropped … tools_changed`) and the model ends
   the turn with no text. Thinking off doesn't help. Loading-but-denying would avoid it
   but leaks (point 2), so we don't. Instead the backend turns an empty reply into a
   clear message ("…switch on Web search and send it again", `assistant::EMPTY_REPLY`).
   With web off, the tool is truly gone: init shows `tools: []`.
4. **Stream shape.** `tool_use` blocks are `{name:"WebSearch", input:{query}}` and
   `{name:"WebFetch", input:{url, prompt}}`. Unlike our MCP tools, a built-in's
   `tool_result.content` is a plain **string**; the structured copy is on the user
   event's `tool_use_result` (search: `results[]` mixing `{content:[{title,url}]}` link
   lists with plain-text strings; fetch: `{code, bytes, result}`). A refused call is a
   `tool_result` with `is_error: true` and appears in the result's
   `permission_denials`.
5. **Works on the logged-in account** with no setup and no API key.

Also found: with **no** tools and no system prompt, a "search the web" question hung
the CLI for 4+ minutes. A one-line "web search is OFF" note in the system prompt fixes
it, and makes Patronus say it can't look things up (UX step 7). Every chat call now ends
its system prompt with one on/off line per registry tool (`ToolDef::on_note/off_note`).
The "on" line also tells the model to keep queries generic (no private words).

## Backend contract (Phase 2)
- `ask_agent(..., tools: string[])` → `{ text, sessionId, web: WebCall[] }` where
  `WebCall = { kind: "search"|"fetch", detail, sources: {title|null, url}[] }`. Only
  calls that actually ran are listed; refused ones are dropped.
- Live event `assistant-web-call { jobId, kind, detail }` fires when the model calls a
  web tool, before results: the "Searching the web: …" line.
- `list_assistant_tools()` → `[{ id, label, description }]` for the picker.
- Logs: `assistant.ask` (agent, job, tools, resume), `assistant.web_call` (kind,
  detail), `assistant.reply` (chars, web_calls); errors at error level with the same
  context. A web call without a grant logs `assistant.web_call without grant`.
