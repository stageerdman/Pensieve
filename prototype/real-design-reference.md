# How the real Pensieve does it: reference for the wow prototype

For Jony (look) and Merlin (story). Everything here is copied from the app's own code on
2026-11-24. File paths are given so you can check any detail. **If the prototype differs from
this, the prototype is wrong, unless you change it on purpose.**

> Note on sources: the brief names `video-capture-design.html` and `capture-controls-reference.html`.
> They sit only in the main checkout's root and were never committed (see
> `updates/2026-11-02 VIDEO-CAPTURE - OPEN/update v1.md`), so I could not open them. The code
> below is the built version and is the source of truth.

---

## 1. The phone's one control language (non-negotiable, `UX.md`)

- **Dark first.** The page is deep blue-black stone, `hsl(222 24% 11%)` (about #141a24). Text is
  `hsl(216 18% 84%)` and muted text `hsl(218 12% 60%)`. Raised cards use `hsl(222 18% 17%)`.
  The font is the system font: `-apple-system, "SF Pro Text", system-ui`.
- **Gold** `hsl(43 92% 55%)` is the "General / daily" colour. **Blue** `hsl(215 85% 74%)` is the
  "Conditional / this page" colour. **Violet** `hsl(266 72% 74%)` is used only for Accio (search).
  **Red** `hsl(0 68% 65%)` is for danger and recording. **Green** `hsl(150 28% 55%)` is the short
  "just synced" flash.
- **No top bars and no floating buttons.** Every control sits in the **Dock**, a see-through grid
  of 4 cells pinned to the bottom (row 64px, gap 10px).
  - Cell 4 (bottom right) holds the **gold Spell-Menu button**: 56px, no background, a glowing
    gold glyph that flickers like embers (4.4s) over a breathing gold glow (4s). **It is always
    bare: no badge, no dot, no sync sign.** The owner has asked for this many times.
  - Home: cells 1 to 3 hold one wide **Accio** search pill (56px tall).
  - Inside a memory: one **Back** button in cell 3, next to the menu button.
- **The Spell Menu.** Tap the gold button and the page blurs (16px) and darkens. A **ring of
  spells** blooms, with its centre at 60% of the screen height (in thumb reach). Radius 118px.
  Each spell is a 64px **dark disc with one glowing ring** and a line glyph, with a small
  UPPERCASE 11px label. The spell nearest the top is "in focus": 12% bigger with a thicker ring
  and a halo. You can spin the ring with a finger, and it loops. A small dot under a disc means it
  opens a sub-ring. Closing gives a small gold sparkle.
  - **General ring (gold)**, opened from Home: **Write · Accio (violet) · Sync · Snap · Record ·
    Film · Journal · Form** (Form shows only if the user has a form). Most-used is at the top.
  - **Conditional ring (blue)**, opened inside a memory: **Photo · Gallery · Voice ▸ (Record /
    Upload) · Video ▸ (Film / Upload) · Patronus · Delete (red)**. The centre text says
    "see general" so you can switch rings.
- Words: notes are **memories**, actions are **spells**.

## 2. Every capture mode, exactly as built

All four "mint" spells (Snap, Record, Film, Journal) **create a new memory first, then jump straight
into capture**. A thin "conjure" thread animation opens the new memory (`openCaptureNote`,
`phone/src/PhoneApp.tsx:448`). If the person backs out without capturing anything, the empty
memory is **silently thrown away**. Nothing is left behind.

### Snap (photo): glyph `camera`
1. Tap the gold button, then **Snap**.
2. The **iPhone's own camera opens at once** (rear camera, one shot). There is no in-app viewfinder
   and no "Library / Take photo" sheet first. The app hands off to iOS.
3. Shoot, then tap "Use Photo". A memory titled **"New Image"** with the line **"added image"**
   opens, with the photo in it. A light haptic tap.
- Inside a memory, **Photo** adds to it (iOS sheet: Library / Take Photo / Choose File, pick
  several) and **Gallery** starts a new photo grid.

### Record (voice): glyph `mic`
1. Tap the gold button, then **Record**. A memory **"New Recording" / "added recording"** opens.
   After about 0.46s the recorder appears.
2. **The recorder is a card at the bottom** (not full screen). The page behind blurs (10px) and
   dims. The card is max 360px wide, raised dark, with a soft big shadow. From top to bottom:
   - a **pulsing red dot** (8px, 1.4s) and a muted 13px status: `Starting…` → `Recording`
     (or `Paused`, or `Paused — mic was interrupted`)
   - a **big timer**, 34px semibold with even-width digits: `0:00`
   - a **live waveform** of **7 gold bars** (6px wide, rounded) that move with the voice
   - two equal buttons: **Pause** (grey) | **Done** (gold, dark text). Pause turns into **Resume**.
3. **There is no Delete or Cancel**, on purpose: the app must "never lose it". Locking the phone
   saves the take and shows the toast *"Recording saved — the phone must have locked"*.
4. Done: the card fades. The memory shows an audio bar.
- Inside a memory: **Voice ▸ Record** (same card, into this memory) or **Voice ▸ Upload** (pick an
  audio file, such as a Voice Memos take saved to Files).

### Film (video): glyph `video`
1. Tap the gold button, then **Film**. The **iPhone's own camera opens straight in video mode**
   (a hand-off, like Snap).
2. Stop, then tap "Use Video". A memory **"New Video" / "added video"** opens, with a 16:9 clip
   (a poster frame, a play button on top, the same bar underneath as audio).
3. **Straight after, the iOS share sheet opens** so you can tap **"Save Video"** and keep a copy in
   Photos (like WhatsApp). One tap. This is not automatic, and the copy says so honestly. It never
   appears for an uploaded clip.
- Inside a memory: **Video ▸ Film** or **Video ▸ Upload**.

### Journal (paper pages, many shots): glyph `book`
Used for handwritten journal pages. It creates a **Raw Memory** (a batch of pages), not a normal
memory. The Mac turns it into memories later.
1. Tap the gold button, then **Journal**. A **full-screen black camera** opens. This one is
   **in the app**, and it **stays open between shots**.
2. Layout from top to bottom (`JournalCaptureScreen.tsx`, `wand.css:2401`):
   - top bar: **`0 pages`** on the left (13px, white 85%), **Done** in gold bold on the right
     (greyed out until there is at least 1 page)
   - a **live viewfinder** filling the screen
   - a **round shutter**: 70px, a 3.5px white ring, a faint white fill, which shrinks a little when
     pressed. Each shot gives a **white flash** (0.22s) and a haptic tap.
   - a **thumbnail strip** below: empty, it says *"Shot pages appear here, live"*. Each page shows as
     a tile with a **×** to remove it. (Drag to reorder is planned but not built.)
3. **Done** closes the camera. The batch shows on Home, waiting for the next sync. Its detail
   screen's ring offers **Add pages** (back into the same batch) and **Delete** (red, asks to confirm).

### Form (a guided talk-through): glyph `form`
An example is the "Daily Review". One question per full screen, answered by **talking once
through the whole thing**.
1. Tap the gold button, then **Form**. With one form it opens straight away. With several, a
   picker appears first.
2. Each screen: a question in large type, optional guidance under it, and an answer area: a text
   box (*"Type — or just say it"*), a **number scale** (*"Tap a number — or just say it"*), or
   tick boxes. At the bottom a peek says **"Next ‹next question› ↑"**. **Swipe up** for the next
   one (snap scrolling, a tiny haptic tap).
3. The top line is information only: **`2 of 5 · Daily Review`**. While recording it also shows a
   red dot with the time and a **28-bar live waveform**.
4. Dock: **Back** · **Record** (mic; it pulses red while live; tap again to pause) · gold menu.
   One recording runs across all the questions.
5. The last screen, **"All done"**, pauses the take and lets you **play it back**: *"Your recording —
   play it back. Want to add more? Swipe up and tap Record."* The ring offers **Photo / Video**
   extras. The Dock becomes one wide **Done**. The footer says *"The desktop fills in your answers
   from the recording once it syncs."*

### Write and Patronus (text)
- **Write**: a blank memory opens with the cursor in the title.
- **Patronus** (inside a memory): drops an "armed spell" block where you type a request. The
  iOS keyboard mic means you can dictate it. **The Mac carries it out on the next sync.** The
  phone never calls AI itself.

## 3. Sync: what it looks like

**Phone.** Sync is a spell in the gold ring. Its glyph is the **lemniscate rune**, a figure-8
drawn as one path: `M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z`.
It is drawn unfinished at rest, so it reads as an "S".
- **Tap** to back up at once. A **ripple ring and a spinning rune** play over the screen.
  **There is no text.** The owner does not want words floating over Home.
- **Hold** to open the Sync window (account, space, conflicts, restore). If not connected:
  *"Connect OneDrive — Back up your memories, and read them on your other devices."*
- Rune colours: grey at rest · gold = changes waiting · **gold and flowing = syncing** · red =
  failed or offline · **green flash = just synced**.

**Mac.** It is just as quiet: the same rune sits as a small 32px button in the header. Click it and a
**352px drawer slides in from the right** (`SyncStatus.tsx`):
- Header rune and title: `All backed up.` / `Ready to back up.` / `Backing up…` / `Catching up…`,
  with a muted line under it: `Last backed up · 2 min ago`.
- **While syncing only**: a small flask that fills as items move, `↓ 3 notes` (arrow muted), and
  the note's title under it.
- One button: **Back up now ⌘S** (or Connect OneDrive / Try again / Reconnect).
- Footer: the account email · **Sign out**.
- **Below it, "Process"**, the transcription queue. It appears only when there is something to
  process. **After every sync, new recordings are transcribed automatically** (Czech is the
  default model). Header: `Process`, a mode toggle `1` / `→` (one item / all), and a blue
  ▶/❚❚ Run button. Each row: order number · label · model badge · % while running · a **thin
  progress line along the bottom** · a red ⚠ that explains an error.
  - Row labels: the memory title for audio, `Journal — 4 pages`, `Form — Daily Review`,
    `Patronus — ‹title›`.
- When done, the memory shows a **timed transcript** where the spoken word lights up as it plays.
  Click a word to jump the audio there.

## 4. Patronus chat on the Mac

- **The orb**, bottom left, 40px in a 44px button: a soft, blurred, **breathing** blue-white core
  with **three thin rings pulsing outward** 1.2s apart (`PatronusOrb.tsx`). It is not a creature
  and not a spinner, just a quiet sign of life. The first time, a label appears:
  *"Patronus — your AI, here to help"*.
- **The window** grows from the same corner: 360×520, rounded, with a border and a shadow. You can
  resize it from the corner. Header: the agent name with a ▾ picker · expand-to-full-screen · ×.
  Escape closes it, but a click outside does not.
- Empty: *"Ask Patronus anything about your notes and memories."*
- Bubbles: **you** on the right in solid blue with white text; **Patronus** on the left in a raised
  grey bubble. Plain text, 14px. A streaming reply shows `…` and then grows.
- **Under a reply: chips for the memories it used** (a bookmark icon and the title). Click one to
  open that memory. **This is the trust moment. Keep it.**
- Composer: *"Ask anything · / for commands"*.
- The demo already has a scripted example (`demo/src/Tour.tsx`):
  - **Q:** "What have I learned about starting things this month?"
  - **A:** "Start smaller than feels serious. This morning's voice memo and your rough-version note
    say the same thing: the basil and the newsletter both began tiny, and that's why they lasted."
  - **Chips:** On starting small · Lesson: ship the rough version · Morning pages — fewer, better things

## 5. Watch out (easy to get wrong in a prototype)

1. **No top toolbars and no floating record buttons on the phone.** Controls sit in the Dock and
   the ring only.
2. **The gold button stays bare.** No sync badge, even when showing "it synced!".
3. **Snap and Film are not in-app cameras.** They hand off to the iPhone camera. Only **Journal**
   has its own black camera screen with a shutter and a strip. Showing an in-app camera for Snap is
   a made-up design.
4. **Voice is a bottom card, not a full screen.** It has Pause and Done, and no discard.
5. **The phone does no AI.** Transcripts, journal pages turned into text, filled-in forms and
   Patronus all happen **on the Mac after sync**. The honest story is "capture on the phone, the
   Mac does the magic".
6. **Sync is quiet.** It is a rune and a ripple, with no "Syncing 3 items…" banner on Home.
7. **Saving a video to Photos takes one tap in the share sheet.** It is not automatic.
8. **Use made-up memories only** (as in `demo/src/data/notes.ts`). Never use the owner's real vault.

## 6. A faithful story order (suggestion only; Merlin decides)
Phone: gold button → ring blooms → Record (bottom card, gold bars) → Done → Snap (camera hand-off)
→ Journal (black camera, 3 pages pop into the strip) → hold Sync, then tap it (ripple and rune).
Mac: the rune turns gold and flows → the drawer shows `↓ 5 notes` → Process rows fill along their
bottom lines → the memory shows the lit-up transcript → the orb → ask → reply with memory chips.
