# design.md — Pensieve visual standard

Read this before building any screen. The vibe: a calm, fast, distraction-free place for
thinking — closer to a paper notebook than an app, with a quiet undercurrent of magic.
Capture must feel instant; the UI disappears around the words and media. Pairs with
`STRUCTURE.md` / `CODING.md` (how code is organised + written) and `UX.md` (how it behaves).

## The one rule
Every element earns its place. If a control, panel, or step isn't truly needed, it's gone.
Fewest screens, fewest clicks, no chrome for its own sake. (Steve-Jobs strict.)

## Tokens — one source of truth
All tokens are semantic CSS custom properties in **`src/styles/tokens.css`**, light
(`:root`) + dark (`.dark`) from one place, mapped into Tailwind by `tailwind.config.js`.
The phone PWA draws from the same file. **Never hardcode a colour/size/radius — if a value
isn't a token, add it to the token layer.** Changing a token changes the whole app.

### Colour (consumed as `hsl(var(--token) / <alpha>)` → Tailwind `bg-surface`, etc.)
- **Surface:** `surface` (page), `surface-sunken` (sidebar), `surface-raised` (hover/menus/
  code). In light, raised is *darker* than surface; in dark, *lighter* — hovers read right
  in both.
- **Text:** `text`, `text-muted`. **Border:** `border`.
- **Accent (one):** `accent` — the magical blue, lightness held so links/focus stay AA.
  `accent-glow` — ambient halos only (focus/hover), **never text**.
- **State:** `success`, `warn`, `danger`.
- **Magical:** `gold` (sync rune, calendar today-ring/heatmap). The **Basin** deep
  blue-black is the dark-theme `surface` family. Flask colour = a chosen hue riding the
  theme-paired `--flask-s`/`--flask-l`; category chips = the 9-key `--cat-*-bg/fg` palette.
  All of these are tokens — consume them, don't re-derive the hex.

### Type — one deliberate scale (no ad-hoc sizes)
`font-sans` (writing/UI) + `font-mono` (code/timestamps). `--font-scale` multiplies
reading/writing text (native Text Size). Sizes are **only**: `text-2xs` (11px, micro labels/
chips/dates/counts) · `text-xs` (12px, meta) · `text-sm` (14px, secondary/controls) ·
`text-base` (16px, body) · `text-lg`+ (headings). **No arbitrary `text-[Npx]`** — pick the
nearest scale step; if a genuinely new size is needed, add it to the scale here first.

### Radius — one scale
Base `--radius` = 6px; every step derives from it (change the base, rescale all). Use
`rounded-sm` (4) · `rounded`/`rounded-md` (6) · `rounded-lg` (10) · `rounded-xl` (14) ·
`rounded-2xl` (20) · `rounded-full`. No one-off `rounded-[Npx]`.

### Spacing
Tailwind's spacing scale (4px base). Generous whitespace; content-first. No magic-number
margins outside the scale.

### Z-layers (managed, not per-component guesses)
`z-0` content · `z-10` sticky header/raised · `z-20` dropdowns/popovers/menus · `z-30`
overlays & portals (preview, focus backdrop) · `z-40` modal/dialog · `z-50` toast/transient.
Need a new layer? Add it to this table — never invent a bare `z-[9999]`.

## Base components (parents everything composes from)
`Editor` (the TipTap writing surface — the heart; must feel effortless, serializes to `.md`)
· `CaptureBar` · `MediaBlock` · `TranscriptView` · `TimelineItem` · `Flask` (the memory
object) · `LabelChip` · `Button` · `IconButton` · `Panel` · `Toast`. Build from shadcn/ui
primitives + Tailwind; don't hand-roll one-off styles or variants of what a parent provides.

## Interaction principles
- Capture is one gesture: open → type/drop/record → saved locally, no modal maze.
- Background work (transcribing, importing, backing up) reports via quiet, non-blocking
  status — never a blocking spinner.
- Keyboard-first throughout; visible focus; everything reachable without a mouse.
- Honest, specific error states over decoration.
- Full light **and** dark with real contrast (AA+), token-driven — both themes always work.

## What NOT to do
- No dashboards, no settings sprawl, no feature buttons "just in case".
- **More than one accent colour is banned.** Shadows and gradients are **not** decoration —
  they are reserved for the deliberate "magical" language (accent glow/halo, the Basin's
  depth, the flask glass), drawn from the shared effect tokens. Never add a drop-shadow to
  flat UI "to lift it."
- No blocking dialogs for anything that can happen in the background.
- No house styles that diverge from the token set or shadcn primitives.
