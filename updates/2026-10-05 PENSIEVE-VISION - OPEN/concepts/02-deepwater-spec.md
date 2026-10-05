# BUILD SPEC — Deepwater: the Still Basin

*A Pensieve vision concept. One self-contained offline HTML file: CSS + inline SVG + `<canvas>`, no external assets. This is a vision mockup — the interaction model is real and sound, but it is not shipping code.*

---

## 1. Concept

**Name:** Deepwater — the Still Basin
**One-liner:** The Basin stops swirling and deepens. You gaze down through the clear fathoms of your own life — each era a tinted stratum of still water, every memory a sealed glass flask you recognise by the photo (or waveform, or two-word title) glowing cleanly inside it. Not a drifting dot. Not a line of text.

**What we keep (the loved soul):** the dark stone chamber, the glowing silver basin and rim, drifting memory-mist and ambient dust, "pour a thought in," the immersive "dive," the coach's whisper. **The single change: the mist moves so the memories can hold still.**

### The locked north star — stated explicitly, once

The old engine said *"near / bright = matters now."* In Deepwater we split that cleanly onto non-colliding channels and **commit to this openly** (do not ship both readings silently):

- **DEPTH = WHEN.** Vertical position is era/time. Surface = now, deep = years past. Stable forever.
- **SIZE + HALO = HOW MUCH IT MATTERS NOW.** Importance is big-and-bright, never position, never dimness.
- **PINNED = pulled to the working surface.** The thing you're working on literally floats to a ring at the very top. This is where "near = matters now" still lives — for the working set only.

So an old-but-important memory reads honestly as *"deep in the amber water, but large with a bright halo"* — and **Stir** raises it as a bubble. No channel fights another.

---

## 2. Layout — what is on screen, where

```
┌───────────────────────────────────────────────────────────────┐
│  THE PENSIEVE                                   ⌘K  Summon…     │  ← title + summon entry
│  ╭─ WORKING SURFACE ─────────────────────────────────────────╮ │  ← pinned ring (always visible)
│  │  ◍  ◍  ◍    (pinned flasks, real thumbnails, bob-free)     │ │
│  ╰──────────────────────────────────────────────────────────╯ │
│ ┌──────────┐ ╔══════════ THE POOL (stacked era strata) ══════╗ │
│ │ ERA SPINE│ ║  ~~~~~~~~~ tideline ~~~~~~~~~~~~~~~~~~~~~~~~~~  ║ │  surface·now
│ │ (left    │ ║  Building Pensieve   ◍  ●  ◍   ◍  ●           ║ │  (cool silver-blue)
│ │  stone   │ ║  ~~~~~~~~~ tideline ~~~~~~~~~~~~~~~~~~~~~~~~~~  ║ │
│ │  bank)   │ ║  The hard winter     ●  ◍                     ║ │  (slate)
│ │          │ ║  ~~~~~~~~~ tideline ~~~~~~~~~~~~~~~~~~~~~~~~~~  ║ │
│ │ name     │ ║  The Berlin year     ◍  ●                     ║ │  (warm sepia)
│ │ dates    │ ║  ~~~~~~~~~ tideline ~~~~~~~~~~~~~~~~~~~~~~~~~~  ║ │
│ │ ▁▃▂ spark│ ║  Before everything   ●  ◍                     ║ │  (amber-dark)  depth
│ │ ◍ hero   │ ╚═══════════════════════════════════════════════╝ │
│ │ 7/23 seen│                                         ┊ depth    │  ← depth gauge (right)
│ └──────────┘                                         ┊ gauge    │
│  ╭─ pour-well ───────────────────────────────────────────────╮ │  ← compose / "pour a thought"
│  │  Draw a thought to the surface…               [ Pour in ]  │ │
│  ╰──────────────────────────────────────────────────────────╯ │
└───────────────────────────────────────────────────────────────┘
  ◍ = sealed/unseen (bright seal pip)   ● = drawn/seen (pip gone, cork at foot)
```

- **Chamber:** the Basin's existing dark stone background, radial chamber-glow, ambient dust `<canvas>`, inner vignette — unchanged.
- **The Pool** fills the centre as a single vertical column of stacked, tinted, named era bands. One continuous surface — descending never changes "screen."
- **Era spine** (left stone bank): per band — carved serif era name, date range, a tiny activity sparkline, the era's single most-important flask as a **hero thumbnail**, and an **opened-count** (`7 / 23`). A band collapsed to a thin strip is still recognisable by tint + name + hero.
- **Working surface ring** (top): holds pinned flasks as real thumbnails. Always on screen. This is "what am I working on" in one glance — no Summon, no charm-hunting.
- **Depth gauge** (right, from the Basin): `surface · today → depths · years past`. Hidden below 620px width.
- **Pour-well** (bottom): the live compose field, the loved pour ritual.
- **Summon** entry top-right / `⌘K`.

---

## 3. The flask — one silhouette, five non-colliding channels

**One** elegant rounded apothecary-flask silhouette throughout (cork + neck + rounded body). Media is **never** signalled by changing the shape. Read in priority order:

### 3.1 TOPIC = liquid colour + neck ring + cork rune (three redundant carriers)
Locked low-saturation Surface palette (≤5 hues, the colour that pops is each memory's own photo, per `design.md`):

| Topic | Hue | Rune (cork) |
|---|---|---|
| Reflections | `#8fb6ff` silver-blue | `✶` |
| Ideas | `#8fe6c6` teal | `✦` |
| People | `#e6a6ff` violet | `❧` |
| Lessons | `#ff9fb0` rose | `❉` |
| Goals | `#ffcf8f` amber | `◆` |

- **Primary:** the memory-liquid inside the glass is the topic hue.
- **Redundant, patina-proof, colour-blind-safe:** a crisp **2px neck ring** painted in the topic hue at **screen-constant saturation** — never filtered through era tint — plus the **topic rune etched on the cork**. So topic survives at small sizes, in deep/old bands, and for deuteranopia.
- Colour is a **broad pre-attentive field only** (sort the 5 topics at a glance). It is explicitly **not** how you retrieve a fine tag like `#Sales Training` — that is Summon's job (§6). The UI never implies you can scan by colour for a fine tag.

### 3.2 MEDIA + CONTENT = what is suspended in the glass (type-adaptive hero — **MUST-FIX**)
One content slot. **Rule: an image always wins the slot** (the owner navigates by images); any other media drops to a shoulder glyph.

| Memory type | Hero in the glass | Shoulder glyph |
|---|---|---|
| Photo / note-with-image | the **actual thumbnail**, rendered **flat, full-contrast, clean** (see §3.6) | `▦` photo |
| Video | the frame thumbnail + a filmstrip-sprocket edge + a soft play-glint | `▷` film |
| Audio (no image) | a frozen **silver waveform ribbon** + duration | `∿` wave |
| Audio **with** a linked image | the **image** (image wins) | `∿` wave on the shoulder |
| **Plain note (most common)** | a **short 2–4 word AI title, etched FLAT and horizontal across the flask belly at readable size** — the hero cue — optionally over a faint deterministic "ink-bloom" sigil (a stable shape hashed from the note, recognised like a wax seal) | `❘` strand |

**This is the headline fix for "text-only doesn't help."** For the owner's most common type (plain notes) the hero is a flat, legible 2–4 word title — never tiny curved refracted text, never demoted to a foot cartouche "read last." The glyph layer guarantees media certainty at small sizes and for accessibility.

### 3.3 ERA = vertical band + water tint ONLY (never the glass)
- Era is the **dominant can't-miss axis** and the Basin's own deepened gauge.
- The pool is a vertical column of deep time. Band tint ramp (applied **only to the water overlay behind flasks**, low saturation, luminous tideline between):

| Band | Water tint overlay |
|---|---|
| Surface · now | `rgba(143,182,255,.08)` cool silver-blue |
| mid | `rgba(100,116,139,.09)` slate |
| older | `rgba(150,130,90,.10)` sepia |
| deep · years past | `rgba(120,95,55,.12)` amber-dark |

- Tideline: 1px luminous line, `#bfe3ff` at ~.22 alpha.
- **CRITICAL (MUST-FIX):** age lives **entirely in the water tint + position.** There is **no glass patina, no clouding, no sediment.** The suspended photo/title must render clean at every age — it is the #1 cue and nothing may veil it. (If an age-whisper on the object is ever wanted, darken only the cork/wax — never anything crossing the content.)
- **Eras are auto-derived, never hardcoded:** the time+importance engine clusters contiguous logging stretches; labels default to **neutral data strings** (`"Spring 2026 · Pensieve"` = date range + dominant tag). AI-poetic names (`"The hard winter"`) are an **opt-in flourish**, so a bad cluster is never silently load-bearing. Owner can rename, merge, or drag a tideline to re-cut; kept out of sight until he distrusts a boundary.

### 3.4 IMPORTANCE = size + halo ONLY (**MUST-FIX: collapsed**)
- **Size:** flask base width scales with the importance score. Expanded view ≈ 40px (quiet) → 96px (matters-now); scaled down proportionally at life zoom.
- **Halo:** a radial glow behind the flask in the topic hue; opacity and radius scale with importance.
- **DROPPED entirely:** "forward-float," liquid fill-level (all flasks brim equally), and "dim = quiet." Quiet memories are **small, not dark** — this frees brightness so it never means three things.
- Importance score = the locked transparent blend: `pin + revisit-frequency + highlights + links + (future) AI`. Hover / dive shows the why-trace (`"pinned · revisited 11× · 3 links"`).
- **Pinned** → tethered to the **Working Surface ring** at the very top + a small silver pin-charm on the neck.
- **Live-vs-fixed resolution (MUST):** opening a flask records a revisit (importance ↑) but **layout and size are frozen within a session.** They recompute only at session start or on an explicit **"Re-settle"** gesture, each change shown as a single-flask travel animation. A quiet nudge appears: *"3 flasks shifted in importance — re-settle?"* Opening a flask therefore never moves or resizes it under your eye.

### 3.5 SEEN / UNSEEN = a scale-constant static wax seal pip (**MUST-FIX: off the brightness axis**)
The owner's #1 pain. Given its own dedicated, pre-attentive, position-independent channel:

- **UNSEEN = SEALED:** a **wax seal pip** on the shoulder, rendered at **constant screen size (~6–7px) regardless of flask zoom** — like a notification dot. Visible on a 10px flask at life zoom. Warm core `#eaf4ff` with a topic-tinted ring. **Static — no steam.**
- **SEEN = DRAWN:** pip **absent**; the cork is drawn to the flask's foot; a faint silver high-water etch line at the old waterline. That is all. No dimming.
- Presence/absence of a fixed-size pip is fully independent of fill, size, halo, topic colour and era tint — so it survives 1000 flasks and the next-day return.
- **No per-flask steam. No breathing bob.** The *only* ambient motion is the global mist + dust canvas behind the still memories.
- Backed by **fixed, never-reshuffling positions** (§4), **dim-in-place filtering**, **dive-and-return to the exact same spot**, a **last-viewed bookmark bubble**, per-era **opened-count** (`7 / 23`, scale-robust on the spine), an **"unseen only"** sweep, and a **step-through** that rings the nearest sealed flask with an `N of M seen` counter. **State persists across lenses and sessions.**

### 3.6 Protecting the thumbnail from the glass
The suspended photo is the hero and must never be veiled: render it as a **clean flat full-contrast inset**; put glass sheen/highlight **only on the rim/neck**, never across the image; apply nothing age-related over the content region.

---

## 4. Position model — stable, two time axes, never reshuffles

- **Vertical (coarse) = era band.** Surface→deep.
- **Horizontal (and fine vertical) within a band = time, oldest-left → newest-right.** This is stable (time never changes), protects seen-tracking and spatial memory, **and** gives a sub-era temporal axis for free.
- **Importance never reorders anything** — it only sets size + halo.
- Flasks **never drift and never reshuffle.** The only positional motion is intentional and informative: pour descent, dive rise, surface return, stir bubble, lens brighten/ghost crossfade, step-through ring, and (on explicit Re-settle only) single-flask travel when an era/topic is reclassified.

---

## 5. Overview → focus → dive flow

### Life view (default, fit-to-height) — an honest era + density MAP
- Every era stacked, tinted, named; every flask present (quiet/old ones genuinely there, small). Busy eras taller; quiet ones compress to a thin strip (hero + density + count).
- At life zoom, distant flasks render as **flat colour-glints carrying their constant-size seal pip** (a density + topic + unseen map — honestly labelled as such in a one-time teaching moment: *"This is the shape of your life. Descend or Summon to recognise a single memory."*).
- **But the matters-now set is never dots:** the few large/near-surface flasks and all pinned flasks **hydrate as real thumbnails immediately** on open, so you always land on recognisable content, never a pure field of dots.

### Focus (one continuous altitude descent — never a screen change)
- **Scroll / pinch to descend:** flasks grow; faces hydrate progressively — colour-glint → thumbnail / waveform / flat title → neck ring + shoulder glyph. Your place in depth is kept.
- **Default working zoom = one era band** filling the view with ~20–60 legible faces (this is the real recognition surface).
- **Click an era's carved label** → that stratum expands to fill the basin; its flasks laid left→right by time with **month / season ticks carved on the stone bank — the TIME RULER** (so "month 4 of the hard year" is reachable positionally). Up / Esc rises back.
- **Over-dense recent era:** past ~40 flasks in a band, auto-insert faint **month sub-tidelines** so the era axis stays useful where most memories live.

### Dive (the loved ritual, untouched)
- **Click a flask** → it rises to you, the cork draws with a breath of mist, you dive into the immersive memory: original media + transcript + the coach's whisper.
- **Rise / Esc** → you land on the **exact same spot**; the flask is now drawn (seal pip gone, cork at foot); the era's opened-count ticks; a bookmark bubble rests where you were. Importance bump recorded, applied on next Re-settle.

---

## 6. Summon — smart search (`⌘K` or just start typing)

Understands **natural language + #tags + time ranges + flags + media + combinations**, ANDed together.

**Parse model (tokenise, classify, AND):**
- `#tag` tokens → tag filter (`#Sales`, `#founding`).
- **Time-phrase** tokens (dictionary + regex): `today`, `yesterday`, `this week`, `last week`, `last month`, `last spring`, `2025`, and **era names** ("the build", "Berlin") → date-range / era filter.
- **Flag** tokens: `pinned`, `important`, `unseen`.
- **Media** tokens: `photos`, `video`, `audio`, `handwriting`.
- Remaining words → full-text over **title + AI-title + snippet + transcript + tags**.

Examples that must work: `whiteboard` · `#Ideas founding` · `photos last spring` · `#Sales Training last week` · `pinned` · `unseen Berlin`.

**Result behaviour (no reflow — the map is never lost):**
- Matches **brighten and lift slightly in place**; non-matches **ghost to faint position-holding outlines**. A count appears (`3`). Lenses **stack**. Clearing restores the pool exactly.
- Because positions hold, the **shape of a result is itself recognisable**.
- **Gather affordance:** one key (`G`) collapses the current matches into a tidy, reviewable **column on the stone bank** for stepping through a set — reconciling the loved shelf comfort with the no-reflow map. A weekly/topic review becomes a clean sweep, not a pinball. Esc returns them to their water positions.
- Seen/unseen state shows inside the lens exactly as in the pool (a flask opened under a `#Sales` lens is visibly drawn when later met down in its era).

---

## 7. All interactions

| Trigger | Result |
|---|---|
| **Open the app** | Life view: stacked tinted named era strata, surface=now → deep past. Matters-now + pinned flasks hydrated as real thumbnails; quiet/old ones are colour-glints with constant-size seal pips. Mist + dust drift behind dead-still flasks. |
| **Scroll / pinch (altitude)** | One continuous descent; flasks grow, faces hydrate progressively; depth position kept. |
| **Click an era label** | That stratum expands to fill the basin, flasks laid on a left→right time ruler (month/season ticks on the bank). Up/Esc rises back. |
| **`⌘K` / start typing** | Smart Summon (§6): brighten-in-place + ghost non-matches, count, stacking lenses; `G` gathers to a bank column. |
| **Click a flask** | Rises to you, cork draws with a wisp of mist, dive into the full memory (media + transcript + coach whisper). |
| **Rise out (Esc / "rise")** | Land on the exact same spot; flask now drawn (pip gone); opened-count ticks; bookmark bubble marks where you were. |
| **Toggle "unseen only"** | Drawn flasks dim to faint outlines in place; only sealed ones remain. Step-through rings the nearest sealed flask; `N of M seen` counter. |
| **Pour a thought** | A silver strand spirals down and condenses into a new **sealed, brimming** flask at the surface of the current era — auto-labelled + auto-coloured by topic; a permanent home, never a drifting dot. |
| **Stir** | A high-standing but long-unopened flask rises as a bubble climbing up through the strata to the surface, with a soft ripple and a one-line reason (*"important — pinned, revisited 11×, not seen since the Berlin year"*). |
| **Re-settle** | Recomputes importance sizes/halos; each change animates as a single-flask travel. Triggered manually or at session start; quiet nudge shows the count waiting. |
| **Rename / re-cut an era** | Carved label takes the owner's name, or a dragged tideline moves the boundary; grouping stays data-driven. A reclassified memory animates travelling to its new stratum, never silently relocates. |

---

## 8. Sample memories (11, spanning media types + eras)

Each row carries everything the mockup needs. `seen` = drawn (pip off); `unseen` = sealed (pip on). Plain notes list an **aiTitle** (the flat hero). Importance signals: `pin / revisits / links / ai(0–1)`.

**Era D — "Building Pensieve"** · this season · surface band (cool silver-blue, densest)

1. **Whiteboard from the founding sprint** — *Ideas (teal)* — **photo** (whiteboard image is the hero) · note+image — 6 weeks ago — `pin ✓ · rev 7 · links 3 · ai .9` — **UNSEEN** · *the find-flow target.*
2. **What I actually want this year** — *Goals (amber)* — **plain note**, aiTitle **"Fewer, deeper"** — 3 days ago — `pin ✓ · rev 11 · links 5 · ai .95` — **SEEN** · pinned → on the working surface.
3. **A quieter capture flow** — *Ideas (teal)* — **plain note**, aiTitle **"Remove the page"** — yesterday — `rev 4 · links 3 · ai .7` — **UNSEEN**.
4. **Screen-recording of the pour animation** — *Ideas (teal)* — **video** (frame + filmstrip edge) — 5 days ago — `rev 2 · links 1 · ai .6` — **UNSEEN**.
5. **The harbour at first light** — *Reflections (silver-blue)* — **photo** — today — `rev 1 · links 0 · ai .5` — **SEEN**.

**Era C — "The hard winter"** · early this year · upper-mid (slate)

6. **When I almost quit** — *Lessons (rose)* — **plain note**, aiTitle **"One more week"** — early this year — `rev 12 · links 4 · ai .9` — **SEEN** · his most-returned memory (large, bright halo though deep-ish).
7. **The coin-flip week** — *Reflections (silver-blue)* — **audio** voice note **with a linked photo of the coin → image wins the slot**, `∿` on the shoulder — early this year — `rev 5 · links 1 · ai .7` — **UNSEEN** · demonstrates the mixed-media rule.

**Era B — "The Berlin year"** · a few years ago · mid (sepia)

8. **Grandfather's workshop** — *People (violet)* — **photo** (old workshop photo, renders clean despite sepia band) — Berlin year — `rev 5 · links 3 · ai .65` — **SEEN**.
9. **The argument I didn't need to win** — *Lessons (rose)* — **plain note**, aiTitle **"Being right is cheap"** — Berlin year — `rev 4 · links 2 · ai .6` — **UNSEEN**.

**Era A — "Before everything"** · years past · deep (amber-dark)

10. **The promise by the lake** — *People (violet)* — **photo** (lake) — years past — `rev 3 · links 2 · ai .45` — **SEEN**.
11. **An old journal page** — *Reflections (silver-blue)* — **handwriting scan** (image hero, has transcript) — years past — `rev 2 · links 1 · ai .4` — **UNSEEN**.

Coverage: 5 photo/image (incl. handwriting scan + a mixed audio-with-image), 1 video, 1 pure audio, 3 plain notes; 4 eras; 6 seen / 5 unseen; a range of importance incl. deep-but-important (#6) and pinned-working-surface (#2).

---

## 9. How it fixes the three complaints

- **"Moving dots don't help" →** Flasks are **dead still**, anchored by era (vertical) and time (horizontal), stable forever. Importance is **size + halo, not motion**. The only ambient motion is the global mist + dust *behind* the memories; the only positional motion is intentional and meaningful (pour, dive-rise, surface-return, stir bubble, lens crossfade, step-through ring, explicit Re-settle). **No per-flask steam, no bob.** You read the pool as structure, never chaos.
- **"Recognition by text only doesn't help" →** Object recognition. The hero is the **real thing in the glass**: the actual photo (clean, un-refracted, un-veiled) for his image-heavy notes, a waveform for audio, a filmstrip for video — and for the majority case, **plain notes, a flat legible 2–4 word AI title across the belly** (never tiny curved text, never demoted). Backed by topic colour + neck ring + cork rune, with a shoulder glyph for media certainty. The full title is read last, in the dive, as confirmation.
- **"I lose track of what I've checked" →** A dedicated, **scale-constant, static wax seal pip** — present = unseen, absent = seen — fully independent of brightness/size/colour/era and legible at any zoom. Plus fixed never-reshuffling positions, dim-in-place filtering, dive-and-return to the exact spot, a bookmark bubble, per-era `opened N / M` counts, an "unseen only" sweep, and a step-through that rings the next sealed flask. State persists across lenses and sessions. The basin always visibly shows what remains to see, and you cannot lose your place.

---

## 10. Visual tokens & motion budget

```
--ink        #05070b   --ink-2 #090d14   --stone #0c111a   --stone-hi #1a202b
--silver     #d8e6f2   --silver-soft #9fb4c7   --silver-dim #64748b
--glow       #bfe3ff   --glow-warm #eaf4ff
Topic:  Reflections #8fb6ff · Ideas #8fe6c6 · People #e6a6ff · Lessons #ff9fb0 · Goals #ffcf8f
Water bands: #8fb6ff.08 → #64748b.09 → #96825a.10 → #785f37.12   (overlay only, never glass)
Seal pip: core #eaf4ff, ring = topic hue; constant 6–7px screen size
Type: Iowan Old Style / Palatino serif → chamber title + carved era names;
      system sans → memory content, AI titles, counts, why-traces, chrome.
```

**Motion is spent only on meaning:** pour spiral, dive rise, surface return, stir bubble climbing the strata, lens brighten/ghost crossfade, step-through ring, Re-settle single-flask travel. Everything else (flasks) is still. `prefers-reduced-motion` stills the mist/dust canvas too; all state cues (seal pip, drawn cork, counts) are static and survive reduced-motion unchanged.

---

## 11. Performance bar ("extremely lightweight and fast" is a hard constraint)

- Target: **60fps at N≈500** flasks on the owner's machine.
- Life zoom renders **flat colour-glints + seal pips only**; hydrate cached low-res thumbnail **sprites only for the visible band** at mid/close altitude.
- **Virtualise** off-screen / distant flasks; render deep/off-screen bands static.
- **Pause** the mist + dust `<canvas>` when the tab is idle and under `prefers-reduced-motion`.
- Keep topic colour, seal pip, neck ring, and shoulder glyph as cheap CSS/SVG primitives so the per-flask cost at the overview is near-zero.