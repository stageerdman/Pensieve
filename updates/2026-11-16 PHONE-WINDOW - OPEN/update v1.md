# PHONE-WINDOW — update v1

**Goal.** The phone is a recording + quick-check device; it shouldn't mirror all ~2,000
memories. Keep a rolling **2-week** window locally — memories **created** in the last 14
days, or **opened** in the last 14 days on the **phone or the computer** — and forget the
rest *locally only*. Older memories stay findable: Accio searches them by title and
fetches one on tap. (Owner decisions 2026-11-16.)

## Design
- **Desktop publishes `notes-index.json`** at the OneDrive root each sync when it changed:
  `{v:1, notes:[{id, t:title, c:createdAt, u:updatedAt, o:desktop lastOpenedAt, k:category}]}`
  (`src/lib/sync/notesIndex.ts`). ~250 KB for 2,000 notes. Not `.md`, not under `raw/`, so
  neither delta loop treats it as a note.
- **Phone window** (`phone/src/lib/sync/window.ts`, pure): keep if
  max(index createdAt, desktop open, phone open) ≥ now − 14d.
- **Forget ≠ delete.** A forgotten note keeps its sync record flagged `remoteOnly`; the
  deletion pass skips `remoteOnly`, so OneDrive is never touched.
- Forget only **clean, synced, non-draft** notes; never the one on screen. Runs on the
  **first sync of an app session** only (cards never vanish mid-scroll).
- **Crash-safe order:** flag + persist state → then remove. A half-done forget heals: a
  local note with a `remoteOnly` record is normalized back on the next sync.
- Media freed only if used solely by forgotten notes and backed up.
- **Bring-in:** memories that enter the window (e.g. opened at the computer) are downloaded
  by the index, since the delta won't re-surface them. Restore mirrors only the window.
- **No index published = old behaviour** (full mirror, nothing forgotten).
- Accio: title-only stubs join the same ranking (UX review: no badge, no separate group,
  drop the snippet line); tap → fetch → open; offline → 3 s toast, re-tap retries.
  Engine calls are serialized so a tap mid-sync can't lose its record.

## Phases
1. ✅ Desktop index publisher + test.
2. ✅ Phone window engine (forget/bring-in/restore/fetch) + safety tests.
3. ✅ Phone UI: opens recorded, Accio stubs, fetch-on-tap, toast + app test.
4. ✅ Merge, `tauri:build`, `deploy:phone`.
5. ⏳ Owner device pass: desktop sync first (publishes index) → phone sync → phone keeps
   ~70 memories; Accio finds an old one by title; tap opens it.

## Status
Built end to end, 1,472 tests green. Awaiting owner device pass.
