# Wiki — durable lessons (PHONE-FEED-ACCIO-FIX)

## The reel loupe must part the WHOLE visible band, not a tiny window
The fisheye "parting" (the push that opens a gap around the focal card) comes from the
integral of the magnification curve, which **saturates to a constant ±offset** (~0.75·slot
here) beyond the loupe radius. If you only apply parting to the magnified window and reset
everything outside it to 0, the last parted card sits that constant offset closer to the
first un-parted card — a visible spacing **seam**. It was masked by snap-to-slot (always
landing on an integer slot); the moment the reel free-scrolls, the seam crawls through the
on-screen cards. **Fix:** apply the (cheap, no-layout) parting transform across the whole
visible band + a margin derived from reel height, so the seam edge is off-screen. Keep the
expensive work (magnification, opacity, snippet measure) in the tight focal window.

## "Everything lifts up and never returns" was OURS, not iOS
It reproduced on **desktop** (no keyboard) — the tell that it wasn't a visual-viewport
quirk. Two independent self-inflicted causes:
- Focusing an **off-screen** input makes the browser scroll the `overflow:hidden` shell to
  chase it, and nothing resets that scroll → `input.focus({ preventScroll: true })`.
- A `transform: translateY(vv.offsetTop)` on the ROOT element to "compensate" for the iOS
  pan can get **stuck**. Prefer letting bars ride above the keyboard via a `--kb` var +
  `margin-bottom`, and never leave a transform on a container you don't actively reset.
Lesson: a full-screen "shift that never returns" is almost always a stuck transform or an
un-reset scroll on an ancestor — look there first, and reproduce on desktop to rule out the
keyboard.

## Conditional-mount + synchronous focus = flushSync
To keep a focus-on-tap surface (the Accio bar) OUT of the DOM at rest yet still raise the
iOS keyboard, you can't `setState` then focus — the element isn't mounted yet and async
focus after render won't raise the keyboard (iOS requires focus inside the tap gesture).
`flushSync(() => setMounted(true))` renders it synchronously within the gesture, then
`focus()` lands on the live node. Same pattern mounts the Memory page synchronously so its
refs are live before we write the body, then an rAF flips `.open` for the slide.

## Snippet centring at any line count
Absolute-positioned text at a fixed offset can't self-centre when it wraps to N lines (it
grows one direction only). Put title+meta+snippet in one flex column centred on the focal
line, and drive the snippet's `max-height` from the loupe reveal (collapsed off-focus so
resting rows stay compact). It then centres for 1, 2, or 3 lines automatically.
