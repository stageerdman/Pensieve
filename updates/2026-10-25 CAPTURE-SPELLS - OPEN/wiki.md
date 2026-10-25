# CAPTURE-SPELLS — wiki

## Decisions
- Spell ids `snap` (image) / `voice` (voice), icons `camera`/`mic` — distinct from the
  Conditional "Photo"/"Gallery" spells that already use `image`/`gallery` ids+icon, since these
  live in a different roster (General, home) with a different trigger (immediately creates a
  new memory rather than acting on an open one).
- Quick-capture notes are inserted into the vault immediately (`autosave.commit()` right after
  creation), not left pending on the first real edit — so "New Image"/"New Recording" exists in
  the vault even if the user backs out before attaching anything.
- Voice chunks live in their OWN IndexedDB database (`pensieve-phone-recording`), not the
  existing `pensieve-phone-media` blob store — keeps the recording-session lifecycle (create,
  append, finalize, sweep) isolated from the stable media-blob schema `mediaStore.ts` already
  owns, no migration risk.
- Finalize always mutates the vault note data directly (not the DOM) — the DOM gets a live patch
  only as a courtesy if that note happens to be open. This is what makes the recovery sweep (at
  next app launch, long after the note view is gone) and the background-hide finalize (note may
  or may not still be mounted) both work through the exact same code path.
- No discard control on the recording panel. Backing out finalizes-and-saves, same as Stop. If a
  bad take needs deleting, delete it via the note afterward — matches the "never lose it" brief
  and avoids an accidental-data-loss affordance.

## Platform limits (be upfront about these)
- iOS Safari does NOT give a home-screen PWA real background microphone capture. Locking the
  screen / switching apps will stop `MediaRecorder` shortly after — there is no way around this
  without a native shell. We treat backgrounding as an automatic stop+save+notify rather than
  pretending to keep recording.
- `navigator.wakeLock` only prevents *idle* auto-sleep while the app is foregrounded and visible
  — it does nothing once the user manually presses the lock button or switches apps.

## Format/sync plumbing (already existed, no changes needed)
- `pensieve:audio` fence + `NoteBlock{kind:"audio"}` + sync's `extractMediaRefs` already handled
  audio end-to-end — this update only had to produce the ref, never touch the format or sync
  layers.
