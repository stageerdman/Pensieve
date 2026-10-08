# PHONE-UX — update v1

## Goal
Design the **phone experience** for Pensieve — phone only, no PC. The phone is for
**fast capture of new thoughts** (primary) and **fast search of existing memories**
(secondary). Not a browsing/organizing surface like the desktop; a creation + recall
surface. This update is the **UX/UI design round**: produce interactive HTML concepts
the owner opens on their iPhone, pick a direction, then build.

Relates to [[../2026-10-07 PWA-CAPTURE - OPEN/update v1]] (the PWA runtime/auth/sync
plumbing). This update owns the *experience*; that one owns the *delivery*.

## The brief (owner's words, distilled)
- **Capture is the hero.** A magic-wand + thought-thread action that instantly creates
  a new document. Writing must feel **flawless and like Apple Notes** — smooth, direct,
  NOT Notion JSON blocks. Different from the computer on purpose.
- **Accio is crucial for search.** A button **under the thumb**; press → a **summon bar**
  opens and lets me type immediately. Must be *super smooth*.
- **The flask reel.** Browse bottles in rows; the focused one (center, or always on top)
  is **magnified** — showing title + part of the content — while the others are smaller,
  title + a little info (date). Scroll super smoothly; the focused one is always
  magnified. Same *vibe* as the computer app.
- **Sync looks like a spell.** A sync action rendered as magic.
- **Speech to text, speech to search.** First-class on phone.
- **Lightweight = super fast.** Above all.

## Design north star (for the experts)
Steve-Jobs minimalism (no useless text, no explanations, the fewest controls, super
clean) **fused with** Disney magic (delight, the small joy of rediscovering a thought).
Must feel like the same world as the desktop app: magical **flasks**, the **Basin**'s
deep blue-black stone, the magical-blue accent and gold. Magical AND highly practical.

## Phased roadmap
- **Phase 1 — Divergent concepts (THIS round).** 3 complete, distinct phone concepts as
  self-contained interactive HTML (iPhone viewport), each a different *spatial/magical
  spine* but all covering capture + Accio + flask-reel + sync-spell + speech. Owner
  reviews on device, names what to keep. (Fresh surface → 3 is justified; later rounds
  narrow to ≤2 per the working rule in UX.md.)
- **Phase 2 — Converge.** Synthesize the winner(s) into one locked phone concept + a
  short spec (screens, gestures, components, tokens).
- **Phase 3+ — Build** on the PWA-CAPTURE runtime.

## Live status
- 2026-10-08: Update opened. Phase 1 concepts commissioned from 3 parallel UX experts.
- 2026-10-08: Three concepts delivered (Wand / Reel / Pool). **Owner chose The Wand.**
- 2026-10-08: **Phase 2 — The Wand v2** built (`concepts/01-the-wand-v2.html`),
  resolving the owner's round-2 feedback:
  - **Reel reliability** — uniform fixed-height slots; focus derived from scroll
    position (`round(scrollTop / slotH)`) not from live geometry, so it can never
    flip to the wrong note or land misaligned ("a bit too up"). Magnification
    happens inside a fixed box (transform/opacity + flask resize) → zero reflow
    while scrolling. "Reel reliability, Wand UX."
  - **Tap a displayed memory → full screen**; the same surface reads + writes.
  - **Arc-style tabs** via a Cards action: open notes side-by-side, swipe a card
    up to close, double-tap Cards → home.
  - **Autosave** (no "Pour in" button); a quiet "Saved" tick.
  - **Chrome hides while typing** — the command strip + top bar slide away; return
    on blur. Reading mode keeps the strip (so Accio is reachable from a note).
  - **Left-thumb scrollable action strip** — 3 visible (Wand · Accio · Sync),
    swipe for Cards / Home. Wand stays the glowing hero (tap = new, hold = speak).
  - **Desktop icons reused exactly** — Accio = the Sigil (spins while summoning),
    Sync = the lemniscate SyncRune (flows while syncing, colour by state). Flasks,
    wand, and mic kept from v1.
  - **Sync** — tap casts the spell; press-hold opens a desktop-faithful details
    panel (title/last-backed-up/space/account/Back up now/Sign out); when RED
    (offline) a single tap opens it immediately. A faint prototype-only demo dot
    row cycles synced/reminder/offline so the states are testable.
  - Verified: self-contained (no network), JS parses, all `#id` refs resolve, and
    a headless jsdom boot drives open-memory / Accio / sync-cast / wand-new /
    autosave without errors (only `matchMedia` + `scrollTo` are jsdom gaps, both
    native in mobile Safari).
  - Still a **prototype with seed data** (writing/search/sync simulated). Wiring to
    the real vault + the PWA-CAPTURE runtime is Phase 3.
- 2026-10-08: **Converged to one concept.** Dropped the other concepts (old Wand v1,
  Reel, Pool) and the gallery — The Wand (`concepts/01-the-wand-v2.html`) is now the
  single canonical phone concept. `index.html` redirects to it for a clean URL.
  Served on the LAN (`python3 -m http.server` on the concepts folder) so the owner
  can open it on the iPhone at `http://<mac-lan-ip>:8080/`.
- 2026-10-08: **Round-3 refinements on The Wand** (owner's on-device notes), all built:
  1. **Reel is now a fixed magnifier.** The glass (`.lens`) holds still at a focal
     line; small uniform cards scroll *under* it; whatever sits under the glass is
     enlarged with title + snippet. Focus = `round(scrollTop/slot)` → deterministic,
     snaps. Drag on the glass scrolls the reel; tap it opens the focused memory.
  2. **No fake chrome.** Removed the pretend status bar (clock/signal/wifi/battery),
     the sync "demo" state switcher, the invented storage meter / "5m ago" / transfer
     counts. Sync now reflects the **real** device: `navigator.onLine` + online/offline
     events drive synced ↔ reminder (unsaved edits) ↔ offline; the cast is a real action.
  3. **Thumb-wheel menu (bottom-right).** One big centre action + two small ones on an
     arc around the right thumb; drag to rotate (spring-snaps into detents); tap any to
     run it. Wand is the glowing default centre; hold Wand = speak, hold Sync = details.
     Order cycles: Search · New(Wand) · Sync · Cards · Home; a label names the centre.
  4. **Accio opens the keyboard** — synchronous `.focus()` inside the tap (iOS raises
     the keyboard, caret ready); bar rides above the keyboard via a live `--kb`
     visualViewport inset. Removed the spinning-sigil animation (the "two bars" jitter).
  5. **Cards has an explicit "Back"** button that returns to the menu/home.
  6. **Menu always present**, vanishing only while the keyboard is up (title/body/Accio
     focused) — the single `.typing` rule now hides the wheel.
  - Verified: headless jsdom boot drives reel-tap, wheel taps (Accio/Sync/Cards/Wand),
    Accio keyboard+typing-hide, sync cast, Cards Back, and lens drag/tap — all clean,
    all `#id` refs resolve, 12 slots + 5 wheel actions render.
  - Still a prototype with seed data (writing/search/dictation simulated); sync cast is
    animated. Real vault + OneDrive wiring remains Phase 3.
- **Next:** owner re-tests on device and names anything to refine before we lock the
  spec and start the real build (Phase 3) on the PWA-CAPTURE runtime.
