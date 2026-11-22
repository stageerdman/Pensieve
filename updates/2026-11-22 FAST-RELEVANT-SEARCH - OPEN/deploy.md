# Deploy — 2026-11-22

Shipped from `main` at `a62ae8f` (relevance ranker + flat search results view).

## Vault backup (before anything touched the vault)

- **Backup:** `/Users/stage/.ai-studio/backups/pensieve/2026-11-22T09-16-49-259Z-vault`
- **Check:** `node scripts/verify-backup.mjs <vault> <backup>`. Both trees hold 4,755 files and 3,882,796,848 bytes.
  4,754 files match by path, size and SHA-256.
- **The one difference:** `sync/state.json`. The running app's sync rewrites it every few seconds.
  This is sync bookkeeping, not a note. The backup's manifest (`3e0f0b33…`) equals the live
  vault's manifest from a few seconds earlier, during the first check. So the copy is a
  consistent snapshot of the vault at that moment.

## Phone (the Wand)

- `npm run deploy:phone` → https://d1179e83.pensieve-phone.pages.dev (branch `main`)
- Verified: https://pensieve-phone.pages.dev serves the new bundle `index-CEEXWLWz.js`.
- Note: the phone still uses its old search (out of scope for this goal; see `user-test.md`).

## Mac

- `npm run tauri:build` → installed `/Applications/Pensieve.app` (binary built 09:21 UTC).
  The build-tree copy was removed, so only one `Pensieve.app` exists.
- The installer quit the running app to replace it. Reopen Pensieve to get the new search.
