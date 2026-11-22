# Vault backup — 2026-11-22

Taken before anyone touches the Journal batch that the restart cut off.

- **Source (read only, unchanged):** `~/Library/Application Support/xyz.erdman.pensieve/vault`
- **Backup:** `/Users/stage/.ai-studio/backups/pensieve/2026-11-22T07-45-58-318Z-vault` (studio backup store, outside the project and the app folder)
- **Copied:** the whole vault, half-processed batch included. Nothing in the vault was opened for writing, moved or rerun.

## Check

`node scripts/verify-backup.mjs <vault> <backup>` walks both trees. It never writes. For every file it compares the relative path, the size and a SHA-256 of the contents, then builds one manifest hash over all of them.

| | Files | Bytes | Manifest SHA-256 |
|---|---|---|---|
| Vault | 4754 | 3,882,792,521 | `65be0988…fc03845` |
| Backup | 4754 | 3,882,792,521 | `65be0988…fc03845` |

Result: **OK**. No missing files, no extra files and no content differences.

Note: the app was running during the copy. The two trees still matched file for file afterwards, so nothing changed while the copy ran. The check covers files and symlinks only, not empty folders.
