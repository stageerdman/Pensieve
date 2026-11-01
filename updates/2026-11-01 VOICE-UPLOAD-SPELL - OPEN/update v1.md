# VOICE-UPLOAD-SPELL

## Goal
Inside an open memory on the phone, the Spell Menu offers Photo/Gallery/Delete but no way to
attach a voice recording to an EXISTING memory (Record on the home ring only mints a brand-new
"New Recording" memory). Add a "Voice" conditional spell that opens two options: Record a new
take (the existing recorder UI/engine, now targeting the open note) or Upload an existing audio
file (new file-picker path, so a Voice Memos recording saved to Files can be attached).

## Roadmap
1. **Icon + data model** — add an "upload" glyph (SpellGlyph), add it to `IconName`, add a
   `record` conditional spell (icon `mic`) with two children: `record-new` (mic) / `record-upload`
   (upload). Uses the existing (currently-unused-by-any-real-spell) detailed sub-ring mechanism.
2. **Record into the open note** — `castSpellAction` gets a `record-new` branch that opens
   `VoiceRecorderPanel` targeting `currentRef.current` directly (no new note minted), reusing
   `voiceCapture.ts` untouched.
3. **Upload into the open note** — a second hidden `<input type="file" accept="audio/*">`
   (the existing one is image-only and mode-toggled for Snap/Gallery/Photo, not reusable as-is).
   `record-upload` branch mints an audio ref via the existing `mintAudioRef`, stores the picked
   File as-is (no re-encode — browsers play whatever format it already is), and inserts it as a
   normal `pensieve:audio` block via the existing `insertAudio`.
4. **Safety fix** — `voiceDeps.removeIfUntouched` currently deletes WHATEVER note matches
   "content unchanged + zero audio chunks captured", which was only ever exercised by the
   Snap/Record-from-home flow (a brand-new, not-yet-real placeholder note). Reusing the recorder
   on an EXISTING memory means a user who taps Record then immediately Done with nothing captured
   must NOT have their real memory silently deleted. Guard it behind a new `captureFlowRef` set
   (populated only by `openCaptureNote`, the Snap/Record-from-home mint) so it only ever fires for
   a genuine fresh capture note, never a memory the user opened and chose to add a take to.
5. **Verify + ship** — typecheck, `npm test`, `npm run build:phone`, then
   `npm run deploy:phone` per CLAUDE.md workflow §8 (a phone/ change isn't done until deployed).

## Status
- Done: all 4 phases implemented + verified (`npm test` 1029/1029, `tsc`, `build:phone`), shipped
  to main `fe108fa`, deployed to https://pensieve-phone.pages.dev (build `cb8194bc`).
- Next: owner device confirmation — tap the "Voice" spell on an open memory, try both Record
  (adds a take to that memory, doesn't mint a new one) and Upload (pick an audio file — ideally
  one already saved to Files from Voice Memos). Keep folder OPEN until confirmed on-device.
