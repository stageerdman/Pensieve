# PHONE-FEED-ACCIO-FIX — v1

**Status: CLOSED** (2026-10-13). Branch `fix/phone-feed-accio-ui` → merged to `main`.
Device-verified by the owner. Phone PWA only (no change to the desktop `.app`).

## Goal
Finish the iPhone PWA polish the owner reported on the Memory Bank (home) reel and the
Accio search: fix the zoom-glass feel, kill a persistent screen-shift bug, and stop the
home DOM from carrying surfaces it shouldn't. Test loop: `npm run dev:phone` → open the
Network URL on the iPhone (owner-driven; browser automation can't reach localhost).

## What shipped (phases, each committed + pushed)

1. **Zoom glass** (`83b517e`)
   - Removed the settle-to-slot SNAP — the reel free-scrolls on native momentum now.
     The JS tween fought the finger and stuttered when two flasks shared the glass.
   - Fixed multi-line snippets hanging below centre: the snippet moved into the card
     `.body` column and the loupe drives its `max-height = reveal · naturalHeight`, so
     title+meta+snippet centre as one group on the focal line at any line count;
     resting rows stay compact.

2. **Screen-shift "lifts up and never returns"** (`66747ba`) — reproduced on DESKTOP, so
   it was our code, not an iOS keyboard quirk. Two causes:
   - Desktop: `openAccio()` focused the summon input while it was still off-screen, so
     the browser scrolled the `overflow:hidden` shell to chase it and never reset →
     `focus({ preventScroll: true })`.
   - iOS: `useKeyboardInset` translateY'd the ROOT by `vv.offsetTop` to compensate for
     the visual-viewport pan; the transform could stick → removed it (bars ride above
     the keyboard via `--kb`) and now actively clear any stale transform + on unmount.

3. **Conditional mounting + the Memory page** (`66747ba`)
   - The search cluster (SummonBar + SearchSheet + DockSettings) and the note now render
     ONLY when active — nothing parked in the home DOM at rest.
   - `openAccio` uses `flushSync` so the (conditionally-mounted) input exists in time for
     its in-gesture `focus()` — iOS only raises the keyboard when focus lands inside the
     tap gesture.
   - `NoteView` → **`MemoryPage`** (its own surface), mounted only while open/closing
     (flushSync mount → rAF slide-open → unmount 520ms after close, with a reopen-race
     guard).
   - Dropped the `data-n="1"` single-result row resizing that made the Accio result
     flasks jump while typing (best match still lit via `.sr:last-child`).

4. **Reel spacing seam near the list end** (`94b029d`)
   - The fisheye parting was only applied to the small focal window and reset to 0
     outside it; the parting integral saturates to ~0.75·slot, so the last parted card
     sat crowded against the first un-parted one. Snap hid it; free-scroll exposed it as
     "flasks near the end jump closer." Now the parting transform is applied to the whole
     VISIBLE band (+margin), so the seam is off-screen and spacing stays continuous.
     Magnification/opacity/snippet stay in the tight focal window.

5. **Cleanup** (`<this phase>`) — stripped the `[accio]`/`[kb]` on-device debug logs.

## Deferred (intentional, not blockers)
- The summon bar's slide-up / scrim fade-in no longer animate on ENTER (it mounts
  already-`searching`). Restore with a mount-lag split if the owner misses it.
- Rename is partial: component is `MemoryPage`, but internal `.note-*` CSS classes +
  `noteX` refs are still legacy. A separate mechanical taxonomy sweep if wanted.
- Pre-existing + UNRELATED: `src/App.test.tsx` (desktop) fails in the FULL `vitest run`
  suite (test-ordering pollution) but passes alone; present on the clean tree too.

## Verification
`npx tsc -p phone/tsconfig.json --noEmit` clean · 111/111 phone tests · `build:phone`
clean · owner device-confirmed Accio bar, Memory page, and reel spacing.
