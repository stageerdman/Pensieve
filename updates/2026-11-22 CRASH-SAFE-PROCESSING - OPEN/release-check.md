# Release check: rebuilt Mac app + Journal state, 2026-11-22

## Build
- `npm test`: 196 files / 1648 tests pass (2 skipped).
- `npm run tauri:build`: tsc + vite OK; **the Rust half (`util.rs` atomic writes, `lib.rs`) compiles for the first time**. Release build 28.7s. Installed to `/Applications/Pensieve.app`, build-tree copy removed.
- Phone: no `phone/` changes in the crash-safe commits, so no redeploy.

## Journal state in the real vault (read only)
- `vault/raw/` is empty. No batch is waiting or stuck in "processing".
- No `vault/jobs/` or `vault/snapshots/` exists, so there's no half-finished job for startup recovery to resume or clean up.
- The batch cut off by the restart (`mwrbh6qw-w2jn5f`) had already finished at 14:07:07 into 3 memories (see `../2026-11-22 VAULT-BACKUP - OPEN/journal-batch-check.md`). Nothing is left to resume.

## Not done here
- **Launching the app**: `open` is refused in the agent shell, and the app logs (`~/Library/Logs/xyz.erdman.pensieve`) are outside the agent's reach. So the first real start, and its recovery pass, hasn't been watched yet. With an empty `raw/` that pass has nothing to do.
- **Owner check on first launch**: the app opens normally, all 3 Journal memories (Door to Breakthrough, My Soul, What do I want today) are present once each, and no Journal item shows as processing.
