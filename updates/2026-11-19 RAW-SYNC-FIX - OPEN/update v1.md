# RAW-SYNC-FIX — v1

## Goal
A phone recording must never fail desktop processing because it hadn't arrived yet, and a raw
record must never vanish from a device while it still exists on OneDrive.

## Trigger (2026-11-18, real device)
A 21-min CANI voice package (`mwmad6za-kz90ck`, 41.7 MB WAV). Desktop Patronus failed
"audio not found"; the record then disappeared from desktop and phone. Both files stayed safe
on OneDrive (local copy: ~/Documents/pensieve-recovery/).

## Phases
1. **Listing fix** (desktop + phone adapter): `listRawRecords` now `$select`s
   `parentReference`. Without it `rawIdFromItem` rejected every listed item → the defensive
   reconciliation saw an empty raw/ and deleted every synced record locally (and
   restoreFromCloud never restored raw records). Test fakes now honour `$select`. ✅
2. **Orphan adoption** (both engines): a remote record that this device doesn't have locally
   and doesn't track is pulled again. If a memory with that id already exists (a processed
   leftover), the desktop deletes the remote copy and the phone ignores it. Patronus is never re-run. ✅
3. **Media before record** (phone): raw records upload after media and only once all their
   local media is backed up (`raw.push.wait-media`). ✅
4. **Desktop waits for media**: the queue holds a record until every media ref is on disk
   (`raw/queue.wait-media`). Each sync also re-fetches missing raw-record media, and a media file not
   yet on the remote is logged (`media.pull.not-on-remote`). ✅
5. Ship: merge, `tauri:build`, `deploy:phone`. Recovery: first desktop sync re-adopts
   `mwmad6za-kz90ck` → Patronus processes it; `mwf50mn8-2tr9qc` (already a memory) is cleaned
   from the remote. ⏳ owner confirmation.

## Status
Built + tests (1484 pass). Awaiting owner confirmation that the recording processed.
