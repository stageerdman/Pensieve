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
