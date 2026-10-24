# LARGE-MEDIA-SYNC v1

## Goal
OneDrive backup is stuck on two related problems:

1. **It hangs.** The owner reports the sync header stuck on "Backing up…" forever,
   with the whisper stuck on "Backing up 1 image…" forever. Root cause: media
   (images, but also audio/video recordings — they share the same `media/` ref
   scheme) uploads via one `PUT :/content` call. The whole file is base64-encoded in
   JS, shipped across the Tauri IPC bridge as one giant string, decoded in Rust, then
   PUT over HTTP. For anything beyond a few MB this can block the renderer's JS thread
   for a long time (perceived as "stuck") and/or exceed the 30s native HTTP timeout —
   and because that whole round trip is a single un-timed-out promise from the JS
   side, a stall never resolves into a clean "failed" state the UI can show and move
   past.
2. **It's capped at 4MB.** Microsoft Graph's simple `PUT :/content` upload only
   supports files up to 4MB. Above that, Graph rejects it outright. There is currently
   no fallback — so anything bigger (a longer voice recording, any video) can never
   back up at all.

Fix both by routing anything over 4MB through Graph's **resumable upload session**
API, with the actual byte-shuffling done natively in Rust (streamed straight from/to
disk, never materialized as one JS string or held as one in-memory buffer). Pausing
is just "the app isn't running" — Graph tracks how many bytes of a session it has
received server-side, so resuming after a relaunch means asking Graph where it left
off and continuing from there, not re-uploading from scratch.

## Architecture decisions
- **Threshold: 4 MiB** (`LARGE_MEDIA_THRESHOLD` in `adapter.ts`) — Graph's actual
  simple-upload/-download ceiling. Below it, the existing simple PUT/GET path is
  untouched (no behavior change for ordinary images).
- **Upload — resumable sessions, Graph-tracked resume offset.** `createUploadSession`
  (small JSON call, existing Graph client) hands back a pre-signed `uploadUrl`. Chunks
  are PUT to that URL directly from Rust, reading the local file from disk in fixed
  10 MiB chunks (a clean multiple of Graph's required 320 KiB fragment alignment) —
  never loading the whole file into memory or crossing the JS/IPC boundary as bytes.
  On resume, we `GET` the upload session URL (a cheap JSON call) for
  `nextExpectedRanges` — Graph remembers what it already has, so there is **no local
  per-chunk progress bookkeeping at all**. We only persist the `uploadUrl` itself
  (`MediaSyncRecord.uploadSession`), checkpointed to disk via `vault.writeState`
  *immediately* after the session is created (before the first chunk goes out) — so
  even an app kill mid-transfer leaves something to resume from on the next sync.
- **Download — chunked Range GETs to a `.part` file.** No Graph "session" concept
  exists for downloads; instead we issue bounded-size Range GETs in a loop, appending
  to a `<file>.part` sidecar. Resume is just "how big is the `.part` file already" —
  no state.json bookkeeping needed. Renamed to the final name only once the full
  expected size is confirmed on disk.
- **Per-chunk bounded timeouts + retry with backoff**, entirely inside the Rust
  command. A stalled connection fails (and gets retried, capped) within ~2 minutes
  instead of hanging forever — this is what actually fixes symptom #1. A 4xx (bad
  range, expired/cancelled session) is NOT retried — only 429/5xx/transport errors
  are, since those are the transient ones.
- **Graph's own 4MB ceiling means the existing simple path is untouched** for small
  media — no regression risk to the common (image) case.
- The Tauri command surface only ever carries small control values across IPC for the
  large path (a vault-relative path string, a URL, an offset, a size) — never bytes.
  Progress is reported back via a Tauri event (`media-upload-progress` /
  `media-download-progress`), not threaded through the invoke return value.

## Phases
1. Plan (this doc).
2. Rust: `media_transfer.rs` — `media_size`, `upload_media_chunked`,
   `download_media_chunked`.
3. TS plumbing: `graph.ts` (`skipAuth`, `GraphClient.token()`), `adapter.ts` (session
   helpers, `mediaMeta`, `mediaContentUrl`), `native.ts` (command wrappers + progress
   listener), `vault.ts` (`mediaSize` + optional `uploadMediaStream`/
   `downloadMediaStream`).
4. `engine.ts`: route `pushLocalMedia`/`pullReferencedMedia` by size; resume-aware
   large-upload helper; defensive client-side timeout around the generic Graph
   transport (belt-and-suspenders against any future hang).
5. UI: `MediaBackupWhisper` wording (it hardcodes "image" even for audio/video) +
   real byte/percentage progress for an in-flight large transfer.
6. Tests: Rust unit tests for the pure helpers; TS tests for the new adapter/engine
   paths; update existing `GraphClient` test fakes for the new `token()` method.
7. Build + verify (`npm test`, `tsc --noEmit`, `cargo test`, `tauri:build`), update
   `issues.txt`, close this folder.

## Status
- [x] Phase 1 — this doc.
- [x] Phase 2 — Rust native commands (`media_transfer.rs`: `media_size`,
  `upload_media_chunked`, `download_media_chunked`).
- [x] Phase 3 — TS plumbing (`graph.ts` skipAuth/token, `adapter.ts` session helpers,
  `native.ts`/`vault.ts` streaming hooks).
- [x] Phase 4 — engine rewiring (`pushLocalMedia`/`pullReferencedMedia` route by size;
  resume-aware `uploadLargeMedia` checkpoints the session to disk before sending bytes;
  a failed upload keeps its session instead of losing it).
- [x] Phase 5 — UI (`MediaBackupWhisper`: generic "file" wording + live byte progress
  from the native chunked uploader).
- [x] Phase 6 — tests: Rust unit tests for the pure helpers; new engine-level tests with
  a `LargeMemVault` + a fake drive with real resumable-session semantics (byte-exact
  upload, resume-from-interruption, failure-preserves-session, chunked download);
  adapter-level unit tests for the session helpers; a `graph.ts` test that reproduces
  the original hang (a transport promise that never settles) and proves the timeout fix.
- [x] Phase 7 — `npm test` (913 passed), `npx tsc --noEmit` (clean), `cargo test` (8
  passed), `npm run tauri:build` (built + installed to /Applications/Pensieve.app).
  `issues.txt` updated; this folder closes out.

## Owner follow-up
Confirmed 2026-10-24 — real large file backed up successfully. Folder CLOSED.
