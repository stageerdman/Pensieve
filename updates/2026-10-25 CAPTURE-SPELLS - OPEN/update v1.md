# CAPTURE-SPELLS — two new General spells: Snap (image) & Record (voice)

## Goal
Add two spells to the phone PWA's **General** Spell Menu (home ring, alongside Write/Accio/Sync):
- **Snap** (camera icon) — one tap creates a new memory titled "New Image" / body "added image",
  then immediately opens the existing iOS photo sheet (camera/library/files) to attach a photo.
- **Record** (mic icon) — one tap creates a new memory titled "New Recording" / body "added
  recording", then opens a recording panel (pause/resume/stop, live elapsed + level meter).

Voice capture is the hard part: **must never lose audio**, even across a crash, OOM, or the
phone getting locked mid-recording. Must support pause/resume. If paused and never resumed, the
take up to that point must still end up saved on the note, not stranded.

## Reliability design (voice)
- MediaRecorder started with a 3s timeslice — each chunk is flushed straight to IndexedDB
  (a dedicated `pensieve-phone-recording` DB, separate from the media blob store) the instant
  it's produced. A crash loses at most ~3s, never the whole take.
- `pause()` also force-flushes (`requestData()`) so a pause is itself a safe checkpoint.
- On `visibilitychange` → hidden (app backgrounded / phone locked): we can't guarantee iOS keeps
  recording, so we treat it as a stop — finalize immediately into the note, fire a
  Notification (if permitted) + a short beep saying the recording was saved and stopped, and
  release the wake lock. This is honest about the platform limit (no real background mic
  capture for a home-screen PWA) while guaranteeing no data loss.
- `navigator.wakeLock` holds the screen awake while actively recording/paused in the foreground,
  so normal idle auto-lock doesn't cut a take short.
- A startup recovery sweep finalizes any orphaned session left behind by a harder kill (OS
  killed the page before the hidden-handler could finish) — "saved just in case."
- No destructive "discard" control in the panel: closing it finalizes-and-saves, same as Stop.

## Phases
1. Spell registry + glyphs (camera/mic) + "Snap" wired end-to-end (reuses the existing image
   picker). ✅ ships independently and is the simple half.
2. `mediaStore.ts` audio ref minting + new `recordingStore.ts` (chunked IndexedDB session store).
3. `voiceCapture.ts` — the recording engine: MediaRecorder wrapper, RecordingClock (ported from
   desktop `src/lib/audio/recorder.ts`), finalize-to-note, recovery sweep, visibility/wakeLock/
   notification/beep.
4. `VoiceRecorderPanel.tsx` UI + `mediaDom.ts` live-DOM audio insert + PhoneApp wiring (dispatch,
   touch-guard overlay allowlist, recovery sweep on launch).
5. Edge cases (mic permission denied, picker cancel) + CSS polish.
6. `npm run deploy:phone` + close out.

## Status
Starting Phase 1.
