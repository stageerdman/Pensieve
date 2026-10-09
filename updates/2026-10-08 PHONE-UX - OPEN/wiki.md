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
