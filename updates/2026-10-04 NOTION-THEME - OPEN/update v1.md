# Update v1 — NOTION-THEME (Notion look + customisation)

Status: **BUILDING → verifying.** From owner feedback after using the native app.
Work landed on `main` (follow-up on the already-merged sidebar/editor work).

## Goal
Make Pensieve feel like Notion and more adjustable: Notion colour scheme, typography
and spacing (easier on the eyes), an adjustable reading text size, cleaner chrome
separation, and user-definable categories with editable colours.

## Done
- **Notion palette** (light + dark) in `index.css` tokens: white main, warm-grey
  sidebar (new `--surface-sunken`), subtle borders, Notion-blue accent. `surface-raised`
  inverts per theme so hovers read right on both surfaces. Synthesised from a UX expert.
- **Typography/spacing**: system UI font stack (SF Pro on macOS), 16px/1.5 body, `em`
  headings, tighter Notion rhythm (editor + BlockNote skin).
- **Text Size control** (native macOS Appearance menu → Small/Default/Large/Larger):
  emits `set-font-scale`; `useFontScale` applies `--font-scale`; only editor text
  scales. Persisted.
- **Chrome separation**: grey sidebar + a continuous top hairline across sidebar
  header and main header.
- **Relationships**: dropped the "No links yet" empty text.
- **User-definable categories**: `Category` is now a string; definitions (name+colour)
  live in `<vault>/categories.json` (browser: localStorage), seeded from the old 3.
  Notion-style 9-colour palette (CSS vars, light+dark). `CategoryDropdown` gains add /
  recolour (hover ⋯ swatch grid) / delete / orphan-adopt. Colours show on sidebar row
  dots, dropdown chips, and category group headers — all via one `colorOf` resolver.
  `arrange()` category order = defined-first, in-use-next, Uncategorised last (never
  drops a note). Synthesised from a UX expert.

## Deferred
- Category **rename** (would require rewriting every referencing note's frontmatter;
  recolour + delete ship now, delete degrades notes to a neutral orphan label).

## Verify / close
- `tsc` clean, 75 tests pass, web + native build OK. Visual check pending: Chrome in
  this environment can't load localhost (proxy), so the owner verifies the `.app`.
- Then: merge is already on main; rename folder `- CLOSED`; push when GitHub reachable.
