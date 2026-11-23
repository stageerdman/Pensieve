# FORMS-IN-SEARCH-AND-FEED — update v1

Feature: f-forms-in-search-and-feed — "Forms Improvement: Search, Feed, Categories".

## Goal
1. **Find forms in Accio.** Typing "Form" (or "fo…", "forms") offers a selectable **Form**
   suggestion; picking it stacks a chip that keeps only form templates.
2. **Forms look a little different** in the feed/gallery (a soft glow or similar) so a form
   template is recognisable at a glance.
3. **A memory made from a form keeps its labels.** Starting a memory from a form (desktop
   "start from form", and a phone walk-through resolved on the desktop) carries the form's
   **categories and tags** onto the new memory.

Must not hurt the fast relevance ranking just shipped (FAST-RELEVANT-SEARCH): the Form
suggestion never consumes the typed text, so the word "form" still ranks as free text.

## Impact research
- "Duplicating a form" = making a memory from a form template. Two paths do it:
  `useNotes.startFromForm` (desktop) and `memoryFromPackage` (a phone form package resolved by
  the desktop Process queue, `useProcessQueue.runPackageItem`). Both drop the template's
  categories/tags today. The phone never writes the final memory, so the phone needs no change.
- A form template is just frontmatter `form: true` in `NoteMeta.extra` (lib/forms/meta.ts) —
  already in the fast list, so a Form filter needs no body read and no index change.
- Search suggestions: `lib/search/grammar.ts`. Claims (dates, flags, exact categories) remove
  text from the live query; **completions do not** — the Form suggestion is a completion so
  the ranked text query is unchanged.

## P1 — A memory from a form inherits its categories and tags (backend)
- `lib/forms/inherit.ts`: `inheritLabels(note, template)` — pure; returns the note with the
  union of its own and the template's categories and tags (order kept, case-insensitive tag
  de-dupe). Shared by both paths.
- `useNotes.startFromForm` and `useProcessQueue.runPackageItem` apply it.
- Tests: union + de-dupe + order; a template with no labels leaves the note alone; the package
  path keeps `fromForm` and gains the template's labels.

## P2 — Form filter in search (backend)
- `Filter` gains `{ kind: "form" }`; `SearchableNote.form` from `isFormTemplate(extra)`;
  `matchFilter`, `filterLabel` ("Form") handle it.
- `grammar.completionsFor`: the word "form"/"forms" (`isFormWord`, any case — not a shorter
  prefix, see P4) offers a `hint: "type"` suggestion labelled "Form", with a source span
  (confirm splices just that word out), never a claim.
- Tests: "form", "Forms", "daily form" offer it; "fo", "for", "food" do not; it does not change `parse.text`;
  `runSearch` with the chip keeps only templates; chip + text still ranks; the ranking suite
  and benchmark stay green.

## P3 — UI (Jony)
- The Form suggestion row and Form chip in Summon (hint `"type"`), and the FilterEditPopover
  line for it.
- Forms glow (or similar) in the gallery/feed cards — `isFormTemplate(note.extra)`.
- Tests: Summon shows the Form row for "form" and filters to forms; a form card carries its
  form treatment.

## P4 — Verify + ship
`npm test`, `npx tsc --noEmit`, `npm run bench`; real-vault check (type "form", pick it, see
only forms; start a memory from a categorised form and see the categories). Rebuild the Mac
app (`npm run tauri:build`); `deploy:phone` only if `phone/` changed.

## Adjustable form look (added by the owner mid-update)
A form should look like a flask / have its own colour, adjustable per form. **No new data is
needed:** every memory already stores a flask icon (frontmatter `icon`: shape + colour +
vibrancy + shine) and the FlaskPicker edits it. `lib/forms/look.ts` → `resolveIcon(icon, form)`
returns the icon to draw, where a form with no chosen icon gets `FORM_DEFAULT_ICON` (purple;
its shape is never drawn, since forms always draw as the form flask) instead of the gray vial. Jony builds the glow/look on top (P3).

## API for the UI (P3)
- `resolveIcon(icon, form)` (replaced `formLook` in P3) / `FORM_DEFAULT_ICON` / `isFormTemplate(extra)` — from `lib/forms`.
- Summon: suggestions with `filter.kind === "form"` (`hint: "type"`, label "Form") appear in
  `useSummon().suggestions` for "form"/"forms"; `confirm(s)` stacks the chip;
  `addFilter({ kind: "form" })` adds it directly; `filterLabel` gives "Form".
- `FilterEditPopover` has no body for the form chip yet (one line, like the flag chip).

## Live status
- [x] Roadmap
- [x] P1 labels inherited (`inherit.test.ts`, `desktop.test.ts`)
- [x] P2 Form filter in search (`grammar.test.ts`, `search.test.ts`; ranking suite green).
  Note: `npm run bench` misses its 30 ms budget on random queries on this (busy) machine —
  the untouched base commit misses it too; the no-chip search path is unchanged. Four sync
  media / phone Reel tests time out on the base commit as well (pre-existing).
- [x] P3 UI (Jony). Spec: `design/form-look.md`. Forms draw as a reserved measuring flask
  (with graduation ticks) in their own colour, purple by default, on Mac (gallery card,
  search row, header, tabs, working set, links, @-mention menu) and phone (reel card, Accio
  row). On a form, the flask picker drops Shape and keeps Colour, Vibrancy and Shine. No
  extra glow ring, because gold already means starred. Summon's Form row shows the form
  flask, and the chip popover reads "Only forms". Phone: typing form/forms shows a
  **Form** chip that turns the word into a `form:` filter (`accioQuery.formSuggestion`,
  `passesForm`). Tests: Flask, FlaskPicker, Summon, phone flaskSvg/accioQuery/accioRank.
- [x] Real-user walk-through (Columbo, `user-test.md`). Fixed from it:
  - The phone's 14-day window never forgets a form (`window.planForget` skips `form`;
    `vaultStore.listNoteMeta` marks it). Tests: `window.test.ts`, `vaultStore.test.ts`.
  - The Form chip is offered only for "form"/"forms", never "fo"/"for" — one shared rule,
    `isFormWord` in `lib/forms/meta`, used by the desktop grammar and the phone.
  - Not done: backfilling labels on the 3 old CANI entries (16–18 Nov) — waits for the
    owner's OK. "Start from" buttons still show the generic icon (small note, open).
- [x] P4 verify + ship — 1,700 tests and both typechecks pass; Mac rebuilt and installed,
  phone deployed, checked on the real vault (`deploy.md`).
