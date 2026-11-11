# AGENT-RAG wiki

## Source of truth
Everything here is ported from `~/dev/masters-wheel/src-tauri/src/knowledge/` and its
frontend counterpart `~/dev/masters-wheel/src/lib/agents/knowledgeFiles.ts` +
`src/elements/Agents/children/AgentEditor/children/KnowledgeManager/`. Read those first
if something here is unclear — this file only records what's *different* in the port.

## What's identical
- Pipeline shape: extract (.txt/.md/.pdf → plain text) → chunk (1500 target chars, 200
  overlap, paragraph-aware, splits oversized single-paragraph chunks) → embed
  (fastembed's AllMiniLML6V2, 384-dim, lazy-loaded process-global singleton) → store (one
  SQLite file per agent, `sqlite-vec`'s `vec0` virtual table, brute-force KNN via
  `ORDER BY distance`) → prompt (knowledge excerpts wrapped in `<knowledge>`, persona
  wrapped in `<persona>`, CORE_RULE repeated at both ends to fight "lost in the middle").
- Crates: `fastembed = "7.5.0"`, `rusqlite = { version = "0.41.1", features = ["bundled"] }`,
  `sqlite-vec = "0.1.9"`, `pdf-extract = "0.12.1"`.
- The persona-wrapper is unconditional (present even for an agent with zero knowledge
  files) — masters-wheel found by hand that `--system-prompt`ing raw persona text with no
  framing lets Claude Code break character on a direct "what are you" question; wrapping
  it in `<persona>...</persona>` + CORE_RULE fixes that regardless of whether there's any
  `<knowledge>` block at all. Carried forward without re-deriving — same CLI, same
  mechanism (`--system-prompt` replaces the CLI's default persona).
- UI shape: a drop-zone/button that's either empty-state ("drag files here, or click to
  add knowledge") or a file list with per-file size/chunk-count and a remove button; one
  file indexes at a time (not parallel) so the progress line always describes exactly one
  real file; one failure doesn't abort the rest of a batch.

## What's different, and why
- **No `space_folder` anywhere.** Masters-wheel's multi-Space model means every path
  function takes `space_folder` and the frontend has to track which Space an agent's
  knowledge physically lives under (`homeSpaceFolder`) separately from which Space a
  *chat* is scoped to. Pensieve has exactly one vault — every path collapses to
  `<vault>/agents/<agent_id>/knowledge[.db]`, and no caller needs to pass or track a
  Space anywhere.
- **`agent_id` is required, not `Option<String>`.** Masters-wheel's `ask_agent` can be
  called with no agent at all (e.g. a bare "AI Assistant" with no persona), so its
  knowledge lookup is conditional on `agent_id: Option<String>`. Pensieve's chat is
  always scoped to one of the roster's agents (even a brand-new unsaved draft already has
  a real id from `newDraftAgent()`), so `ask_agent` takes a plain `agent_id: String`.
- **TOOL_USE_RULE is Pensieve's own tools.** Masters-wheel's version names
  `list_performance_reviews`/`get_performance_review`/`search_performance_reviews`/
  `list_training_sessions`/`get_training_session` — none of which exist here. Pensieve's
  equivalent names its real four: `search_notes`, `get_note`, `list_recent`, `list_tags`
  (see `mcp/config.rs::ALLOWED_TOOLS`), with the same "never narrate instead of actually
  calling" + "never fabricate an id, always copy one verbatim from a list/search result"
  rules — those failure modes are tool-calling-model behavior, not Master's-Wheel-domain
  behavior, so they're kept word-for-word where they still apply.
- **No tagged-records / tagged-training-sessions / training_session_id.** Those are
  masters-wheel UI concepts (TagBar, AITrainerPane) with no Pensieve equivalent — dropped
  entirely rather than ported as dead parameters. `build_augmented_system_prompt` here
  takes just `(persona_instructions, chunks)`.
- **Embedding model cache dir**: same pattern (shared infra, lives under
  `app_data_dir/embedding-model-cache`, *outside* the vault — not user data, not
  per-agent, not backed up). Knowledge files themselves and `knowledge.db`, like
  masters-wheel's per-Space data, live *inside* the vault (under `agents/<id>/`) so they
  travel with backup/sync the same as notes do.
- **UI is Tailwind, not CSS modules.** Masters-wheel's `KnowledgeManager.tsx` pairs with
  `.styles.module.css`/`.position.module.css` files — that's masters-wheel's own
  component convention, not part of the RAG architecture. Pensieve's `AgentsEditor.tsx`
  is plain Tailwind utility classes; the ported `KnowledgeManager` matches that, same
  states (empty/drag-active/indexing/file-list/error), different styling mechanism.
- **Knowledge files persist immediately, not behind the Save button.** AgentsEditor's
  name/tagline/instructions fields are explicit-Save (a `dirty` flag gates the button).
  Knowledge files are expensive to re-ingest (a real embed pass) and the Rust-side
  ingestion has already happened on disk the moment a file is picked — so unlike the text
  fields, adding/removing a knowledge file calls `setRoster` immediately, the same
  "commit now" shape masters-wheel's `commitImmediate` autosave gives every field there.

## A real incident: drag-and-drop briefly broke the whole app
Ported masters-wheel's `useWindowFileDrop` (Tauri's `onDragDropEvent`) verbatim for the
Knowledge Manager's drop zone without checking this app's own `tauri.conf.json` first —
it sets `dragDropEnabled: false` on the main window (MEDIA-IMAGES, 2026-10-14, so the
editor's own image/audio/video drop handling — `imagePasteDrop.ts` — can see real DOM
`dragover`/`drop` events; Tauri's native handling was swallowing them). That setting means
`onDragDropEvent` can never fire in this app at all — the ported hook was dead on arrival,
which is the whole reason "drag and drop doesn't work" was reported.

Worse than non-functional: with `dragDropEnabled: false`, nothing *else* calls
`preventDefault()` either outside the editor's own ProseMirror surface, so WKWebView's own
default behavior for an unhandled file drop — navigate the whole window to the dropped
file's `file://` URL — fired, replacing the entire Pensieve UI with raw file content. The
drop zone's very existence (inviting a drag) is what exposed a latent gap that predates
this update: outside the editor, Pensieve never had any drop handling of its own, so it was
always one stray drop away from this; this update's drop zone just put a target in the one
place a user would naturally try it.

Fixed two ways:
- `src/hooks/useGlobalDropGuard.ts`, called once from `App.tsx` — an unconditional
  `window`-level `preventDefault()` on every `dragover`/`drop` in the whole app. This is
  the permanent backstop and should have existed since `dragDropEnabled: false` was first
  set; it didn't, because nothing outside the editor tried to receive a drop until now.
- Rewrote the Knowledge Manager's drop zone to real DOM `onDragOver`/`onDrop` React props
  (matching `imagePasteDrop.ts`'s own pattern, not masters-wheel's Tauri-event one). A
  dropped file arrives as a plain browser `File` with no real filesystem path (unlike a
  file chosen via the native dialog, which has one from `@tauri-apps/plugin-dialog`), so
  it goes through a new `ingest_knowledge_bytes` Tauri command (base64 bytes over invoke,
  same convention as the vault's existing `write_bytes`) instead of `ingest_knowledge_file`
  (which needs a real path to `std::fs::copy` from). Both commands now share one
  `ingest_stored_file` tail in `commands.rs` once a copy already sits on disk.

Lesson: a ported hook/pattern is only as valid as the config it assumes. Should have
grepped `tauri.conf.json` + searched for existing drop handling in this app *before*
porting masters-wheel's drag-drop mechanism, not after a live break. Check
`[[phone-global-touch-guard-allowlist]]` for the exact same shape of bug on the phone PWA
side (one global gesture-eating guard, new surfaces must be added to it) — this is the
desktop analogue: one global "don't let a drop escape without a handler" guard that every
future drop zone benefits from automatically, instead of each new feature needing to
remember to protect itself.

## Open questions / deferred
- No chat-time UI shows *which* knowledge excerpts actually got pulled into a given
  reply (masters-wheel doesn't surface this either — it's assembled server-side and
  never round-tripped back for display). Deferred, not a regression.
- Re-ingesting the *same* file (e.g. after editing it externally) isn't special-cased —
  same as masters-wheel, it just becomes a second `file_id` with a second copy of the
  chunks. A "replace" action is a future nice-to-have, not in this update.
