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

## Open questions / deferred
- No chat-time UI shows *which* knowledge excerpts actually got pulled into a given
  reply (masters-wheel doesn't surface this either — it's assembled server-side and
  never round-tripped back for display). Deferred, not a regression.
- Re-ingesting the *same* file (e.g. after editing it externally) isn't special-cased —
  same as masters-wheel, it just becomes a second `file_id` with a second copy of the
  chunks. A "replace" action is a future nice-to-have, not in this update.
