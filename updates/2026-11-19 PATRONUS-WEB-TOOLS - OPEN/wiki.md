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
   *wants* the web returns an **empty reply** (repeatable in the spike, intermittent
   in the Phase 4 reruns): changing the tool list
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
  context. A web call the model attempts without a grant (the CLI refuses it) logs
  `assistant.web_call refused, not granted` at warn level and is never shown in the UI.

## Test run: "Test it like a real user" (Phase 4, 2026-11-19)
Uncle Bob (backend) + Jony (picker). Script: `test-run/run.mjs <case>`, live `claude -p`
(Opus 5.5, logged-in account) with the exact `ai_tools/args.rs` flags. The system
prompt is built from the Rust source strings (CORE_RULE, TOOL_USE_RULE, on/off note),
read at run time. The vault MCP server is `test-run/stub-vault.mjs`, with the same
tool names, serving one private journal entry ("Rough week": Marta, Sunny Pines,
Dr. Halvorsen, Brightwave). The app binary can't be built in this checkout. Recordings
are in `test-run/out/`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Web off: ask it to research | **Pass** | `off`: init tools = the 3 vault tools only. It searched the vault, made no web call, and replied "I can't look this up for you… I don't have web access", pointing to where to look. 17 s. The one-tap offer is the "Search the web" link (ReplyActions). |
| 2 | Web on: searches and cites | **Pass** | `on`: WebSearch, then 2× WebFetch (blog.rust-lang.org), then a correct answer (Rust 1.100.0, 12 Nov 2026) ending in a 6-link "Sources" list. 39 s. |
| 3 | Picker easy to find | **Pass (rendered harness), native click pending** | Jony, `ownerWalk.test.tsx` (a–e) on the real popover and full-screen surfaces over the real AssistantProvider, faking only the Rust bridge: the picker is directly before Send at the same h-9 size. Globe → accent "Web ×" pill, and one click on × turns it off (focus-drop bug fixed, 5a501eb). A click in the native app is still owed, because the list loads only inside Tauri. |
| 4 | No leaks between chats / agents | **Pass after fix** | Agents: `useAssistant.test` "tools are scoped per agent", "a new chat starts with no tools", "one-off web send… that message only". Each `claude -p` is its own process: `offAfterOn` (web on, then the same session resumed with web off) loads no web tools. **Bug found and fixed below.** |
| - | No private journal words in queries | **Pass** | `private`: the model read the journal via `list_recent`/`search_notes`, then ran 3 searches ("siblings disagreeing about parent's dementia care…", "caregiver working full time…", "waking at 4am…"). None of the 4 private words reached a query (`leaks: []`). |

**Bug (found in check 4, fixed):** after web was on in a chat, a later web-off turn
still had the model *call* WebFetch + WebSearch from memory of the chat. The CLI
refused both ("No such tool available… disabled for this session"), so nothing left
the machine. But `stream.rs` emitted the live `assistant-web-call` for any web
`tool_use`, so the owner would have seen "Searching the web: Rust 1.100.1 point
release" with web **off**, and the log claimed a grant breach at error level. Root
cause: the parser didn't know the grant. Fix: `ReplyStream::new(granted_builtins)`. A
web call that wasn't granted becomes `StreamEvent::UngrantedWebCall`, logged at warn
and never emitted to the UI. Regression test: `ungranted_web_calls_never_show_as_searches`
on the live recording `assistant/fixtures/web_off_after_on.ndjson`.

**Bug: empty reply after web is switched off (spike point 3, fixed and tested).**
Re-run live with the real chat config (vault tools + off note), web on and then off in
the same session, then a question that asks for the web: 2 of 2 runs answered properly
("I couldn't check… web search is off", `out/offAfterOn.ndjson`, `out/offAfterOn-r2.ndjson`).
A rerun of the spike's bare config (`spike/sample-off-resumed.ndjson`) answered too. So
the blank turn is intermittent, but it was repeatable in the spike, so the guard stays.
The model's empty turn can't be fixed from our side. What we own is what the owner sees:
- Rust: `assistant::reply_from` (pure) turns a blank or whitespace-only CLI answer into
  `EMPTY_REPLY`, never an empty bubble. Tests in `assistant/mod.rs`:
  `an_empty_reply_becomes_a_clear_message_not_a_blank_bubble`,
  `a_whitespace_only_reply_counts_as_empty`, and `a_real_answer_after_web_off_passes_through`
  (on the live `web_off_after_on.ndjson`).
- UI: `ownerWalk.test.tsx` (f), on both surfaces: web on → × off → ask for the web →
  empty reply. The bubble shows the message. One click on "Retry with web search" resends
  the same text with `["web"]` on the same session, and the chat's own pill stays off.
- **Not run:** `cargo test --lib`. `cargo` isn't on this checkout's allowed command list,
  so the Rust tests compile only by reading. Vitest (30/30 assistant) and tsc are green.

**Lessons**
- Off doesn't stop the model *trying* a tool it used earlier in the session. The
  hard deny holds (the tool isn't loaded), but the UI must show only granted calls.
- With **zero** tools loaded, a web-off research question hung the CLI for 5+ minutes
  (no output, killed at the timeout), even with the off note. The real chat always
  loads the vault tools, and then it answers in ~17 s. Don't ever ship a chat call
  with `--tools ""` and no MCP tools.
- In the web-off reply, the model said it couldn't search but didn't repeat the
  off note's "switch on Web search next to Send" hint. The reply's own "Search the
  web" link covers that, so this isn't a failure.
