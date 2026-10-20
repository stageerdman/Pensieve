# LARGE-MEDIA-SYNC — wiki

## Why it looked "stuck" rather than "failed"
The old path (`uploadMedia`/`downloadMedia` in `adapter.ts`) always moves the whole
file as one JS string: `bytesToBase64` (chunked internally, so it doesn't itself
hang) → one giant string as a Tauri `invoke` argument → `base64::decode` in Rust →
one `ureq` PUT/GET with a 30s timeout. Three different things can make this look
hung rather than cleanly failed:
- JSON-serializing a multi-hundred-MB string across the webview IPC bridge can take
  tens of seconds to minutes, genuinely blocking the renderer's JS thread — the UI
  can't even repaint, let alone show a timeout.
- V8 has a hard per-string length ceiling (~512MB). A base64'd video well past that
  doesn't time out — it throws a different, uncaught shape of error deep in a path
  nothing here was built to expect.
- Even when it does complete, a single `ureq` request with one 30s timeout isn't
  enough for a file that takes minutes to transfer at ordinary upload speeds — so the
  realistic working case for anything past a few MB was already "fails", not
  "succeeds slowly."

None of this is a logic bug in the retry/backoff code (`graph.ts`'s retry loop is
fine) — it's a transport design that was only ever sized for note-sized text and
small images.

## Graph resumable upload sessions — the one thing worth knowing
`createUploadSession` returns a pre-signed `uploadUrl` on a *different host* than
`graph.microsoft.com`. Two non-obvious rules:
- **Never send an `Authorization` header to that URL.** Graph's docs say it fails the
  request outright if you do — the URL itself is the auth. (`skipAuth` in
  `GraphFetchOptions` exists only for this.)
- **You don't have to track upload progress yourself.** `GET {uploadUrl}` returns
  `nextExpectedRanges` — Graph tells you exactly what it has. This is the whole
  reason resume-after-app-kill doesn't need any local byte-offset bookkeeping: we
  only need to remember the `uploadUrl`, not how far we got.
- Chunks must be sized in multiples of 320 KiB (except the last one). 10 MiB chunks
  satisfy that and sit inside Microsoft's own "reliable connection" recommendation
  (5–10 MiB).
- Sessions expire (`expirationDateTime` in the create response). If a resume attempt's
  `GET` 404s/410s, or the stored expiry has already passed, don't retry the query —
  just start a fresh session. This is the only case a large upload restarts from 0.

## Downloads didn't get a "session" — and don't need one
There's no equivalent resumable-session concept for GETting content back out of
OneDrive. Range requests are enough: chunk-GET with `Range: bytes={offset}-{end}`,
append to a `<file>.part` sidecar, and resume is just "how big is the `.part` file
already" — no sync-state bookkeeping, no server round trip to ask "where was I."
Only rename `.part` → the real filename once the byte count matches the expected
size from Graph's item metadata.

## Why the byte-shuffle had to move into Rust (not just "add a timeout in JS")
A multi-GB file simply cannot be held as one `Uint8Array` + one base64 `string` in
the renderer's JS heap without risking an OOM/crash independent of anything
network-related. Keeping the engine (`engine.ts`) portable/testable (it's driven by
an in-memory fake vault in tests) meant the streaming capability had to be an
**optional** capability on `LocalVault` (`uploadMediaStream?` / `downloadMediaStream?`)
that only the real Tauri vault implements — the in-memory test vault simply doesn't
have it, and the engine falls back to the old whole-buffer path whenever it's absent
(which is also what every existing test keeps exercising, since none of them use
files anywhere near the threshold).

## What's intentionally NOT built
- No manual "pause" button. Closing the app *is* the pause — the owner's framing
  ("easily paused on closed app, resumed where it ended") maps directly onto "Graph
  already knows the byte offset, so just relaunch and sync again." Mirrors the
  existing [[transcription-exit-120|resumable-transcription]] precedent: no explicit
  UI state for "paused," just automatic resume on the next run.
- No chunked upload for notes (`.md` files) — they're always small text; only media
  binaries route through this.
- No change to the `media/` ref model itself (still images-only by `kind`, per
  `ref.ts`) — audio/video already ride the same vault-relative-path scheme and this
  fix benefits them automatically without any ref-model change.
