# WOW-SHOWCASE — update v1

## Goal
One interactive HTML page that makes a stranger *feel* what Pensieve is in under three
minutes. On the left, a phone where you try every way of catching a thought, each with an
animated guide beside it. On the right, a closed MacBook. Click it and everything you caught
pours in: bottles fill, words appear, and then you talk to Patronus about your memories.

The experience script (the scenes, the wow moments, and what every guide says and shows) is
in **`script.md`** in this folder. This file is the build plan.

**Only made-up memories.** Every sample note, recording line, photo, page and chat answer is
invented for the showcase. Nothing is read from the owner's vault, and nothing calls an AI.

## Where it lives
- `showcase/` at the repo root, a sibling of `demo/`. Built the same way: Vite + React +
  the app's own `src/styles/tokens.css` and Tailwind config + `vite-plugin-singlefile`, so the
  output is **one file**, `showcase/pensieve-showcase.html`, that opens from disk.
- Reuse, don't redraw: the phone `Flask` (`phone/src/components/Flask.tsx`), the spell glyphs
  (`phone/src/components/spellmenu/SpellGlyph.tsx`), the spell ring look, and the demo's
  made-up notes (`demo/src/data/notes.ts`) where they fit. New code is only the stage, the two
  device frames, the guide panel, the scripted screens and the sync and chat scenes.
- One file per logical element (CLAUDE.md principle 1):
  `showcase/src/stage/` (layout, scene machine), `showcase/src/phone/` (one screen per mode),
  `showcase/src/guide/` (the panel + step player), `showcase/src/mac/` (lid, sync, chat),
  `showcase/src/data/` (every made-up word, in one place).
- Scripts: `npm run dev:showcase` (PORT, default 3576) and `npm run build:showcase`.

## Phased roadmap
Each phase ends with tests that lock in what it built, then a run of the real page.

### Phase 0 — Script and plan (Merlin) ✅
`script.md`: scene order, wow moments, every mode's guide words and animation.
Test: n/a (writing). Check: every phone spell in `phone/src/lib/spells/registry.ts` is either
in the script or listed as cut with a reason.

### Phase 1 — The stage and the scene machine (Eraser builds, Columbo checks the flow)
- `showcase/` scaffold, the single-file build, the two device frames side by side, the
  shelf of bottles under the phone, the "Click the MacBook" lid.
- A pure scene machine (`stage/sceneMachine.ts`): scenes `arrive → wand → <mode>… → pour →
  ask`. You can jump to any mode, skip ahead to the Mac at any time, and go back.
  Idle for 20 s starts the self-playing tour; any touch hands control back.
- Reduced-motion and sound-off flags are read once and passed down.
- **Tests:** the machine (every scene reachable; Mac reachable from every scene; idle →
  tour → touch → manual; caught modes are remembered). A data guard test: every string in
  `showcase/src/data` comes from that folder only, and the build has no `fetch`, no
  `getUserMedia`, no storage reads (grep the built file).
- Run: `npm run build:showcase`, open the file from disk, click through.

### Phase 2 — Phone capture modes + guide panel (Jony designs, Eraser builds)
- The guide panel and its step player: three steps per mode, the current step lit, a
  ghost finger that plays the steps on the phone when you press **Show me**.
- The mode screens, in script order: Write, Record, Film, Snap, Journal pages,
  iPad + Pencil, Form, Patronus spell, Accio. Each one ends by dropping its bottle onto the
  shelf (the shared "caught" moment).
- **Tests:** for each mode, its guide has exactly 3 steps and the step player advances in
  order; finishing a mode adds exactly one bottle of the right shape; Show me and doing it
  by hand end in the same state; reduced motion still reaches every end state.
- Run: try every mode by hand and with Show me, in light and dark.

### Phase 3 — The MacBook: pour, fill, transcribe (Eraser builds, Jony on motion)
- Click the lid → it opens → a thread of light from phone to Mac → bottles arrive one by
  one, each filling as its words appear (voice and video type themselves in time with the
  audio; journal pages split into dated days; the photo gets its words read out of it).
- Modes the visitor skipped arrive as "from earlier this week", so the ending always works.
- **Tests:** the pour order matches the shelf order; every caught mode gets a transcript;
  skipped modes are filled from the earlier-this-week set; the whole pour finishes in
  ≤ 8 s (≤ 2 s with reduced motion); a second click doesn't pour twice.
- Run: pour with 0, 3 and all modes caught.

### Phase 4 — Ask Patronus (Eraser builds, Columbo checks the words)
- The chat: three suggested questions, typed answers that cite memories by shape
  (mic, page, photo…). Clicking a citation opens that memory with the line lit
  (audio jumps to the timestamp). A free-typed question gets the best-matching scripted
  answer, never a made-up claim about the visitor.
- **Tests:** each suggested question returns its scripted answer; every citation points to
  a memory that exists in the showcase data; free text always picks an answer; the answer
  that ends the tour cites at least four different shapes.
- Run: ask all three, plus two free-typed questions.

### Phase 5 — Polish and ship (all; Columbo does a fresh-eyes walkthrough)
- Accessibility pass: keyboard path through every scene, focus visible, screen-reader
  labels on the devices and the guide, captions for every sound, mute switch.
- Performance: first paint < 1 s from disk; the single file < 3 MB.
- Columbo walks it cold, as a stranger, and writes `walkthrough.md` (where they got stuck).
- **Tests:** a smoke test that loads the built file in jsdom and reaches the last scene
  by scripted clicks; the guard test from Phase 1 runs against the final build.
- Ship: commit `showcase/pensieve-showcase.html`; record screenshots for Shutter if asked.

## Team
- **Merlin** — script, sign-off on each task, the wow moments.
- **Jony** — the look and motion of the stage, guide panel and Mac scenes (inside design.md).
- **Eraser** — builds it, and cuts every step that doesn't need to be there.
- **Columbo** — the stranger's eyes: flow checks after Phases 1 and 4, the cold walkthrough.

## Live status
- [x] Phase 0 — script and plan written (`script.md`, this file).
- [ ] Phase 1 — stage + scene machine
- [ ] Phase 2 — phone modes + guide
- [ ] Phase 3 — MacBook pour
- [ ] Phase 4 — Ask Patronus
- [ ] Phase 5 — polish and ship

## Decisions
- **Live words appear on the Mac, not the phone.** The real phone records; whisper.cpp on
  the Mac writes the words. Showing words appear on the phone would be a lie. Instead the
  phone shows the voice clearly ("Your Mac will write this down"), and the Mac scene gives
  the live transcription moment: words type themselves in time with the voice. This is the
  bigger wow anyway, because it happens where the memories meet.
- **iPad uses Apple's own handwriting.** The Wand runs on iPad. With Apple Pencil, iPadOS
  Scribble turns handwriting in any text field into typed text. The showcase shows that
  and says so. Pensieve doesn't claim it built it.
- **AI only on the Mac.** The phone never shows Patronus answering, only leaving a spell
  for the Mac to cast (as in the real app).
- **No real data, no network, no AI calls.** Everything is scripted.
