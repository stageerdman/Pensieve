# UX walk-through: phone → Mac → phone round trip (after Uncle Bob's fix)

Columbo, 2026-11-21. Checks commits c2ac23b (sync) and 5e15c8a (long-recording playback).

**Method and limits.** I can't hold the owner's iPhone. I replayed the path from the user's side using the code and
the tests that copy the real case: round-trip, stuck-memory heal, re-transcription and the 32-min object-URL test.
All 243 phone sync/media tests and the desktop sidecar test pass. **Nothing here has been seen on a real phone yet.**
The fix isn't deployed, and the Mac half isn't built into the installed `.app`.

## The path, step by step

| # | What the owner does | What they should see now | Verdict |
|---|---|---|---|
| 1 | Taps Record on the phone. A call comes in, they take it, then come back and Resume | "Paused – mic was interrupted", then Resume. Still one take (from the earlier fix) | OK (tested) |
| 2 | Taps Sync on the phone | The memory is backed up as "New Recording" with both takes | OK |
| 3 | On the Mac: transcribes both takes, renames to "Sales Mindset…", adds tags/category, syncs | The new name and both sidecars go to OneDrive. A **re-transcription** (for example, Czech after a wrong language) is uploaded again, because its size has changed | OK, **but only once the Mac app is rebuilt** |
| 4 | Opens the memory on the phone in the meantime, just to look, and closes it | Nothing is saved. Before the fix, this alone counted as "phone edited it" and froze the memory | Fixed (tested) |
| 5 | Taps Sync on the phone | The list shows the new name. A memory that was already stuck heals by itself (no conflict). Both transcript icons appear on the audio bars. A re-transcribed sidecar replaces the old one | Fixed (tested) |
| 6 | Opens the memory and plays take 1 (the long, call-interrupted one) | It plays. Files over 20 MB now go to the player as an object URL, not an ~83 MB data: string that WebKit refused | Fixed (tested, not yet heard on a device) |

## Still wrong or confusing (most important first)

1. **The owner's phone won't show any of this yet.** The fix isn't deployed (`npm run deploy:phone` waits for the merge).
   The Mac half needs `npm run tauri:build`. If only the phone is deployed, the name will arrive. But a transcript
   re-done on the Mac stays the old one on the phone. *Moment:* the owner taps Sync, nothing changes, and they decide
   "it's still broken". This is the most likely bad outcome after merge.
2. **An iPhone home-screen app often doesn't reload on its own.** Navigation is network-first, so a real relaunch picks
   up the new build. But iOS usually *resumes* the app that's already open. Until the owner swipes it away and reopens
   it, they're still running the old code, and take 1 still says "Can't play this recording". Worth telling them in
   one line when it ships.
3. **Sync while the memory is open (assumption: the General ring, with Sync, can be reached from inside a memory).**
   After sync, the list is reloaded but the open page isn't redrawn. The owner keeps seeing "New Recording" until they
   close and reopen it. Nothing is lost: closing compares against the old copy and saves nothing. Still, in that moment
   it looks like the fix failed.
4. **One real phone edit still makes it stick.** If the owner types anything on the phone (even a tag or their own
   title) while the Mac renames it, it's a real conflict. That's correct. But the phone has no way to resolve it, so the
   memory stays split until it's fixed elsewhere. The only sign is the Sync window's conflict list. Watch-out, not a
   regression.
5. **Small trade-off in the heal.** If the owner *deleted* a line on the phone and the Mac renamed it, the line comes
   back. The commit documents this, and nothing is lost. I haven't seen it in real use.

## What "done well" feels like to the owner
"I tap Sync, and the memory I recorded this morning has the name I gave it on the Mac. I tap the transcript icon and
it's the right language. I tap play and it plays." Point 1 above decides whether they get that. Points 2–3 decide
whether they *believe* it.

## Open questions
- Can Sync be cast from inside an open memory? (This decides whether point 3 can actually happen.)
- After deploy, will someone confirm on the device itself that take 1 (about 32 min) plays and the name/transcripts
  appear? The tests copy the real case, but they don't run WebKit.
