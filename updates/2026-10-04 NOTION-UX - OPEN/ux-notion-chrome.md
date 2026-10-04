# UX spec — Notion-feel chrome, meta sidebar, editor skin

Synthesised from a UX-expert agent pass, grounded in our tokens (`src/index.css`),
Tailwind map, and existing component idioms. Drives P3 (editor skin) and P5
(chrome + Details sidebar). **Owner overrides noted inline.**

## Decisions adopted
- **Header = right-aligned cluster only.** Remove the "Pensieve" wordmark and the
  inline theme toggle. Height ~44px (`h-11`), `px-3`, `justify-end`. **No header
  border by default** (optionally a scroll-reactive 1px border that fades in once
  content scrolls under it).
- **Two header controls (left→right):** `⋯` overflow menu (`MoreHorizontal`), then
  the right-panel toggle (`PanelRight`, far right — it points at its panel). Both
  are the *same* shared `IconButton`: 32px box, 18px icon, idle `text-text-muted`,
  hover `bg-surface-raised text-text`, open state persistent `bg-surface-raised`
  (**neutral, never accent** — accent is reserved for content/links/focus/
  selection). Gap `gap-0.5`.
- **⋯ menu.** OWNER DECISION: keep the ⋯ menu with **Timeline as its only item for
  now** (explicit extension point for future actions). (The agent argued a
  single-item menu is weak and suggested a direct Timeline button; we override —
  owner wants the menu.) Make it not look broken: shadcn `DropdownMenu`,
  `align=end`, `min-w-[180px]`, `bg-surface-raised`, `border`, `rounded-[8px]`,
  soft functional shadow, item = leading `History` icon · "Timeline" · right-aligned
  `⌘T`. No dividers/placeholder rows.
- **Right "Details" sidebar.** Flex sibling that **pushes** the editor (same
  mechanism as `Sidebar`/`TimelinePanel`), `w-72` (288px, mirrors Timeline),
  `border-l`, `bg-surface`, hidden by default, opened by the `PanelRight` icon.
  Header `px-4 py-3` "Details" + close `IconButton`. Body sections separated by
  whitespace (`space-y-6`), each with the Timeline micro-label style
  (`text-xs uppercase tracking-wide text-text-muted/70`).
  - **Section order: Category → Tags → Relationships.**
  - **Category** (single-select): three stacked selectable rows (not a dropdown,
    not a segmented control — labels are long). Selected = `bg-surface-raised` +
    right accent dot `●`. "Unset" is a valid resting state.
  - **Tags**: `LabelChip`s, wrap, remove-`X` on hover; borderless inline input
    committing on Enter/`,`, placeholder "Add a tag" is the empty state.
  - **Relationships**: list of linked notes (title → opens note; hover `X` to
    unlink); "Link a note" (`Plus`) opens a searchable popover over other notes.
    Empty state: one muted line "No links yet". (Agent flagged this as the heaviest
    surface with no consumer yet — build it last within P5; fine to ship minimal.)
- **Right-dock is one slot. Timeline and Details are mutually exclusive** — opening
  one closes the other; `Esc` closes whichever is open. Both share one shell +
  150ms ease-out slide/fade (gated by `prefers-reduced-motion`).
- **Block editor skin (BlockNote → tokens).** Pass a single `Theme` object using
  `hsl(var(--token))` strings; `.dark` flips the variables, so **one map covers
  both themes** (don't maintain two). Key cuts that make it feel like Pensieve, not
  default BlockNote:
  - Side menu = **drag handle only** (drop the separate `+`; the `/` menu covers
    "add block"). Handle `text-muted` ~55%, fade in on block hover.
  - **Remove the colour pickers** from the selection bubble (one-accent rule) — keep
    Bold/Italic/Code/Link.
  - **Trim the slash menu** to blocks we support (para, H1–H3, bullet/numbered/todo,
    quote, code, divider, image) and **drop the gray description subtext**.
  - Match our type scale (body 1.05rem/1.7, H1 1.9/H2 1.5/H3 1.2rem, mono code),
    minimal inter-block padding; let line-height breathe.
  - Give the editor ~44px left padding so the drag handle sits beside, not over,
    the text column.
- **Keyboard.** Right Details sidebar = **`⌘⇧\`** (mirrors `⌘\` left). `⌘T`
  Timeline and `⌘⇧\` Details each close the other; `Esc` closes either. No shortcut
  to "open the ⋯ menu" (bind actions, not menus). Free `⌘⇧L` when theme moves to
  the native menu (leave unbound). Don't intercept editor-local keys (`/`, ⌘B/I/K)
  at the window level — ignore keydowns whose target is inside the editor.
- **Two-level `⌘A`.** 1st = current block, 2nd = whole doc, further presses stay
  whole-doc (**no cycling**). Empty block → 1st press goes straight to whole-doc.
  Pre-existing multi-block selection → 1st press escalates to whole-doc. Signal the
  non-obvious step with a **one-time** `StatusWhisper`: "Press ⌘A again to select
  the whole note" (3s, once per session). No permanent UI.

## Reuse checklist
- One shared `IconButton` (header controls + all panel close buttons).
- One shared right-dock shell/animation for **both** `TimelinePanel` and new
  `DetailsPanel`.
- One BlockNote `Theme` object (token strings; no second dark map).
- Reuse the Timeline micro-label + accent-dot in Details sections.
- New files (one logical element each): `IconButton.tsx`, `OverflowMenu.tsx`,
  `DetailsPanel.tsx` + `CategorySelect.tsx`, `TagEditor.tsx`, `RelationshipList.tsx`.
  Extend `NoteMeta`/types with `category?`, `tags: string[]`, `links: string[]`.
