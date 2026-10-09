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

## The Wand menu is three seats — New · Accio · Sync (locked)
- A capture phone has two verbs (make · find) + one status light. `ORDER` = `["sync","accio",
  "wand"]` with `wand` the centred HERO. **Home is the base surface, not a button**
  (leaving any layer returns there). **Cards** (an open-tabs switcher) was a desktop metaphor
  that doesn't belong on a capture phone — dropped.
- **Adjust was removed** (seat + resize/flip grip + design-layer). It can't move to a
  hub long-press because long-press-wand is the loved hold-to-speak gesture. Stored
  `wheelSide`/`wheelRadius` prefs are still honoured; if handedness flip is wanted back,
  add it as an explicit settings item, not a gesture.
