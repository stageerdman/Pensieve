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

## Lessons
- (to be filled as phases run — what worked, what didn't, principles discovered)
