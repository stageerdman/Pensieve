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
- 2026-10-09: **Round-9 — the menu is now a PERSISTENT global layer + colour-coded.**
  Owner: the collapse idea is done/great; the *principle* changes — the menu lives on
  **every** surface and vanishes only when the keyboard is up.
  1. **Persistent menu.** Raised the whole menu subsystem above the content overlays
     (`.wheel` z88→150, label 151, design-layer/num 152/153, grip 154; the menu-summoned
     sync-panel 120→156 and cast-spell 110→158 sit above it). So the wheel floats over the
     note / cards-switcher / thread while reading, and only `.app-root.typing` (keyboard
     raised, already wired to focus/blur) hides it. Moved the note's dictate FAB to the
     **opposite corner** from the menu (mirrors with side-flip) so they never collide.
  2. **Accio = violet.** New `--accio:266 72% 74%`; the Accio button now has a decent
     purple-transparent radial-gradient fill, a purplish border, and a violet icon (plus a
     violet centred ring). Scoped `.wact[data-key="accio"]` so it beats the generic centred
     style.
  3. **Sync = state colour.** New `--warn` (orange). Sync button: **normal/muted when
     synced**, **orange when it needs backup** (`reminder`/`syncing`), **red when it fails**
     (`failed`, with a soft alert pulse) or offline. Scoped to `[data-key="sync"]` so the
     state wins even when the button is centred. Added a real **`failed`** state to the
     machine: `castSpell` can fail (`FAIL_RATE:0.4`, and the first cast of a session always
     fails once so the owner can *see* red on device), panel shows "Backup didn't finish /
     Try again", and tapping sync retries. Set `FAIL_RATE=0` for always-succeeds.
  - jsdom-verified: boots clean (`__wheel` up, wheel z-index 150), Accio→`--accio`, sync
     states map synced→muted / reminder+syncing→warn / failed+offline→danger, and a driven
     tap runs syncing→failed→retry→syncing with zero errors.
- 2026-10-09: **Round-10 — menu-always-present fix + Apple-Notes editor + keyboard bar.**
  1. **"Menu disappears on new note" — root cause & fix.** `openNewNote` focuses the
     editor from a `setTimeout` (not a user gesture), so iOS does NOT raise the keyboard —
     but the `focus` event still fired the old focus-based `.typing`, hiding the wheel with
     no keyboard to justify it. Rewired: the menu now hides **only on the actual keyboard**
     (`.kb-open`, derived from visualViewport in `updateKB`, threshold 80px) or the Accio
     sheet (`.accio-open`). So a new note keeps the menu until you actually tap to type.
  2. **Title = first line = auto-H1 (Apple Notes / Pensieve model).** Dropped the separate
     title field. The note is now ONE `#noteBody` contenteditable: first block is an `<h1>`
     (the title, caret-ready with a "Title" placeholder on a new note), everything after is
     body. **Enter at the title breaks out into a normal body line** (keydown handler splits
     at the caret). `openNote`/`commit` updated (title = first block text, body = the rest,
     joined by newlines). Date moved into the top bar (hidden while editing). *(Desktop
     TipTap editor must mirror this same rule when Phase 3 builds it — see issues.txt.)*
  3. **Keyboard accessory toolbar (Apple-Notes-style).** New `#noteToolbar` docked above
     the keyboard (`bottom:var(--kb)`), visible only while editing with the keyboard up
     (`.kb-open.editing-note`). Buttons: **Title / Body / B / • List** (execCommand,
     `pointerdown`+preventDefault so the caret/selection is kept) and **Voice / Done** on
     the right. Voice shares the dictation path; Done dismisses the keyboard. The floating
     dictate FAB hides while the toolbar is up (kept for the no-keyboard/reading case).
  4. **Accio bar no longer lingers.** It opened via `.typing`+focus and never closed on a
     bare keyboard dismiss. Now `openAccio` sets `.accio-open`; when the keyboard drops
     (`updateKB` → `onKeyboardClosed`, and a blur fallback for desktop) the bar closes — so
     it's open only while the keyboard is. Voice-search guarded so the mic doesn't self-close
     it.
  - jsdom-verified end-to-end: boot clean; new note → empty H1 + menu still visible (no
     kb-open); Enter-in-title → body DIV; commit splits title/body ("Groceries" + "milk,
     eggs"); Accio opens → kb up → kb down → auto-closes; conjure animation path clean.
- 2026-10-09: **Round-11 — cross-surface navigation via the menu.** Added a shared
  `exitNote()` (commit + close + clear current + un-edit) so menu actions work from inside
  a note instead of opening a sheet *behind* it (accio z130 / switcher z135 are below the
  note z140):
  1. **Accio from a note** opened the keyboard over the half-hidden note ("I see shit").
     `openAccio` now `exitNote()` + `closeSwitcher` first → always searches from home.
  2. **Cards from a note** did nothing visible (switcher opened behind the note).
     `openSwitcher` now `exitNote()` first → the switcher shows (with the note you just
     left among the cards).
  3. **Removed the "Back" button** from the Cards switcher (markup + handler + CSS) — the
     persistent menu (Home / tap a card) handles leaving it.
  - `goHome` refactored onto `exitNote`. jsdom-verified: from an open note, Accio → note
     closes + accio opens (accio-open set); Cards → note closes + switcher opens;
     `#switcherDone` gone; no errors.
- 2026-10-09: **Round-12 — editor fixes (mic, selection, caret-scroll).**
  1. **Removed the standalone dictate FAB** in notes (markup + CSS + JS). Voice now lives
     ONLY in the keyboard toolbar (`#tbVoice`) — the floating-mic experience is parked for
     later.
  2. **Text selection.** Double-tap/word-select was grabbing too much. Two fixes: explicit
     `-webkit-user-select:text; user-select:text; -webkit-touch-callout:default` on
     `.note-body`, and the elastic-scroll `touchmove` guard now whitelists the **whole
     `.note`** (was only `.note-surface`) so iOS's selection loupe/handles and the editor's
     own scroll are never `preventDefault`-ed. *(Needs device confirmation.)*
  3. **Caret follows typing.** The note is a full-screen overlay, so the browser didn't
     know the keyboard covered the bottom and let the caret slide behind the UI. Added
     `keepCaretVisible()` — on input / Enter-breakout / keyboard-open it reads the caret
     rect and scrolls `#noteSurface` so the caret stays above the keyboard + 52px toolbar
     (uses visualViewport, which excludes the keyboard; falls back to the current block's
     rect; guarded for no-Range-rect environments).
  - jsdom-verified: boot clean; FAB gone; type → Enter → body DIV; toolbar Voice →
     listening; keepCaretVisible runs without throwing. No errors.
- 2026-10-09: **Round-13 — fix broken word selection (researched).** Symptoms: double-tap
  in the title selected 1–2 letters; in the body it grabbed several words with one cropped
  mid-word. **Root causes (researched):** (1) WebKit inserts non-breaking spaces (` `)
  between words in contenteditable and does NOT treat them as word breaks, so native
  double-tap selection runs across them → "several words, one cropped"; (2) autocorrect /
  spellcheck fragments text nodes, and WebKit's double-tap word granularity is a documented
  bug → 1–2-letter selections. (Confirmed not viewport-scale or an ancestor transform /
  `user-select:none` — checked.) **Fix:** stopped relying on WebKit's granularity — added
  `selectWordAtPoint(x,y)` that flattens the tapped block's text across ALL its text nodes,
  expands to real separators (whitespace incl. ` ` + punctuation), maps back to
  node+offset, and sets the selection. Wired to `dblclick` (desktop) and a double-tap
  detector on `pointerup` (touch) that runs just after iOS's own pass so ours wins. Removed
  the `overflow-wrap:break-word` added last round.
  - jsdom-verified: with a fragmented div `hel|lo wor|ld okay`, tapping "world" selects
     exactly "world" (crosses both the nbsp and the node boundary); tapping "okay" selects
     "okay". Boot clean, no errors.
- 2026-10-09: **Round-14 — magical Search (Accio) + rock-solid scrolling.** Commissioned
  3 parallel UX experts (magical-feel · scroll/layout mechanics · information architecture)
  as the orchestrator; all three converged on **"Home *is* search"**. Built:
  1. **Search is now a live filter on the home reel — one surface, one list.** Deleted the
     separate `.accio` overlay and its second results list (`#accioResults`) entirely; that
     duplicate list was the root of the "stray search bar that lingers after the menu
     closes". `renderReel()` now reads a single `filterQuery` → renders the matching subset
     (empty = everything). Matches are highlighted (`<mark>`, violet) in both the reel cards
     and the lens; the count reads "N matches"; no results → the lens says *"Nothing
     answered that call."*
  2. **Accio is summoned, not resident.** Tap Accio → the lone summon bar rises above the
     keyboard (under the thumb), caret ready, reel filtering live. The word **"Search" is
     gone** — the wheel label and everything else say **Accio**.
  3. **Persistent filter pill.** Drop the keyboard with a query → the bar collapses into a
     quiet top pill `◎ <query> ✕`; the reel stays filtered so matches scroll **hands-free**
     (fixes "I scroll and the search bar vanishes and I can't get it back" — search and
     scroll are now fully decoupled). Tap the pill = edit the query; tap ✕ = everything back.
     Empty dismiss clears. Driven by the keyboard (`.kb-open`/visualViewport), never by focus
     or scroll.
  4. **Scrolling locked — only dedicated elements move.** `html,body` + `.screen`:
     `overflow:hidden; overscroll-behavior:none`; body pinned `position:fixed` on phone. The
     reel is the ONE scroller (`overscroll-behavior:contain; touch-action:pan-y`); same for
     the note surface. This removes the whole-app scroll and the **"pull the note out of the
     screen" rubber-band** the owner disliked. The `touchmove` guard now whitelists only
     `.reel,.note`.
  5. **Steve-Jobs menu cut (owner-approved).** Dropped the **Home** button (Home is the base
     surface, not a destination) and the **Cards** switcher (redundant with Home on a capture
     phone; removed the switcher UI + open-tabs tracking). Removed the **Adjust** seat and its
     resize/flip grip + design-layer overlay. Wheel is now three seats: **New (hero) · Accio
     · Sync**. *(Note: handedness flip / wheel-resize went away with Adjust — a stored
     `wheelSide`/`wheelRadius` preference is still honoured, but there's no in-app control for
     now. Flag for the owner: re-add as a settings item if wanted — it couldn't live on a
     hub long-press without colliding with the loved hold-to-speak wand gesture.)*
  - jsdom-verified end-to-end (33 checks): 3 seats only; no switcher/overlay/second-list/
     grip/tab-count; live filter narrows + highlights + empty-state; both keyboard-close
     paths (desktop blur + iOS visualViewport) collapse to the pill with the filter intact;
     pill ✕ restores all; New clears the filter; zero runtime errors.
- 2026-10-09: **Round-15 — searching experience + Accio fixes (owner round-14 device notes).**
  Re-ran 2 parallel UX experts (the "searching" moment + the state/transition lifecycle);
  they converged on **"gravity flips to the keyboard."** Built:
  1. **While typing, results pour UP from the bar.** New `.search-sheet` (a scrim over the
     dimmed reel) holds a `.search-results` stack anchored just above the summon bar, best
     match **nearest the thumb** (rendered last), dense rows (flask · title · snippet ·
     date) with the violet highlight. Fixes "my 1 result was hidden at the TOP while I'm
     looking at the bottom." Single-result row inflates into a mini-lens. It's the **same
     single `filterQuery`** — the sheet is the reel's data re-presented for thumb-scanning,
     and exists ONLY while `.searching`. Match count rides the bar (`#accioCount`).
  2. **Enter / the blue key** now commits: drop the keyboard, collapse the bar → pill, reel
     shows the matches for hands-free scrolling (→ HELD). Empty query + Enter → clears.
  3. **Reopen reliability (the "keyboard pops up then immediately drops" bug).** Root cause:
     the *previous* keyboard's dismissal tail fired a spurious viewport "close" onto the
     freshly-opened bar. Fix: focus stays synchronous-in-gesture; `onKeyboardClosed` is
     **disarmed until the keyboard is confirmed up this session** (`searchArmed`) AND ignores
     any close within a 400ms jitter window after opening (`searchOpenedAt`); `openAccio`
     also cancels any in-flight blur-close timer. Reopening is now one reliable tap.
  4. **Stray "ACCIO" over the bar — fixed.** `layoutArc` sets the centred wheel label's
     opacity inline, which beat the `.searching` CSS hide; now it respects searching/kb-open
     and `openAccio`/`hideSearchBar` call a new `__wheel.refresh()` so the label clears the
     instant the bar opens.
  5. **Mic removed** from the Accio bar (voice search parked; dictation still lives in the
     note toolbar).
  6. **Stray bottom line removed** — the mock `.home-indicator` is hidden on phone/standalone
     (the OS draws its own; ours read as a duplicate pull-line).
  7. **Adjust (settings) restored** — owner wants resize/side-flip back. Re-added the Adjust
     seat + grip + design-overlay (hold = flip side · radial drag = resize). Wheel is now
     four seats: **Adjust · Accio · New(hero) · Sync** (New centred; Accio + Sync flank it;
     Adjust at the far edge). *(Supersedes round-14's Adjust cut.)*
  - jsdom-verified (31 checks): 4 seats incl Adjust; sheet pours results (empty=all, 1-result
     state, highlight) while the reel stays filtered behind; Enter→pill; stray label hidden
     while searching + restored after; the spurious-close-right-after-open does NOT collapse
     the bar while a genuine later close does; New clears the filter; zero runtime errors.
- 2026-10-09: **Round-16 — feed inertia + the LOUPE (a real magnifying glass).** Owner:
  "first scroll should be almost flawless — too much resistance, it immediately stops; I want
  inertia. And I LITERALLY want the magnifying window to look like a magnifying glass — zoom
  one thought, but SEE the transition in the glass as I scroll; and the glass keeps hiding
  behind 2-3 bottles — instead DEFORM the row so the focal row widens and others can't hide
  under it." Ran 2 parallel UX experts (scroll-physics + the magnifier metaphor), synthesized,
  then a UI coder built it. Shipped:
  1. **Inertia.** Removed `scroll-snap-type:y mandatory` **and** `scroll-snap-stop:always`
     (the latter forced a hard stop at every card → one card per flick, the "resistance").
     The reel now coasts on native momentum; a **90ms scroll-idle JS settle** eases to the
     nearest slot (`clamp(dist·2.2,140,260)ms`, easeOutCubic), guarded by a `settling` flag
     **and** a divergence check that aborts the settle the instant a finger re-grabs mid-glide
     (never fight the finger). Resting focus is still `round(scrollTop/SLOT_H)` — decoupled
     from CSS snap entirely.
  2. **The LOUPE.** Killed the fixed `.lens` box. A fixed transparent glass frame (rim +
     sheen + faint chromatic fringe, `pointer-events:none`) is pinned on the focal line
     (`~42%` down the reel); memories **glide through it and swell continuously** via a
     vertical fisheye driven by *fractional* `f=scrollTop/SLOT_H` (Hann lobe, `R=2` slots,
     focal `1.75×`). Neighbours are **parted away** by the closed-form integral of that curve
     (odd, `W(0)=0` → the focal line never drifts), so nothing can hide under the glass by
     construction. Focal row reveals its 3-line snippet; it's top-most by `z=round(scale·1000)`.
     A velocity-gated haptic ticks as memories cross the glass (silent during fast flings).
  - **Deviation (noted):** magnification is driven by a per-frame `--m` custom property
     (flask dims + font-size grow, **width held**) instead of `transform:scale` — a uniform
     scale blew the full-width row ~135px off-screen (clipped by `overflow-x:hidden`). A loupe
     over a *vertical list* grows height+content, not width. Costs a reflow of the ~7 window
     cards/frame (bounded; negligible expected). **Watch on device;** if it janks, scale the
     text block from a left origin instead.
  - **Layering trap fixed:** card z-indices reach ~1750; `.screen` has `isolation:isolate` and
     `.app`/`.reel` formed no stacking context, so cards would have rendered **over** the
     wheel/note/summon. Fix: `.reel{ position:relative; z-index:0; isolation:isolate }`
     contains them; `.glass` sits just above the reel but below the menu/note layers.
  - jsdom-verified (19 checks): clean boot; 12 slots each with a snippet; focal `--m≈1.75`
     with the focal line fixed (`ty≈0`); continuity at half-scroll; off-window identity;
     focal z on top; settle lands on slot multiples; tap opens; Accio filters/highlights/
     restores; empty-state glass. Zero runtime errors.
- **Next:** owner device feel-pass — (a) the flick now coasts through many memories and kisses
  into place (real inertia); (b) the glass reads as glass and the swell travels through it as
  you scroll; (c) no bottle ever hides under the glass; (d) confirm the `--m` reflow stays
  smooth on-device (the one thing jsdom can't measure). Earlier rounds' device notes
  (searching, reopen, Adjust, word-selection) still pending. Then lock the Wand spec →
  Phase 3 (wire to the real vault + PWA-CAPTURE runtime).
