# PACKAGES — wiki

- Journal is already a package in all but name: sealed `raw/<id>.json` record, hidden from
  notes, dashed RawMemoryCard + JournalDetailScreen preview on the phone, one Process row,
  removed + replaced by real memories when done (phone learns via raw tombstone).
- Forms today are a NOTE flagged `formStatus: awaiting` → opens as a normal memory, and the
  desktop shows transcription and fill as two unrelated rows. That gap is this update.
- Lesson (2026-11-13): an out-of-band rewrite of the OPEN memory must go through
  `useNotes.reloadFromDisk`, never `open(id)` (no-ops for the open id → stale editor, and the
  next flushSave writes the stale body back).
- Lesson: desktop-saved Markdown carries ZWSP spacer paragraphs; `trim()` does not strip
  U+200B — any "is this line blank" check on note Markdown must name it.
- "Patronus is the brain, the app is the hands": the AI returns ACTIONS (validated against real
  refs/fields), the app executes them with its own rails (applyAnswers never overrides, Timeline
  restore point, sync). Safer + testable vs letting an MCP subprocess write the vault directly;
  transcription stays in-app (progress, checkpoints) and Claude can't hear audio anyway.
- A form package resolves into the memory with the SAME id → media/<id>/ is already right. The
  catch: every "delete raw record" path that wipes media/<id>/ must spare it when notes/<id>.md
  exists (desktop store + desktop sync vault). Phone tombstones only free `pages` (none for forms).
- Phone large WAVs (8.7 MB seen) upload fine through the simple PUT — the "4 MB cap" comment in
  phone/src/lib/sync/adapter.ts is stale in practice.
- Two SVG orbs on one page must not share gradient/filter ids → useId per instance.
