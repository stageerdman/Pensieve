# Wiki — INITIAL-BUILD

Durable decisions and lessons from this update. (Status lives in update vX.md.)

## Decisions (and why)
- **Tauri, not Electron.** The vision demands "extremely lightweight and fast";
  Tauri ships a tiny native `.app` with a Rust core and web UI. Electron is heavy.
- **React + TypeScript + Tailwind + shadcn/ui.** Fast, standardized, reusable
  components (UX.md); shadcn gives solid primitives so we don't hand-roll styles.
- **TipTap (ProseMirror) editor serializing to Markdown.** Notion-like editing
  that persists as plain `.md`, keeping data portable, human-readable, and local.
- **Local files + SQLite index.** Notes and media are the source of truth on disk
  (you own your data); SQLite is a derived index for labels, timeline, and search.
  The vault lives **outside the repo** — code and personal data never mix.
- **AI via the Claude Code CLI, not the Anthropic API.** While running on the
  computer, AI features shell out to the logged-in Claude Code CLI — no API key.
  AI is a **desktop** capability for organizing, planning, and deep reflection —
  **not for daily logging**, and **not on iPhone** (mobile is capture-only).
- **Sync is ours; OneDrive is backup-only.** For now OneDrive (Microsoft Graph)
  is a backup target. Real device sync will be our own logic in a later update.
- **v1 is writing-only.** Prove the foundation and the smooth-writing experience
  before widening to audio/video/images/journal/AI (ROADMAP.md).

## Decisions made during the build (scope refinements)
- **SQLite index deferred to the LABELS & SEARCH update.** v1 is writing-only for
  one user; a file/localStorage vault with JSON sidecars fully covers notes +
  timeline. SQLite's payoff (fast cross-note search, labels) belongs with that
  feature — adding it now would be premature (CODING.md "build only what's needed").
  The original DoD mentioned SQLite; this is a deliberate, recorded change.
- **Storage abstraction with two adapters.** `Store` interface + `BrowserStore`
  (localStorage; dev/tests/verify) and `TauriStore` (on-disk vault via Rust fs
  commands). Feature code depends only on the interface, so the native backend
  swaps in without touching UI. Vault layout: `notes/<id>.md` +
  `notes/<id>.meta.json` + `timelines/<id>.json`, all under `<appData>/vault/`.
- **Links via markdown typing** (`[text](url)`) for v1, not a toolbar dialog —
  design.md forbids blocking dialogs. Selection bubble covers bold/italic/code/strike.
- **Focus mode = distraction-free chrome-hiding.** Paragraph dimming / typewriter
  scroll deferred (needs TipTap's Focus extension) — kept correct over half-working.
- **Verification is browser-first.** The Tauri webview loads the same frontend, so
  the whole writing experience is built and verified in the browser (Vitest incl. a
  full create→autosave→timeline integration test) before the native shell.

## Lessons
- TipTap ⇄ Markdown round-trips our whole v1 format set faithfully and idempotently
  (locked in by `editor.test.ts`) — the local-.md premise holds.
- Same-millisecond `updatedAt` ties make list ordering ambiguous under rapid
  programmatic saves; fine for human editing, so tests space saves rather than the
  store adding a tiebreaker.
