# PATRONUS-AI — bringing AI into Pensieve

## Goal
A persistent AI assistant on the desktop app, opened from a bottom-left "Patronus" orb
(the Pulse Wave concept from the patronus design exploration), backed by the Claude Code
CLI, connected to Pensieve's own data through a new Pensieve MCP server — built on the
same architecture masters-wheel already proved out (bottom-left trigger → dockable chat
window; Rust shells out to `claude` with streaming NDJSON; the app's own compiled binary
doubles as the MCP server via `--mcp-config` pointing back at itself).

Desktop-only, per CLAUDE.md's existing AI rule — never on the phone PWA.

## Decisions (asked up front, 2026-11-10)
- **MCP tool scope:** build BOTH read tools (search/get notes, memories, journal entries)
  AND write tools (create/edit note, add tag, link memories) now — but only the read
  tools go into the CLI's live `--allowedTools` list for this v1. Write tools exist,
  compiled, tested, just dormant until a permission/undo story exists. Flip them on later
  by editing one allowlist, not by writing new code.
- **Persona model:** multi-agent roster (masters-wheel's AgentPicker pattern: @mention,
  per-agent system prompt + knowledge, one shared chat). Starting roster (v1, easy to
  extend — each is just a system prompt + knowledge file, not new code):
  - **Patronus** (default) — the general reflective coach; reads journal/memories,
    discusses patterns, answers "what matters right now."
  - **Curator** — organizing-focused; suggests tags/categories/links, can be pointed at
    the write tools first once those are turned on.
  (Open to the owner renaming/adding agents once the roster UI exists — this is a
  starting point, not a locked decision.)
- **Opener visual:** exactly Orb D "Pulse Wave" from `patronus-energy-orbs.html` — silky
  blurred breathing core + three dissolving pulse rings — ported as the bottom-left
  trigger, replacing masters-wheel's spinning-rings icon. See [[patronus-design]] memory.
- **Panel shape:** masters-wheel's dockable/resizable window (not a fixed slide-out) —
  explicitly asked for "basically similar UI principle," and the agent roster + sidebar
  need the room a fixed 352px drawer (like SyncStatus) doesn't give.

## Architecture (ported from masters-wheel, adapted to Pensieve's actual shape)
Pensieve has **no SQLite index yet** (CLAUDE.md's map lists it as planned; today it's
plain `.md` + `.json` sidecars under `$APPDATA/vault`, read via `src-tauri/src/lib.rs`'s
`vault_root`/`resolve`). So unlike masters-wheel's MCP tools (which query structured
records), Pensieve's MCP read tools work directly against the vault filesystem: list/read
`.md` files + sidecars, simple substring/fuzzy text search. Good enough for v1; swapping
in a real index later is transparent to the MCP tool contracts.

No `tokio`/`rmcp`/async runtime in Cargo.toml yet — masters-wheel's `rmcp` (stdio MCP
server) + `tokio` need adding. Tauri's own `async_runtime::spawn_blocking` (already used
by `ai_vision.rs`) stays for the blocking CLI-subprocess parts; `tokio` is scoped to the
MCP-server-mode code path only.

## Phases
1. **Plan** (this doc) — done.
2. **Pensieve MCP server** (Rust): add `rmcp`+`tokio` deps; own-binary-as-MCP-server mode
   gated by a `PENSIEVE_MCP_SERVER` env var (checked at the top of `lib.rs::run()`,
   mirroring masters-wheel's `main.rs` check); `mcp/config.rs` writes the temp
   `--mcp-config` JSON; `mcp/server.rs` implements read tools first
   (`search_notes`, `get_note`, `list_recent`, `list_tags`), then write tools
   (`create_note`, `edit_note`, `add_tag`, `link_note`) built but excluded from
   `ALLOWED_TOOLS` for now.
3. **AI backend** (Rust): new `assistant.rs`, `ask_agent` Tauri command — streaming
   `claude -p --output-format stream-json --include-partial-messages --mcp-config …
   --allowedTools … --resume <id> -- <message>`, stdout read line-by-line, deltas
   forwarded via `app.emit("ask-agent-progress", …)`, final `result` event persists
   `session_id` for `--resume`. Reuses/extracts the PATH-augmentation + binary-resolve
   helper already in `ai_vision.rs` instead of duplicating it.
4. **Agent roster & personas**: small config (system prompt + which MCP tools each agent
   is allowed) for Patronus + Curator, stored as plain files the owner can edit later —
   not a database.
5. **Frontend**: `AIAssistant` feature — Trigger (Pulse Wave orb, bottom-left, the one
   empty corner per the layout survey), dockable Window (Sidebar/AgentPicker/MessageList/
   Composer), `askAgent.ts` invoke+listen wrapper. Mounted as a sibling overlay in
   `App.tsx` next to `StatusWhisper`/`MediaBackupWhisper`/`ImageLightbox`. Pulls colors
   only from `tokens.css` (`--accent`/`--accent-glow`), per design.md's one-accent rule.
6. **Wire-up + test**: ask about real journal entries, confirm `search_notes`/`get_note`
   tool calls resolve correctly; confirm write tools are present in the server but
   unreachable (not in `--allowedTools`) — i.e. the AI literally cannot call them yet.
7. **UX pass + native build + ship**: UX-expert agent pass on the window/composer/picker,
   `npm test` + `npx tsc --noEmit`, `npm run tauri:build`, verify on the installed `.app`,
   commit+push per phase, fold into main, rename folder to `- CLOSED`.

## Live status
- [x] Phase 1 — plan written.
- [x] Phase 2 — MCP server (8 tools, smoke-tested standalone over raw stdio JSON-RPC).
- [x] Phase 3 — AI backend / streaming CLI invocation (assistant::ask_agent).
- [x] Phase 4 — agent roster (src/lib/ai/agents.ts: Patronus + Curator).
- [x] Phase 5 — frontend (PatronusTrigger/AssistantWindow/MessageList/Composer, mounted
      in App.tsx; tsc/tests/build all clean).
- [x] Phase 6 — wire-up + test: real end-to-end `claude -p` call against a throwaway
      vault confirmed `search_notes` actually fires and the reply is correctly grounded
      in real note content (see wiki.md). GUI click-through still needs the owner's own
      pass — no native-window driving tool available here.
- [x] Phase 7a — UX review pass (general-purpose agent briefed as a UX reviewer against
      design.md) → applied: composer auto-grow, Escape closes the popover (outside-click
      deliberately doesn't), per-agent `sending` lock instead of one global lock, a Retry
      button on failed replies, composer autofocus on open, `rounded-lg` consistency +
      a visible resize-grip, and a one-time first-launch label on the orb (localStorage-
      gated) since an abstract glow has no inherent "this is AI chat" affordance.
- [x] Phase 7b — full-screen Patronus tab + Agents editor tab (scope added after v1
      shipped, same session): extended `TabBar`/`useTabs` with a generic, decoupled
      `ExtraTab` concept (pinned non-note tabs) + a new `useSystemTabs` hook; lifted
      `useAssistant()` into `AssistantContext` so the popover, the full-screen tab, and
      the Agents editor tab all share one live conversation/roster instead of forking
      state. `AssistantFullscreen.tsx` mirrors masters-wheel's ChatPage shape (persistent
      agent sidebar + message list + composer, minus the saved-chat-session list — out
      of scope for this v1). `AgentsEditor.tsx` mirrors masters-wheel's Agents.tsx shape
      (AgentNav + form), but agents persist as one `agents.json` file (matching Pensieve's
      own `lib/categories/store.ts` convention) rather than masters-wheel's one-file-
      per-agent folder — no per-agent knowledge/RAG data to justify a folder each.
      Caught and fixed a real bug while wiring this up: `close()` on the popover used to
      tear down in-flight stream listeners, which was fine when the popover was the only
      display surface but silently truncated a live reply once the full-screen tab could
      also be watching the same conversation.
- [ ] Phase 8 — native build + ship (next: `npm run tauri:build`, owner click-through)
