# PHONE-UX — wiki (durable decisions & lessons)

## The Wand (the phone menu) — locked principles
- **Collapse/expand = gravity-well flick.** Flick a button radially inward → the wheel is
  sucked into a lone wand at the active corner; flick the lone wand out → it springs back
  to the last radius. Tangential swing still rotates; radial pull collapses/expands.
  Side-neutral (works from either corner). Owner picked this over "retract (1:1)" and
  "fan-fold" — "the best experience."
- **The menu is a PERSISTENT global layer.** It floats above every surface (note, cards,
  thread, search). The ONE thing that hides it is the real keyboard — see next.
- **Hide the menu on the ACTUAL keyboard, never on focus.** Driving menu visibility off
  focus was wrong: `openNewNote` focuses the editor from a `setTimeout` (not a user
  gesture), so iOS never raises the keyboard — yet the focus event still fired, hiding the
  menu with nothing there. Fix: a `.kb-open` class derived from `visualViewport`
  (`innerHeight - vv.height - vv.offsetTop > ~80px`), plus `.accio-open` for the search
  sheet. Focus still drives `.editing-note` (hides note chrome, arms the toolbar) but NOT
  the menu.
- **Menu sheets sit below the note (accio z130, switcher z135, note z140).** So menu
  actions triggered from inside a note must first LEAVE the note (shared `exitNote()` =
  commit + close + clear) or they open behind it. Home/Accio/Cards all route through it.
- **Colour language.** Accio = violet (`--accio`). Sync button = backup state: normal when
  synced, orange (`--warn`) when changes need backup, red (`--danger`) when a backup fails
  or offline. (Prototype forces the first cast of a session to fail so the owner can see
  red; `FAIL_RATE` tunable, set 0 for always-succeeds.)

## Note editor — Apple-Notes model
- **ONE contenteditable.** First block is the title as an auto-`<h1>` (caret-ready with a
  "Title" placeholder on a new note); everything after is body. Enter at the title breaks
  out into a normal body line. `commit` = first block → title, rest → body (newline-join).
  (Desktop editor must mirror this — see repo `issues.txt`.)
- **Keyboard accessory toolbar** (Apple-Notes style) carries Title/Body/Bold/List + Voice/
  Done, docked at `bottom:var(--kb)`, shown only while `.kb-open.editing-note`. Format
  buttons use `pointerdown`+`preventDefault` to keep the caret/selection.
- **Keep the caret visible yourself.** The note is a full-screen overlay, so the browser
  doesn't know the keyboard covers the bottom and lets the caret slide under the UI.
  `keepCaretVisible()` reads the caret rect and scrolls `#noteSurface` using
  `visualViewport` (which excludes the keyboard) to keep it above keyboard + 52px toolbar.

## contenteditable word selection — DON'T trust WebKit granularity
Double-tap/double-click word selection was broken: title grabbed 1–2 letters, body grabbed
several words with one cropped mid-word. **Two compounding WebKit causes:**
1. WebKit inserts **non-breaking spaces (` `)** between words in contenteditable and
   does NOT treat them as word breaks, so native selection runs across them.
2. Autocorrect **fragments text nodes**, and WebKit's double-tap word granularity is a
   known bug.
(Ruled out: viewport scaling, ancestor `transform`/`zoom`, `user-select:none` ancestor.)
**Fix pattern:** compute the word ourselves — `caretRangeFromPoint(x,y)` → find the block →
flatten text across ALL its text nodes → expand to real separators (whitespace incl.
` ` + punctuation) → map back to node+offset → set the Range. Wire to `dblclick`
(mouse) and a double-tap detector on `pointerup` (touch, run just after iOS so ours wins).

## Verifying this prototype
Browser automation can't reach the dev server; the Wand is a single self-contained HTML
file. Verify with a **jsdom boot** in Node (`/Users/stage/dev/Pensieve/node_modules/jsdom`)
plus shims: `navigator.vibrate`, `matchMedia`, `requestAnimationFrame`, `PointerEvent =
MouseEvent`, `Element.prototype.animate/setPointerCapture/scrollTo`, and a fake
`visualViewport` you can resize to simulate the keyboard. Drive the real DOM (tap `.wact`
buttons, dispatch events) and assert on classes/structure. The owner does the on-device
feel pass; serve the file over the LAN (`python3 -m http.server`) for that.
**Blur vs focus in jsdom:** to test the desktop keyboard-down fallback, call
`el.blur()` (which really moves `activeElement`), NOT a synthetic `blur` Event — the
handler guards on `document.activeElement === input`, so a dispatched event alone no-ops.
To test the iOS path, shrink the fake `visualViewport.height` past the 80px threshold and
fire its `resize` → `.kb-open` → `onKeyboardClosed`.

## Search = a FILTER on the home reel (locked) — "Home is search"
- **One surface, one list.** Accio does NOT open a separate results view. The home reel is
  the only list of notes; a single `filterQuery` narrows it in place (empty = everything).
  The old `.accio` overlay + its second `#accioResults` list were the *cause* of the
  "stray/duplicate search bar that lingers" — two lists of the same notes on two surfaces.
  Deleting the second surface makes the stray bar structurally impossible. **Never render
  notes in two places.**
- **Summon, don't reside.** No resting search box. Tap Accio → the lone `.summon` bar rises
  above the keyboard (thumb zone); typing filters live; matches get a violet `<mark>`.
- **Decouple search from scroll.** The bar lives OUTSIDE any scroller. On keyboard-down with
  a query it collapses to a top **pill** (`◎ <q> ✕`) and the reel stays filtered so matches
  scroll hands-free. This is what fixed "I scroll and the search bar disappears and can't
  come back" — scrolling can never dismiss the search. Keyboard visibility (not focus, not
  scroll) drives the collapse (`.kb-open`/visualViewport → `settleSearch`).
- Root classes: `.searching` = bar up (hides the wheel, like `.kb-open`); `.filtering` =
  a query is active (shows the pill when `:not(.searching)`, keeps the reel filtered).
- **The word "Search" is banned from the UI** — it's **Accio** everywhere (wheel label +
  mic aria). Placeholder is the in-world "Accio a memory…".

## Phone scroll lock — only dedicated elements scroll (locked)
- The shell never scrolls: `html,body,.screen { overflow:hidden; overscroll-behavior:none }`
  and on phone the body is pinned `position:fixed; inset:0`. Exactly ONE scroller per
  surface: the **reel** (`overscroll-behavior:contain; touch-action:pan-y`) and the
  **note-surface**. `overscroll-behavior:contain` on the reel is what killed the
  **"pull the note out of the screen" rubber-band** (there was previously NO
  overscroll-behavior anywhere — that was the bug).
- The JS `touchmove` guard (`preventDefault` for anything not inside `.reel,.note`) is the
  real page-lock enforcer and is robust across iOS versions. **Do NOT also put
  `touch-action:none` on `body`** — a `touch-action` on an ancestor can suppress panning in
  descendant scrollers on iOS and break the reel. Let the guard do the locking.

## The Wand menu — New · Accio · Sync + Adjust (locked)
- A capture phone has two verbs (make · find) + a status light + settings. `ORDER` =
  `["adjust","accio","wand","sync"]` with `wand` the centred HERO (Accio + Sync flank it;
  Adjust at the far edge, touched rarely). **Home is the base surface, not a button**
  (leaving any layer returns there). **Cards** (an open-tabs switcher) was a desktop metaphor
  that doesn't belong on a capture phone — dropped.
- **Adjust stays** (round-15 reinstated it after round-14 dropped it). It's the ONLY home for
  resize + side-flip: it can't be a hub long-press because long-press-wand is the loved
  hold-to-speak gesture, and tap-hold-sync opens the sync panel. So resize/flip needs its own
  seat + grip. `wheelSide`/`wheelRadius` persist in localStorage.

## Searching = "gravity flips to the keyboard" (locked)
- At REST the reel hangs from the top lens (eye rests high). The instant Accio opens, eye +
  thumb move to the BOTTOM, so results must appear THERE — not at the top. A `.search-sheet`
  (scrim over the dimmed reel) holds a `.search-results` stack anchored just above the summon
  bar; results pour UP, **best match nearest the bar** (rendered LAST, scrolled to bottom),
  dense rows. This directly fixed "my 1 result is hidden at the top while I'm looking at the
  bottom." Still ONE `filterQuery` — the sheet is the reel's data re-presented for thumb
  scanning, alive only while `.searching`; the reel filters behind it for the settle.
- **Enter / the blue key = commit → HELD**: `preventDefault`, drop the keyboard, bar→pill,
  reel keeps the matches. Never submits/clears. Empty query + Enter → clear to RESTING.
- **Reopen reliability (the "keyboard pops up then drops" bug).** Cause: the *previous*
  keyboard's dismissal tail fires a spurious `visualViewport` "close" onto the just-opened
  bar. Fix, three rules: (1) focus the input **synchronously inside the tap gesture** (never
  from a timeout); (2) `onKeyboardClosed` is **disarmed until the keyboard is confirmed up
  this session** (`searchArmed`, set in `updateKB` on the up-transition) AND **ignores any
  close within ~400ms of opening** (`searchOpenedAt` jitter window); (3) `openAccio` cancels
  any in-flight blur-close timer. Don't drive the keyboard off focus side-effects.
- **Inline style beats a class.** `layoutArc` sets the centred `#wheelLabel` opacity *inline*,
  which overrode the `.searching` CSS hide → a stray "ACCIO" floated over the bar. Fix: make
  `layoutArc` honour searching/kb-open when it sets that inline opacity, and call a new
  `__wheel.refresh()` from `openAccio`/`hideSearchBar` so it updates the instant the bar
  toggles (don't wait for the next wheel interaction). General lesson: if JS writes an inline
  style, a CSS class can't hide it later — update it from JS or use the same channel.
- The mock `.home-indicator` bar is hidden on phone/standalone — the OS draws its own, so ours
  read as a stray pull-line. Voice search was removed from the Accio bar (dictation stays in
  the note toolbar).

## The feed: inertia + the LOUPE (round-16, locked)
- **`scroll-snap-stop:always` is the inertia killer.** With `scroll-snap-type:y mandatory`, it
  forces a hard stop at *every* snap point → a flick can only ever advance ONE card ("too much
  resistance, stops immediately"). For a feed that should coast, **remove BOTH**: let the reel
  ride native momentum, then do a **JS scroll-idle settle** (~90ms of quiet → ease to the
  nearest slot, 140–260ms easeOutCubic). Resting focus = `round(scrollTop/SLOT_H)`, fully
  decoupled from CSS snap. Don't use `proximity` either — it hands the landing back to the
  browser and fights the JS settle (double-animation hitch on WebKit).
- **A JS settle MUST never fight the finger.** Track the scrollTop you last wrote; if reality
  diverges (user re-grabbed mid-glide) abort immediately. A `settling` flag alone isn't enough
  — it stops re-arming but the rAF keeps writing scrollTop over the user.
- **The magnifier is a fisheye on the list, not an overlay box.** The old fixed `.lens` card
  *was* the thing hiding behind bottles (a separate box with the focal card merely
  `opacity:0`), and it popped discretely. Replace it with: a FIXED transparent glass frame
  (rim + sheen, `pointer-events:none`) pinned on the focal line, and the **focal row itself
  swells** via a vertical fisheye. Drive it off **fractional** `f=scrollTop/SLOT_H` recomputed
  per scroll frame (NOT a rounded index) → memories visibly swell entering the glass and
  shrink leaving it ("see the transition in the glass").
- **Parting = the integral of the magnification curve.** Hann lobe `w(x)=½(1+cos(πx/R))` for
  scale; the neighbours' offset is its closed-form integral `W(x)=½(x+(R/π)sin(πx/R))`, which
  is **odd with W(0)=0** → the focal line never drifts and every other row is pushed *exactly*
  clear of the glass. That's why "bottles hiding under the glass" becomes structurally
  impossible — not a z-index patch, a geometric one. Focal row is also top-most via
  `z=round(scale·1000)`.
- **Don't uniform-`scale()` a full-width row.** It scales WIDTH too → the row blows ~135px off
  each screen edge and `overflow-x:hidden` clips it (flask scales off-screen). A loupe over a
  *vertical list* grows height + content size, width held. Drive it with a per-frame `--m`
  custom property on font-size/flask dims. Tradeoff: that reflows the ~7 in-window cards each
  frame (vs transform-only/compositor). Fine at this scale; revisit if device feel janks.
- **Layering trap:** per-card `z-index` up to ~scale·1000 (~1750) will render cards OVER the
  wheel/note/summon, because `.screen{ isolation:isolate }` is the stacking root and
  `.app`/`.reel` (positioned but `z-index:auto`) form no context of their own. Contain them:
  `.reel{ position:relative; z-index:0; isolation:isolate }`; put the glass just above the
  reel but below the menu/note layers.
