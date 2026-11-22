# Journal batch cut off by the restart: check, 2026-11-22

**Bottom line:** this batch was not actually cut off. It finished processing at 14:07:07, before the restart. All 6 handwritten pages are safe in 3 Journal memories, each exists exactly once, and they are synced and backed up. Nothing needed repairing, so the vault was left exactly as it was.

Done after the verified backup (`backup-verification.md`). Everything below was read only.

## The batch

- **Raw batch:** `mwrbh6qw-w2jn5f`, captured on the phone at 12:08:29, 6 page photos.
- **Processed:** 14:07:07, into 3 memories. The batch record was removed only after all 3 were written, which matches the order in `useProcessQueue.runJournalItem`.

| Memory | Entry date | Pages | Files |
|---|---|---|---|
| Door to Breakthrough (`mwrfpr3z-zt5y90`) | Nov 12 | 2 | 2 photos + 2 transcripts |
| My Soul (`mwrfpr94-zkh2zk`) | Nov 13 | 2 | 2 photos + 2 transcripts |
| What do I want today (`mwrfprbu-fcamrw`) | Nov 16 | 3 | 3 photos + 3 transcripts |

7 page slots from 6 photos. That's expected: page 2 holds the end of Nov 12 and the start of Nov 13, so each of those two memories keeps its own copy of it, by design.

## Evidence

- **Nothing still pending:** `vault/raw/` is empty, and the sync state has no raw records left (`raw: {}`). So the record's delete reached OneDrive.
- **No lost pages:** the sync state lists the 6 original photos as backed up, with sizes 875032, 865303, 892778, 919812, 879364 and 934114 bytes. Each size matches a photo in one of the 3 memories, and 865303 appears twice (the shared page 2). Every photo has a transcript with real text.
- **Nothing written twice:**
  - Each title appears in exactly one note.
  - No notes or media folders exist from a half-finished earlier run between 12:08 and 14:07.
  - No file in the vault still refers to the old batch folder.
- **Synced:** all 3 memories, their 7 photos and 7 transcripts are in the sync state as uploaded.
- **Harmless leftover:** `media/mwrbh6qw-w2jn5f/` is an empty folder. Removing a batch always leaves one; the Nov 10 batches did too. I left it alone.
- "What do I want today" was saved again at 14:35:11, the same moment another note was created. Its content is intact: title plus the 3 pages.

## Protection in place

- **Backups:** the verified vault backup at `/Users/stage/.ai-studio/backups/pensieve/2026-11-22T07-45-58-318Z-vault` contains all 3 memories with every photo and transcript. OneDrive also has the memories and the 6 original photos.
- **Why the batch can't run again:** the record is gone locally and on OneDrive, and the phone drops its copy on its next sync, because that record was already synced.

## Not checked

- **App logs:** they are in `~/Library/Logs/xyz.erdman.pensieve`, outside the folder I was given, so I didn't read them. The files above tell the full story without them.

## Remaining risk (suggested follow-up, not built)

The guard that stops the desktop from processing a package twice (`raw.adopt.already-processed` in `lib/sync/engine.ts`) only works when the memory has the same id as the record. That's true for packages but not for Journal batches, whose memories get new ids. So if a phone that never received the delete pushed this batch up again, the desktop would process it a second time. This is unlikely, but a small "already processed batch ids" list kept by the desktop would close the gap.
