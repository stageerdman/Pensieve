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

## Touch-guard allowlist (see [[phone-global-touch-guard-allowlist]])
`VoiceRecorderPanel`'s `.ph-voice-overlay` is a new full-screen overlay but was deliberately
NOT added to `PhoneApp.tsx`'s `SCROLLABLE` touchmove allowlist — it has no internal scroll
region (a small fixed card with two buttons), so letting the document-level guard
`preventDefault()` touchmove inside it is actually correct (blocks any accidental background
elastic-scroll while the panel is up). Only add an overlay there if it ever grows scrollable
content.

## What's NOT verified (no real device available here)
Build, typecheck, and the full phone test suite (241 tests) are green, and the error path
(mic unavailable) is exercised by a real component-render test. But actual recording behavior —
mic capture quality, pause/resume on-device, wake lock, backgrounding/lock behavior, and the
Notification+beep — can only be verified on a real iPhone; jsdom has no MediaRecorder/
getUserMedia and claude-in-chrome can't reach the localhost dev server (see
[[browser-automation-localhost]]). Needs an owner device pass after deploy.

## Format/sync plumbing (already existed, no changes needed)
- `pensieve:audio` fence + `NoteBlock{kind:"audio"}` + sync's `extractMediaRefs` already handled
  audio end-to-end — this update only had to produce the ref, never touch the format or sync
  layers.

## Phase 6 — owner-reported fixes

### Camera must open instantly, not via a deferred click
The original Snap flow clicked the hidden file input from inside a `setTimeout` (so the note's
open animation could play first). On iOS, a file-input `capture` camera launch must happen
synchronously inside the ORIGINAL tap's call stack or it can stall/get refused — the deferred
click also meant it opened the full Library/Take/Choose action sheet (no camera attribute was
ever set). Fixed: `openImagePicker("camera")` now fires first, synchronously, in
`startCaptureImage()`, setting `capture="environment"` + dropping `multiple` on the shared
hidden input right before `.click()`. This also forced moving that `<input>` out of
`MemoryPage` (which only mounts once a note is open) up to PhoneApp's always-mounted root —
Snap must be able to reach it from the HOME screen, before any note exists yet.

### Recorded audio showed a stuck "0:00 / 0:00"
Two real bugs, not one:
1. **MIME mismatch.** `startRecording` stamped the final assembled Blob with the CANDIDATE
   string we requested (`pickMimeType()`'s pick), not what the browser actually negotiated.
   `recorder.mimeType` (read AFTER constructing the `MediaRecorder`) is the authoritative value
   — a Blob tagged with the wrong type can fail to decode at all, which read exactly like a
   stuck 0/0 player. Fixed: `session.mimeType` is now set from `recorder.mimeType`.
2. **Missing self-heal case.** `audioController.ts`'s existing fix for MediaRecorder's
   Infinity/NaN duration quirk didn't cover `duration === 0` — which is what a recording
   assembled from multiple chunked Blobs reports (the container's header only ever described
   the live/open-ended stream it started as). Extended the self-heal's trigger condition to
   also catch `=== 0`, mirrored into desktop's `src/lib/audio/controller.ts` (duplicated file,
   same convention as everywhere else).
3. Also closed a real (if narrow) race: the final chunk's `appendChunk` write was
   fire-and-forget: finalize's `readChunksOrdered` could run before that last IndexedDB write
   actually committed, silently dropping the tail of the recording. `ActiveState.lastAppend`
   now tracks the latest scheduled write; `flushAndStopRecorder` awaits it before resolving.

### Empty-note discard
The original design committed the "New Image"/"New Recording" placeholder note into the vault
EAGERLY — right when the spell was tapped, regardless of what happened next. The owner (fairly)
didn't want a cancelled Snap or a denied mic to leave a content-free note behind. Fixed with
`pendingCaptureRef` (a `Set<string>` of note ids that are open but still untouched):
- `openCaptureNote` no longer commits — it just opens the note and marks it pending.
- `onPickFiles` clears pending the moment a real image attaches (then the existing
  `autosave.scheduleSave()` path commits normally).
- `onBodyInput` clears pending on ANY keystroke — a user who types real content into a capture
  note must never have it silently discarded.
- `exitNote()` now takes `{save?: boolean}`; if the note is still pending when backing out, it
  skips `autosave.commit()` entirely (full silent discard, nothing was ever in the vault).
- For voice specifically, the mic genuinely starting is the signal: `VoiceRecorderPanel` calls
  `deps.onRecordingStarted` right after a successful `startRecording`, which commits the note
  for real — from that point on, a crash/kill still has a vault row to recover audio onto. If a
  session nonetheless finalizes with ZERO chunks (stopped within the first flush interval), the
  note is UN-committed again via `deps.removeIfUntouched`, but only if its content still exactly
  matches `session.placeholderBody` (captured from the note at the moment recording started) —
  if the owner typed something real in the meantime, it's kept.
- `deleteCurrentNote()` (the new Delete spell) reuses `exitNote({save:false})` rather than
  duplicating the close-animation logic.

### New: Delete spell (Conditional, note context)
`{ id: "delete", name: "Delete", icon: "trash", hue: "danger" }` added to
`conditionalSpells("note")` only (not inside a collection). New `Spell.hue: "danger"` →
`.spell-danger` CSS class (`--sh`/`--sh-glow` both `var(--danger)`) — the first non-gold/violet
hue outside the Sync/Accio pair. Tapping it does NOT delete — `castSpellAction` sets
`confirmDelete` state, rendering `ConfirmDeleteNote` (Cancel/Delete popup); only its Delete
button calls `deleteCurrentNote()`.
