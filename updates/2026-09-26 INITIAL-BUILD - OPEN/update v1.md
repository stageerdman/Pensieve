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

- [ ] **P1 — Research spike (editor + local .md round-trip).** Isolated spike in
  this folder: confirm TipTap ⇄ Markdown round-trips faithfully with the
  formatting set we want, and that Tauri can read/write the vault. Capture
  findings in wiki.md. No main-code changes.
- [ ] **P2 — App shell & foundations.** Tauri + React/TS/Tailwind/shadcn scaffold;
  design tokens from design.md; the **central logger** (level, module, event,
  session id) into a capped searchable store + a `logs` query; `.env` loading.
- [ ] **P3 — Local vault + SQLite index.** Vault location (outside repo); read/
  write notes as `.md`; SQLite schema for notes + metadata; safe file ops.
- [ ] **P4 — The Editor.** TipTap writing surface with Notion-like formatting,
  keyboard-first, autosave, serialize to `.md`. This is the heart — make it feel
  effortless. Build from shadcn primitives per design.md.
- [ ] **P5 — Addition timeline.** Commit-style log of additions (what/when),
  stored in the index and shown as a simple timeline.
- [ ] **P6 — UX pass & polish.** UX-expert agents review the writing flow; cut
  anything unneeded; verify accessibility, focus, light/dark. Fill Commands in
  CLAUDE.md now that the app is scaffolded.

## Status
- **Done:** project onboarded to AI Control; VISION.md, ROADMAP.md, design.md,
  CLAUDE.md written; GitHub repo created and connected; this update opened.
- **Decisions:** see wiki.md.
- **Next:** P1 — the editor + `.md` round-trip research spike. (Awaiting go per
  Build mode = wait for command after each phase.)
