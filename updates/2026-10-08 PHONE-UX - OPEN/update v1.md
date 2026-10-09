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
- 2026-10-08: **Round-4 — the thumb-wheel rebuilt for feel** (owner: v3 wheel felt
  "very stuck… almost not useful"). Root causes: only the 58px buttons were grabbable,
  62px-per-step, `left/top` written every frame (layout thrash), no momentum. Ran **3
  UX/interaction experts in parallel** (`concepts/wheel-lab/wheel-A|B|C.html`): A =
  angular drag + inertia→spring; B = native iOS scroll-snap momentum; C = tangential
  drag + single blended friction / critically-damped spring + detent micro-feel.
  **Synthesised C into the app** (hardened with A's pointer-capture/large-grab-zone):
  - A large invisible `#grab` zone owns the gesture — spin the dial from anywhere in
    the thumb corner, not just the buttons.
  - Tangential 1:1 drag around the hub; release → inertial coast that eases onto the
    nearest action via a critically-damped spring (no wobble); visual detent "pop" +
    scale/glow as each action reaches centre (iOS Safari ignores web vibration, so the
    feel is carried visually). Buttons are `pointer-events:none`; positioned with
    `transform` only → 60fps, zero layout thrash. Single rAF that sleeps at rest.
  - Tap any visible action = run it (snaps it to centre); hold centred Wand = speak,
    hold centred Sync = details. All physics constants are labelled tunables (`T`).
  - Verified: integrated file boots clean (jsdom), wheel drives on drag + tap with no
    errors, reel/note/accio/sync/cards flows intact.
  - Lab files A/B/C kept under `concepts/wheel-lab/` so the owner can feel the
    alternatives on device if desired.
- 2026-10-08: **Round-5 — switched the wheel to the native-scroll model (B) + an
  adjustable hub.** Owner felt **wheel-B** was the smoothest of the three (it rides iOS's
  own momentum/snap), so B is now the app's wheel:
  - Invisible `.dial` scroll container over the thumb corner drives a float `pos`
    (scrollTop/snap); buttons laid on the arc by transform only; seamless looping via
    cycle-recentre. iOS owns all the physics.
  - **Tap a button → runs in place; it does NOT scroll to it** (owner's note). The dial
    only moves when you scroll. Hold the centred Wand = speak, hold centred Sync = details.
  - **The hub (an "empty circle") — always present, two gestures:**
    · **Drag** → resize the arc (how far the buttons sit from the corner). A live
      **design-mode overlay** appears: the arc-circle outline, a spoke from the corner to
      the centred button, and a number (px) that changes as you pull in/out.
    · **Hold ~2s** (a gold ring fills as you hold) → **switch the wheel to the opposite
      side** (right ↔ left) — pivot, arc, dial, hub, glow all mirror.
  - Side + radius **persist** (localStorage). jsdom-verified: boots clean; drag-resize,
    flip, tap, and reel/note/sync/cards flows all drive without error.
  - Lab files A/B/C stay under `concepts/wheel-lab/`.
- 2026-10-08: **Round-6 — owner feedback on the dial.** Four fixes:
  1. **Adjust is now a 6th MENU OPTION** (an empty dashed circle), not a separate
     always-there hub. Scroll it to centre; a grip then goes live *over that button*.
  2. **Scrolling fixed** — the global `touchmove` guard wasn't whitelisting `.dial`, so
     iOS native scroll on the wheel was being `preventDefault`-ed (wheel wouldn't spin).
     Added `.dial`; also **shrank the dial to the thumb corner** (60%×52%) so the reel
     (background) stays scrollable everywhere else + via the lens.
  3. **Side-flip completeness** — on flip, the dial, corner-glow, AND the sync panel now
     all move to the active side (was leaving the right-hand "hole"). *(Owner to confirm
     the hole is gone — may need a screenshot.)*
  4. **Alignment** — resize (design overlay: pivot-centred arc-circle + spoke + px
     number) and hold-to-flip (gold ring around the centred button) are now separate
     gestures that never co-show, each correctly placed; the grip's ring is centred on
     the button, so no more misaligned circles.
  - Tap a button still runs it IN PLACE (no scroll-to-centre). jsdom-verified: 6 options,
    54 snaps, grip resize/flip, dial whitelisted, side flip, flows all clean.
- 2026-10-08: **Round-7 — buttons ARE the handles.** Owner: the big invisible dial was
  catching touches "almost anywhere," blocking background scroll. Removed the native-
  scroll dial entirely. Now rotation happens ONLY by grabbing a menu button and swinging
  it around the arc (angular 1:1, button sticks to finger) with a light inertial glide +
  detent settle on release. Every gap / the centre / around / outside falls straight
  through → the reel (background) scrolls normally. Tap a button = run in place.
  - **Adjust** (centred) now decomposes the drag: **radial** pull (straight out/in from
    the corner) = resize; **tangential** swing = rotate the wheel like any button; **hold
    ~2s** = flip side. (Was: any drag resized.)
  - **Glow mirrored** on flip (`at 30% 70%` on the left) so it pools in the corner
    instead of showing a box mid-screen.
  - Grip lifted above the buttons (z110) so it actually receives the centred-adjust
    gestures. Typing hides the whole wheel + buttons. Side + radius persist.
  - jsdom-verified: 6 options, dial gone, drag rotates, tap runs, grip resize/flip, glow
    mirrored, flows intact.
- 2026-10-09: **Round-8 — collapse & expand (owner: "circle menu works amazingly").**
  Added a radial collapse so the whole wheel can fold into a single lone **wand** at the
  active corner and pull back out to its last position. Every button now **decomposes its
  drag** into tangential (swing → rotate, unchanged) vs radial (toward/away from the
  corner pivot → collapse/expand), reusing the Adjust grip's pending-threshold pattern.
  Side-neutral, so it works mirrored on **both corners**. Built **3 feels in parallel**
  (3 agents → lab files, all jsdom-verified) for the owner to try on device:
  · **A retract** — direct 1:1 pull in/out along the spokes, spring-snaps on release.
  · **B fan-fold** — arc folds shut like an umbrella (spacing→0 + radius-in, staggered),
    fans open with overshoot.
  · **C gravity-well** — a short inward *flick* sucks the buttons into the corner on a
    damped spring; flick the lone wand out to spring them back. Least finger travel.
  **Owner picked C (gravity-well): "the best experience."** Folded C into the main Wand
  (`01-the-wand-v2.html`); removed A and B and the `collapse-lab/` folder. Merged file
  re-verified clean in jsdom (`__wheel` boots, collapseT=0, no errors). Tunables in CFG:
  `COLLAPSE_R:64`, `FLICK_DIST:34`, `FLICK_VEL:520`, `COLLAPSE_STIFF:150`,
  `COLLAPSE_DAMP:0.6` (slight overshoot), `PEND_PX:8`. Rotate, tap, Adjust, side-flip,
  and all flows remain intact; collapse never false-fires on rotate/tap/hold.
- **Next:** owner tests the gravity-well on device — flick-in/flick-out feel, thresholds
  (does a normal rotate/tap ever trigger it?), the lone-wand resting spot + overshoot.
  Tune `FLICK_DIST/FLICK_VEL/COLLAPSE_DAMP/COLLAPSE_R` to taste. Then lock the full Wand
  spec and start Phase 3 on the PWA-CAPTURE runtime.
