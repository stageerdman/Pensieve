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

## Mac rebuild with the ranking fix

The build above (from `a62ae8f`) came before the ranking fix `e6194c4` (09:26 UTC), so it was rebuilt.

- Built from `main` at `4395a28`, which includes `e6194c4` (score decides before starred).
- `npm run tauri:build` → installed `/Applications/Pensieve.app`. Binary built **2026-11-22 10:28 UTC**,
  about an hour after `e6194c4`. The build-tree copy was removed, so only one `Pensieve.app` exists.
- **Check on the real vault:** I ran the app's search code (`runSearch` + `MemoryIndex`, metadata block
  removed the way the app removes it) on the owner's vault: 2,121 notes, 119 starred. Read-only, and the
  temporary script is deleted. Voice transcripts were not added.

  | Query | #1 |
  |---|---|
  | `what i want today` | What do I want today ✅ |
  | `wht i want today` | What do I want today ✅ |

  (The old build put this note at #27 and #75; see `user-test.md`.)
- The installer quit the running app. Reopen Pensieve to get the fix.
