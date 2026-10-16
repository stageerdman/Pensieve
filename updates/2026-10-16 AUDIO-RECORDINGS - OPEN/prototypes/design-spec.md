# Audio recordings — design contract

> ## ⚑ P2 — LOCKED owner decisions (2026-10-16) — these OVERRIDE anything below
> 1. **Scope:** recording/capture **ships in this update**. Transcription engine stays a
>    stub (the UI trigger exists; whisper lands next). Reader runs on existing sidecars.
> 2. **Capture:** born from the **`/audio`** slash command; the recorder **IS the inline bar**.
> 3. **Uniform height:** EVERY bar state is the same height (56 standard / 44 compact).
>    Recording and broken/missing must NOT be taller — normalize them.
> 4. **Transcript generation is ALWAYS offered** in ⋯: `Create transcript` when none;
>    `Regenerate transcript` (re-run, newer model) when one already exists.
> 5. **Two transcript presentations, both from ⋯:**
>    - `Open transcript — split view` (**default**; transcript-icon click opens this): the
>      resizable right pane (editor left, transcript right). **Collapse must FULLY restore the
>      single centered editor** (max-w column back to center) — not leave an empty split column.
>      Keep it snappy (no lag). Reopen is via the player's own transcript buttons / ⋯ — there is
>      **NO separate "Reopen transcript" button**.
>    - `Open transcript — reader`: **NOT a new view or overlay.** The transcript text expands
>      **inline, directly below the player bar**, growing the block's height **in place** (stay
>      in the note). It is **height-adjustable** (user can drag how much space it takes) and has
>      its **own collapse control** to close it back down. Same `.transcript` body + word-sync;
>      the bar stays put above it.
> 6. **⋯ menu order (final):** Download recording · Open transcript — split view* ·
>    Open transcript — reader* · Create transcript / Regenerate transcript** · —(sep)— ·
>    Replace… · Remove.  *shown only when a transcript exists. **label depends on existence.
> 7. **Split view chrome:** REMOVE the meta chip line (speakers / language / polished) and
>    the "· click a word to jump" hint — they don't exist in our UI. In the split, DROP the
>    transcript toggle button; ADD a dedicated **Collapse split view** button. Make the
>    close/collapse affordance + animation clearly better.
> 8. **Gallery = improved waveform card:** the tile is a **self-contained mini-player** —
>    waveform with **functional controls underneath** (play/pause, scrub, time). NO title /
>    voice-memo-icon label, NO "Now playing" dock indirection. Plays in place. Its transcript
>    opens **only in split view**.
> 9. **Speakers:** keep per-turn distinction by **weight/tone + a quiet gutter**; no summary
>    chips, no second hue.
> 10. **Transcript:** always show **polished**; no raw/polished toggle, no "polished" chip.
> 11. **Home/flask:** the **duration chip** cue (Variant B). When audio is transcribed, its
>     transcript text **contributes to the flask fill** (content volume) — a transcribed voice
>     memo fills its flask like written text. Peek never auto-plays.
> 12. Record/stop stays **accent** (not red). Basin `Space` two-tier owner: deferred (quiet hint).
>
> Supersedes conflicting details in §2 (heights), §3/§8 (chips, hint), §9 (transcript button
> → collapse button), and the gallery guidance. Everything else in this contract stands.



The binding spec for every audio surface in Pensieve. If a surface agent needs a
value not here, it derives from the scales below — it never invents a new hue,
radius, bar height, or shadow. Source of truth in code: `_kit.css` (visual) and
`_audio.js` (behaviour). See `00-overview.html` for the live reference.

> One sentence: **one calm horizontal player bar everywhere audio lives, one
> accent, one shared playback engine, transcript opens a split view on desktop.**

---

## 0 · The design language (the 7 rules)

1. **One bar, everywhere.** The same `.audio-bar` renders inline in a note, inside
   a gallery, in a search hit, on the home flask, and docked atop a transcript.
   Sameness is the family — do not restyle per surface, only toggle `.is-compact`.
2. **One accent, earned.** The magical blue appears in exactly three places on a
   resting bar: the **play fill**, the **played waveform**, and an **active
   transcript icon**. Nothing else is coloured. State (gold/danger) is signal,
   never decoration.
3. **Flat at rest, halo when alive.** No drop-shadow lifts the bar. The only glow
   is the faint accent halo on the *playing* bar and the play button — the
   sanctioned "magical" depth. Menus may use one soft shadow (they're a popover).
4. **Mono time, always.** Every timecode is `--font-mono`, tabular, so digits
   don't jitter as they tick.
5. **Background work is quiet.** Transcribing/saving = a pulsing icon + a calm
   status line. Never a spinner over the content, never a modal, never a block.
6. **Absence is healthy.** "No transcript" is a faint ghost icon, not an error.
   Only a genuinely missing *file* is an error (danger, with Locate…).
7. **Keyboard-first, honest, token-driven, light+dark.** Everything reachable by
   keyboard with visible focus; every colour from a token; both themes always
   correct (real AA).

---

## 1 · Anatomy & dimensions

Order, left → right (flex row, `gap: 12px`, `padding: 8px 12px`):

| # | Element | Class | Size | Token / treatment |
|---|---------|-------|------|-------------------|
| 1 | Play / pause | `.audio-play` | 36×36, radius 6 | `bg: accent`; glyph `surface`; hover → `accent-glow`; active scale 0.94 |
| 2 | Waveform + scrub | `.audio-wave` | flex-fill, 32 tall | canvas; played `accent`, head `accent-glow`, unplayed `text-muted/.35` |
| 3 | Time readout | `.audio-time` | auto | mono 12px; `cur` in `text`, total in `text-muted`, `/` separator |
| 4 | Transcript icon | `.audio-transcript` | 28×28 | ghost; `accent` when present; pulse when transcribing |
| 5 | ⋯ menu | `.audio-iconbtn` | 28×28 | ghost; opens the menu popover |

- **Bar box:** `min-height 56px`, `radius 10` (rounded-lg), `bg surface-sunken`,
  `1px solid border`.
- **Compact (`.is-compact`):** `min-height 44px`, `gap 8`, `padding 6/10`,
  waveform 24 tall, play 28×28 (`.is-sm`). Use in gallery tiles and search hits.
- **Spacing:** everything on the 4px grid. Inline in a note, the bar carries
  `~0.4em` vertical breathing room like a MediaBlock.

**Waveform treatment (exact):** bars `--wave-bar-w: 2px`, gap `--wave-bar-gap: 1px`
(→ 3px pitch), amplitude floor `--wave-min: 0.12` (a silent bar still shows a
tick), rounded caps `r ≤ 1.5`, centered vertically (mirror top/bottom). The
engine resamples the baked 801-peak array to however many bars fit the current
width — never assume 801 on screen. HiDPI: canvas backing store scaled by DPR.

---

## 2 · State machine

| State | Bar | Transcript icon | Status line | Notes |
|-------|-----|-----------------|-------------|-------|
| **idle / ready, no transcript** | flat | `.is-absent` (faint ghost) | none | Default. "Create transcript" lives in ⋯. |
| **playing** | `.is-playing` (accent halo) | unchanged | none | Starting it pauses every other bar on the page. |
| **scrubbing** | `.audio-wave.is-scrubbing` | — | — | Scrubline + time bubble pinned; cursor `grabbing`. |
| **transcribing** | flat | `.is-transcribing` (1.6s pulse, muted) | `Transcribing… N%` (accent dot) | Background, non-blocking. ⋯ item disabled. |
| **transcript ready** | flat | `.is-present` (accent) | none | Icon + ⋯ "Open transcript" → split view. |
| **recording** | flat, acts as live recorder | `.is-absent` | `Recording · m:ss` (accent dot) | Waveform fills as it listens. |
| **saving (just recorded)** | flat, playable | `.is-absent` | `Saving recording…` (**gold** dot) | Bytes writing to disk; gold = the working/sync rune. |
| **broken (missing file)** | `.is-broken` (danger border + 5% wash) | hidden | — | Shows the filename (mono) + a **Locate…** button. Never silent. |

Transitions are style-class swaps only — no layout jump between states.

---

## 3 · Interaction grammar

- **Play button / Space:** toggle play-pause (Space when the bar is focused).
- **Waveform click:** seek to that position. **Drag:** scrub continuously.
  **Hover:** scrubline + time bubble follow the cursor (preview, no seek).
- **← / →** (bar focused): seek ∓5s. **⌘← / ⌘→**: jump to prev/next segment
  boundary (surfaces with a transcript). **↑ / ↓**: volume (optional per surface).
- **Transcript icon:** present → open the transcript (desktop: split view; narrow
  / phone: full overlay). absent → no-op visually; creation is a ⋯ item.
  transcribing → no-op (disabled), the pulse communicates.
- **⋯ menu items, in order:** `Download recording`, then either
  `Create transcript` (absent) / `Transcribing…` (disabled, transcribing) /
  `Open transcript` (present). Surfaces may append `Replace…` / `Remove` **below a
  separator** — matching the image MediaBlock menu. Menu = popover at z-20, one
  soft shadow, `surface-raised`, hover `accent/.12`, active item `color: accent`.
- **Esc** closes the menu / any popover. Outside-click (backdrop) closes it.

---

## 4 · Global playback model

- **One `<audio>` per controller; one controller may be shared** by several bars
  (e.g. the split view's left inline bar + right docked player share ONE
  controller so they move together).
- **One-plays-at-a-time across the whole page:** `_audio.js` keeps a registry;
  calling `.play()` on any controller pauses all others. Agents must obtain their
  controller from `Pensieve.Audio.controller(src)` — never `new Audio()`.
- Time events drive both the waveform progress and (if present) the transcript
  highlight. Seeking emits a `seek` event so transcript highlight re-syncs
  immediately, even while paused.

---

## 5 · Token / colour map (light **and** dark, from tokens)

| Part | Token | Alpha |
|------|-------|-------|
| Bar fill | `surface-sunken` | 1 |
| Bar border (rest) | `border` | 1 |
| Bar border + halo (playing) | `accent` / `accent-glow` | .45 / .12–.35 |
| Play fill | `accent` (hover `accent-glow`) | 1 |
| Play glyph | `surface` | 1 |
| Waveform — played | `accent` | 1 |
| Waveform — playhead bar | `accent-glow` | 1 |
| Waveform — unplayed | `text-muted` | .35 |
| Scrubline / bubble | `accent` / `surface-raised` | .55 / 1 |
| Time — current / total | `text` / `text-muted` | 1 |
| Icon buttons (rest / hover) | `text-muted` / `text` on `accent` .12 | — |
| Transcript present | `accent` | 1 |
| Transcript absent | `text-muted` | .55 |
| Status dot — transcribing | `accent` | 1 |
| Status dot — saving | `gold` | 1 |
| Broken border / wash | `danger` | .45 / .05 |
| Active word | `accent` bg | .22 light / .28 dark |
| Read word | `text-muted` | 1 |
| Active turn wash | `accent` | .05 |

Dark note: the active-word chip flips to `accent` bg with `surface`-coloured text
(no ring) so it stays legible on the Basin. Everything else is the same token at
the same alpha in both themes.

---

## 6 · Motion

| What | Duration | Easing |
|------|----------|--------|
| Hover/press feedback (bg, color, scale) | `--dur-fast` 120ms | `--ease` |
| State/border/halo transition | `--dur` 180ms | `--ease` |
| Scrubline/bubble fade | 120ms | `--ease` |
| Transcribing pulse | 1.6s loop | `--ease` |
| Saving/recording dot pulse | 1.6s loop | `--ease` |
| Word highlight on/off | 120ms linear | — (crisp, keeps pace with speech) |
| Transcript auto-scroll | smooth | native |

`--ease = cubic-bezier(0.22, 0.61, 0.36, 1)`. Nothing bounces; nothing is faster
than 120ms (feels like a glitch) or slower than ~320ms for a discrete change.

---

## 7 · Accessibility

- **Focus:** 2px `accent` outline, 2px offset, on every control (kit default).
- **ARIA:** play button `aria-label` flips Play/Pause; waveform should expose a
  `role="slider"` with `aria-valuemin/max/now` (seconds) and `aria-label="Seek"`;
  ⋯ button `aria-haspopup="menu"` + `aria-expanded`; menu `role="menu"`, items
  `role="menuitem"`; transcript icon `aria-label` reflects state
  ("Open transcript" / "No transcript yet" / "Transcribing…").
- **Keyboard:** full control per §3; menu arrow-key navigable; Esc closes.
- **Transcript words:** each word is a real `<span>`-button (focusable optional);
  the whole transcript is selectable text (copy works). Don't trap selection.
- **Reduced motion:** honor `prefers-reduced-motion` — drop the pulses and
  auto-scroll smoothness (agents add the media query; the kit keeps motion in
  tokens so it's easy to gate).
- **Contrast:** all text/token pairs are AA in both themes; the active-word chip
  is deliberately tuned per theme (see §5).

---

## 8 · Transcript reading experience

- **Docked player (`.transcript-dock`)** sits sticky at the top of the transcript
  column (Spotify-like): a borderless `.audio-bar` + a meta line of chips
  (`N speakers`, language, `polished`/`raw`, "click a word to jump").
- **Body (`.transcript-body`)** scrolls; `padding-bottom: 40vh` so the active line
  can sit centered. `scroll-behavior: smooth`.
- **Speaker grouping:** one `.turn` per segment, a `7rem` right-aligned gutter
  (speaker name + segment start time, mono) and the text. Consecutive segments by
  the same speaker may be visually merged by the agent (optional) but the model is
  per-segment. **Two speakers are distinguished by weight/tone (`spk-0` stronger,
  `spk-1` lighter) — never by a second colour.**
- **Word highlight:** the word whose `[s,e)` contains `currentTime` gets
  `.is-active`; earlier words get `.is-read` (dimmed); the containing turn gets
  `.is-active`. Use `Pensieve.Audio.sync()` — do not re-derive timing.
- **Auto-scroll:** while *playing*, keep the active word centered
  (`scrollIntoView({block:"center"})`). While paused/scrubbing, do **not**
  auto-scroll (let the user read freely).
- **Click-to-seek:** clicking any word seeks to `wordTime(seg,word)+0.001` and the
  highlight jumps there (works paused too).

---

## 9 · Split view (desktop)

- Grid `.split`: `1fr | 6px divider | var(--split-right, 40%)`. Left = note editor,
  right = `.transcript` (dock + body). Right pane has a `border-left`.
- **Divider (`.split-divider`)** is `col-resize`, hairline `border` colour, turns
  `accent/.6` on hover/drag, with a widened invisible grab target. Drag sets
  `--split-right` (clamp **24–70%**). Keyboard: focus the divider, ←/→ nudge 4%.
- **Shared controller:** the left inline bar and the right docked player use the
  **same** controller — one playhead, two faces.
- **Opening:** the transcript icon / ⋯ "Open transcript" opens the split (the note
  slides left, transcript pane in from the right, `--dur-slow`). Closing collapses
  `--split-right` to 0 and removes the pane.
- **Narrow / phone:** below the split threshold, "open transcript" is a **full
  overlay** instead (dock on top, text below) — same `.transcript` component,
  no split. (Owner decision pending — see report.)

---

## 10 · Engine API the agents MUST reuse (`_audio.js`)

`Pensieve.Audio`: `loadAssets()`, `fmt(sec)`, `controller(src)`,
`Waveform(canvas, peaks, opts)`, `bindScrub(waveEl, wave, handlers)`,
`sync(transcript)`, `theme.init/set`, `icon(name)`. Full signatures documented at
the top of `_audio.js`. **Do not** re-implement playback, waveform drawing, time
formatting, or transcript timing — compose these. The `00-overview.html`
`buildBar()` / `buildTranscript()` functions are the reference composition to port.

---

## Open questions for the owner (decide before/while building)

1. **Audio-in-gallery:** is a recording inside a gallery a **compact bar tile** (my
   default — `.is-compact`, plays in place) or a **thumbnail that opens to the full
   bar/transcript**? Mixed image+audio galleries need a consistent tile height.
2. **Transcript open: split vs overlay.** Desktop = split (my default). Confirm the
   split is the *only* desktop presentation, or whether a focused full-screen
   transcript reader is also wanted. Confirm the phone = overlay.
3. **Recording entry point:** does capture start *as* an inline bar in the note
   (my assumption), or via the capture bar / a dedicated recorder that drops a bar
   on stop? Affects the "recording" state owner.
4. **Diarization display:** weight/tone only (my default, honours one-accent), or
   may a speaker also get a faint left rail / avatar initial? I kept it to
   weight/tone to protect the single-accent rule.
5. **Polished vs raw transcript:** the schema carries `polished: true`. Do we
   expose a raw/polished toggle in the dock, or always show polished?
