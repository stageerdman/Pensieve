# VIDEO-CAPTURE v1

## Goal
Video capture that behaves like Photo (block/spell shape, gallery participation), gets
transcribed like Voice (same engine, same sidecar), and is searchable from desktop Accio
(automatic, via the existing generic ref-folding — no new search code). Phone-captured video
also gets a best-effort, platform-honest "save a copy to the device's own Photos library" —
the WhatsApp-style ask — via the Web Share API (the only path a PWA has on iOS; NOT silent,
needs one tap on "Save Video" in the share sheet that auto-opens right after capture).

Design groundwork: `capture-controls-reference.html` (as-built Photo/Voice reference) and
`video-capture-design.html` (the proposal this update builds) — both at repo root, not
committed as app code, kept as design docs.

## Decisions locked before building
- Desktop: upload/drag-drop only, like Photo. No webcam recorder (Photo has none either).
- Phone: native-camera **handoff** (hidden `<input accept="video/*" capture>`), like Snap —
  NOT an in-page recorder like Voice. Sidesteps WebKit's MediaRecorder bug class entirely.
- Transcription: same engine, same `--audio <path>` arg, now pointed at a video file.
  Czech-whisper (default) confirmed ffmpeg-backed (any container). Parakeet's own loader
  isn't guaranteed to demux video, so it now always gets a temp WAV built from the SAME
  ffmpeg-backed decode already running — fixed in the engine, phase 0.
- Search: desktop Accio only (per owner's call) — automatic via `extractMediaRefs` +
  `buildSearchBody`, already generic. Phone Accio's title/body-only match is explicitly
  unchanged (same gap exists for audio today; out of scope).
- Gallery: video is a THIRD kind alongside image/audio on the same `GalleryTile` switch
  that already mixes photo + voice tiles — not deferred, not a separate system.
- Save-to-Photos: Web Share API, auto-triggered right after a Film capture. One tap, not
  silent — platform ceiling, stated plainly in the UI copy, not oversold as automatic.

## Phased roadmap
- [x] Phase 0 — research spike: confirmed czech-whisper path handles any container
      (`mlx_whisper.audio.load_audio` shells to ffmpeg); fixed parakeet's narrower loader
      in `src-tauri/engine/pensieve_transcribe.py`.
- [ ] Phase 1 — Desktop data model: `MediaRef.kind` → add `"video"`; new
      `lib/md/video.ts` (`pensieve:video` fence, mirrors `lib/md/audio.ts`).
- [ ] Phase 2 — Desktop `VideoBlock.tsx` + `insertVideo.ts` + `/video` slash item;
      generalize `lib/audio/controller.ts` to `HTMLMediaElement`; video in the lightbox.
- [ ] Phase 3 — Desktop gallery: `GalleryImage.kind` → add `"video"`, `video:` fence sigil,
      `GalleryVideoElement.tsx` + a poster-card component mirroring `WaveformCard.tsx`,
      one more branch in `GalleryTile.tsx`.
- [ ] Phase 4 — Rust: confirm `transcribe.rs` has no extension gate (expect no change).
- [x] Phase 5 — Phone: `pensieve:video` fence + `NoteBlock` kind in `noteMedia.ts` (+
      `mediaDom.ts`'s `buildVideoEl`/`insertVideo`, `audioController.ts` generalized to
      `HTMLMediaElement`); Film (General ring) + Video (Conditional, detailed: Film/Upload)
      spells in `registry.ts` + `PhoneApp.tsx`; renders in the note body; reuses the existing
      full-screen transcript reader verbatim (keyed by ref, not media kind).
- [x] Phase 6 — Phone: save-to-Photos via `navigator.share({ files })` in
      `lib/media/saveToPhotos.ts`, feature-detected, fired right after a Film capture only
      (never Upload). **Platform ceiling, stated plainly**: this is ONE required tap on
      "Save Video" in the native share sheet, not a silent auto-save — there is no
      programmatic write-to-Photos API for web content on iOS. Unverified: whether
      `navigator.share` still carries user-activation by the time a file-input's `onChange`
      fires (needs an on-device check, same caveat every phone capture feature in this repo
      has carried — see CAPTURE-SPELLS's wiki).
- [x] Phase 7 — Tests + typecheck: `npx vitest run` (1047 passed), `npx tsc --noEmit` clean
      on both desktop and phone. New test files: `src/lib/md/video.test.ts`,
      `phone/src/lib/media/noteMedia.test.ts` (video fence cases added),
      `phone/src/lib/media/saveToPhotos.test.ts`, `phone/src/lib/spells/registry.test.ts`
      (updated for Film/Video). Committed + pushed per phase throughout.

## Deferred (not started this pass)
- **Phase 3 — desktop gallery mixing** (video as a third `GalleryImage.kind`, alongside the
  existing image/audio precedent). Correctly designed in `video-capture-design.html`'s
  "Video in a gallery" section, but not built — this session prioritized the phone
  capture + save-to-Photos ask over gallery polish. Small, well-scoped follow-up.
- **Phone Accio transcript search** — explicitly out of scope per the owner's call (desktop
  Accio already gets it for free via the generic `extractMediaRefs`/`buildSearchBody` fold).
- **Owner on-device pass** — nothing in this dev environment can exercise the iOS camera
  handoff, the share-sheet gesture-context question above, or real playback on a device.
  Flag this update for a real-device check before closing it out, same as every other
  phone capture feature in this repo.

## Status
Phases 0, 1, 2, 4, 5, 6, 7 done and pushed to main. Phase 3 (desktop gallery) deferred —
see above. OPEN pending an owner device pass.
