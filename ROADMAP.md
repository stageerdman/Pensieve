# Pensieve — Roadmap (of updates)

The big-picture path from nothing to the full vision (see VISION.md). Each item
becomes an `updates/YYYY-MM-DD NAME - OPEN/` folder when we start it, and closes
when done. Order is priority order; later items may be re-sequenced as we learn.

Legend: [ ] not started · [~] in progress · [x] done

## Now
- [~] **INITIAL-BUILD** — the foundation + smooth writing.
  Tauri + React/TS/Tailwind/shadcn app shell; central logger; local `.md` vault +
  SQLite index; the TipTap editor with Notion-like formatting saving to `.md`;
  the commit-style addition timeline. Ships a real, usable writing app.

## Next (priority modalities)
- [ ] **AUDIO** — record/import audio; local whisper.cpp transcript; transcript↔
  time-point linking; segment notes; manual + AI (Claude Code CLI) transcript
  edits; cut/extract clips.
- [ ] **VIDEO** — import video; same transcript workflow as audio; embedded
  playback with time-point notes.
- [ ] **IMAGES** — embed images freely; multiple media per note; light captions/labels.

## Then (organization & intelligence — desktop AI)
- [ ] **LABELS & SEARCH** — auto-labeling on capture; fast local search across
  notes + transcripts; browse by label / date / source.
- [ ] **AI COACH** — desktop-only, via Claude Code CLI: reads your thoughts,
  surfaces past lessons, connects entries to your goals. For organizing, planning,
  and reflection — not daily logging.

## Later (capture reach & durability)
- [ ] **PHYSICAL JOURNAL IMPORT** — photograph pages; background OCR into digital
  notes; source tracking, dedup, "where you stopped"; keep hand-drawn images.
- [ ] **BACKUP** — OneDrive (Microsoft Graph) backup-only; scheduled, non-blocking.
- [ ] **iPHONE/iPAD CAPTURE** — frictionless logging app (no AI) + **our own sync**
  logic to the desktop vault.

## Someday
- [ ] **INTEGRATION** — expose Pensieve as a clean module for the bigger project.
- [ ] **DISTRIBUTION** — notarized macOS build; update mechanism.

---
Guiding rule: build each priority modality *well* before widening scope. The UI
disappears around the content; capture stays effortless; data stays local and yours.
