# Update v1 — INITIAL-BUILD

## Goal
Stand up the Pensieve foundation and ship the **first priority modality: smooth
writing**. By the end there is a real, usable macOS `.app` where you can write
with Notion-like formatting, and every note is saved locally as a plain `.md`
file, indexed, with a commit-style log of what was added when.

Scope is deliberately narrow: **writing only.** Audio, video, images, journal
import, labels/search, and AI coach are later updates (see ../../ROADMAP.md).

## Definition of done
- App launches as a native macOS `.app` (dev build acceptable for v1).
- Create / open / edit notes; formatting matches Notion closely (headings, lists,
  todo, quote, code, bold/italic/links, etc.).
- Each note persists as a plain `.md` file on disk; reopening restores it faithfully.
- A SQLite index tracks notes and an **addition timeline** (what was added when).
- Central logger works; `logs` returns small filtered results.
- Core logic is covered by tests; the app is verified by actually running it.

## Roadmap (phases)
Each phase ends with tests and a real-run verification, then a commit + push.

- [x] **P1 — Research spike (editor + local .md round-trip).** TipTap ⇄ Markdown
  round-trip proven faithful and idempotent for the full v1 format set; locked in
  as `editor.test.ts`. (Findings in wiki.md.)
- [x] **P2 — App shell & foundations.** Vite + React/TS/Tailwind scaffold; design
  tokens from design.md (light/dark); the **central logger** (level, module,
  event, session id) into a capped ring buffer + a filtered `query`.
- [x] **P3 — Local vault (SQLite deferred).** `Store` abstraction with BrowserStore
  (localStorage) + TauriStore (on-disk `.md` vault via Rust fs commands). SQLite
  intentionally deferred to LABELS & SEARCH (see wiki.md).
- [x] **P4 — The Editor.** TipTap surface: markdown-as-you-type, selection bubble,
  autosave to `.md`, keyboard-first. Notion-like formatting set.
- [x] **P5 — Addition timeline.** Per-session word-delta additions, day-grouped,
  summoned overlay (`⌘T`). Verified end-to-end by an integration test.
- [x] **P6 — Native shell & polish.** Tauri v2 shell; Commands filled in CLAUDE.md;
  light/dark, focus mode, keyboard shortcuts. Native `.app` builds and launches.

## Status
- **Done:** all six phases. 22/22 tests pass; typecheck + web build clean; Rust
  `cargo check` clean; native `Pensieve.app` builds and launches on macOS.
- **Decisions:** SQLite deferred; links via markdown typing; focus dimming
  deferred; browser-first verification (Chrome extension unavailable for live
  drive). All recorded in wiki.md.
- **Next:** ✅ CLOSED 2026-10-04 — merged `update/initial-build` → `main`, branch
  pruned, folder renamed `- CLOSED`. Follow-up work continues in the **NOTION-UX**
  update (the Notion-like block experience).
