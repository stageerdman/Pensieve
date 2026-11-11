# AGENT-RAG v1

## Goal
Give Patronus AI agents real per-agent knowledge files (RAG) — the thing PATRONUS-AI's
own wiki.md flagged as "deliberately not ported" from masters-wheel. The owner asked for
it explicitly, "exactly as in Master's Wheel": drag/pick .txt/.md/.pdf files onto an
agent in the Agents editor, index them locally (fastembed + sqlite-vec, no network, no
API key), and have every reply to that agent pull the most relevant chunks into the
system prompt ahead of its persona instructions — the same architecture masters-wheel's
`src-tauri/src/knowledge/` module already proved out.

Ported, not reinvented: the pipeline shape (extract → chunk → embed → store → prompt →
commands), the crates (fastembed, rusqlite+sqlite-vec, pdf-extract), the UI shape (drop
zone / file list / progress / remove), and the unconditional persona-wrapper +
CORE_RULE trick that keeps Claude in character. Adapted for the one real difference:
masters-wheel has multiple Spaces, each with its own `agents/<id>/knowledge.db`; Pensieve
has exactly one vault, so every agent's knowledge lives at
`<vault>/agents/<agent_id>/knowledge.db` with no space_folder parameter anywhere. The
Master's-Wheel-specific TOOL_USE_RULE (Performance Review / Training Room tools) is
swapped for Pensieve's own four MCP tools (search_notes/get_note/list_recent/list_tags).

## Roadmap
1. **Docs** — this file + wiki.md (you're reading phase 1's output).
2. **Rust knowledge module** — port chunk/embedder/extract/paths/store/commands/prompt
   under `src-tauri/src/knowledge/`, add the four crates to Cargo.toml, register the
   module + its two new Tauri commands (`ingest_knowledge_file`, `remove_knowledge_file`)
   in `lib.rs`.
3. **assistant.rs wiring** — `ask_agent` gains an `agent_id` param, calls
   `knowledge::commands::retrieve_for_agent` before every reply, and always routes the
   system prompt through `knowledge::prompt::build_augmented_system_prompt` instead of
   sending `instructions` raw.
4. **Dialog plugin** — `tauri-plugin-dialog` (Cargo + npm) + `dialog:allow-open` in
   `capabilities/default.json`, needed for the native "pick knowledge files" dialog.
5. **Frontend data layer** — `KnowledgeFile` type on `Agent`, `agentStore.ts` sanitize +
   `newDraftAgent` updated, `src/lib/ai/knowledgeFiles.ts` (pick/ingest/remove + progress
   listener) and `src/lib/useWindowFileDrop.ts` ported.
6. **KnowledgeManager UI** — Tailwind version of masters-wheel's drop-zone/file-list
   component (Pensieve has no CSS-module convention — AgentsEditor.tsx is plain Tailwind),
   wired into `AgentEditorForm` with immediate persist-on-change (knowledge files are
   expensive to re-ingest, so they don't wait on the explicit Save button the way
   name/tagline/instructions do).
7. **Wire agentId through chat** — `askAgent.ts` + `useAssistant.ts` pass the active
   agent's id on every turn.
8. **Verify + ship** — typecheck, `cargo test`, a real file ingested + a real reply that
   visibly draws on it, `npm run tauri:build`, commit+push each phase as it lands.

## Live status
- Phases 1–7: done and pushed to main (`8ad29c8`, `c8a7c51`, `b37dba5`).
- Owner's first real test (2026-11-11) found a serious bug: the Knowledge Manager's drag-
  and-drop didn't just fail silently, it briefly replaced the whole Pensieve UI with raw
  file content — see wiki.md's "A real incident" section for the full root cause
  (`tauri.conf.json`'s `dragDropEnabled: false` + no global drop guard existed before this
  update). Fixed: a new `useGlobalDropGuard` (permanent, app-wide) plus a real DOM-based
  drop zone (`ingest_knowledge_bytes`) replacing the dead ported Tauri-event hook.
  Typecheck, `npm test` (1193 passed), `cargo test` (21 passed), `npm run tauri:build` all
  green again after the fix; app rebuilt/reinstalled.
- Owner-confirmed working 2026-11-11: file add (click + drag), chunk count, and a
  retrieval-grounded reply all check out, with no repeat of the navigate-away bug. Closing
  the update.
