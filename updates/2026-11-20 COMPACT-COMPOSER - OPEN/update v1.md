# COMPACT-COMPOSER — a calm, one-field chat input with slash commands

## Goal
On small Patronus windows (the popover is 300–360px wide), the big **Send** button and
the **Web** pill squeeze the text field, so a long message wraps into a tall box. Make
the composer one full-width field:
- **No Send button.** Enter sends, Shift+Enter adds a new line.
- **Web search shows as a tiny globe inside the field**, only while it is on.
- **Slash commands replace the globe/toggle picker.** Typing `/` at the start opens a
  small menu (`/web` today). New tools from the Rust registry become new commands with
  no new UI code.

Desktop-only (Patronus). The phone (Wand) is not touched. The design is in
`composer-spec.md`, and `mockup.html` shows every state at 300px width.

## Today (what this changes)
- `Composer.tsx`: `[textarea] [ToolPicker] [Send]` in one row. The textarea is
  `disabled` while a reply streams.
- `ToolPicker.tsx`: a globe button opens "Tools for this chat" with switches. When on,
  it becomes an accent "Web ×" pill (about 70px).
- The Rust prompt (`ai_tools/registry.rs` `off_note`) and `assistant/mod.rs`
  `EMPTY_REPLY` tell the owner to "switch on Web search next to Send". That control
  will no longer exist.
- `ownerWalk.test.tsx` and `ToolPicker.test.tsx` test the old row.

## Decisions
- **Send button: deleted, with no icon in its place.** Patronus runs on the desktop
  only, and the app is built to be keyboard-first (design.md). Enter is what everyone
  already expects in a chat. The placeholder teaches the one thing you can't guess
  (`/`). *Assumption:* the owner never reaches for a mouse to send. *Check:* ask after
  a week. If wrong, add a 24px arrow icon inside the field, trailing (spec §6).
- **Web state: a 24×24 accent globe inside the field, trailing edge, only when on.**
  "Off" shows nothing, because off is the default and the safe state. Clicking the
  globe turns web off. It costs 28px of text width only while web is on, compared
  with about 140px today (pill plus Send).
- **Slash commands: only at the very start of the field.** So "and/or" or a pasted URL
  never opens the menu. If nothing matches, the menu hides and Enter sends the text as
  a normal message.
- **One command per tool, and it toggles.** The fastest path is `/w` then Enter. The
  row says exactly what Enter will do ("Turn on web search"). `/web on` and
  `/web off` also work, for people who type the whole thing.
- **Commands come from the tool registry** (`listAssistantTools`). Non-tool commands
  (for example `/new`) can join the same list later. None are added now, because no
  user goal asks for them.
- **The field stays editable while a reply streams.** Enter waits until the reply is
  done (the text is kept). Commands still work, and apply from the next message on,
  as the picker did.
- **Reused, not rebuilt:** the editor's `slashNav` reducer (keys) and the
  `.pensieve-slashmenu` skin (look). `useDismiss` is not needed, because the menu
  closes when the text stops matching.
- **Unchanged:** the per-chat `tools` state in `useAssistant`, the
  "Searching / Searched the web" activity, and the "Search the web" link on the
  latest reply.

## Architecture
```
ChatPane
 └─ Composer (one field, owns text + caret)
     ├─ composerCommands.ts   pure: buildCommands(tools, enabled) · matchCommands(text)
     ├─ CommandMenu.tsx       listbox above the field; keys via editor/slashNav.ts
     └─ WebIndicator.tsx      in-field globe (renders null when web is off)
```
`ToolPicker.tsx` and its test are deleted at the end of Phase 3.

## Roadmap
Each phase ends with its tests, then a real run. Commit after each phase.

### Phase 0 — Plan and design *(Jony, done)*
`update v1.md`, `composer-spec.md`, `mockup.html`, and `design/user-model.md`
updated. **Exit:** the spec is clear enough for Uncle Bob to build without asking.

### Phase 1 — One field, no Send
- `Composer.tsx`: remove the Send button. The field takes the full row
  (spec §2). Enter sends, Shift+Enter adds a new line, and Enter during IME
  composition (`e.nativeEvent.isComposing`) does nothing.
- The field is no longer `disabled` while sending. Enter is ignored while
  `sending` is true, and the text stays.
- Placeholder: "Ask anything · / for commands" when tools exist, otherwise
  "Ask anything…".

**Tests (Vitest):** Enter sends and clears the field. Shift+Enter doesn't send.
Enter while composing doesn't send. Enter while sending keeps the text and doesn't
call `onSend`, then the same Enter after sending finishes does send. A whitespace-only
message doesn't send. There's no button named "Send".
**Real run:** `npm run dev`, Patronus popover resized to 300px. Paste a 400-character
message: it wraps over the full width and stops growing at 128px.

### Phase 2 — Command registry + slash menu
- `composerCommands.ts` (pure): `buildCommands(available, enabled)` →
  `ComposerCommand[]`, and `matchCommands(text, commands)` → `{ query, arg, items }`
  (rules in spec §4).
- `CommandMenu.tsx`: the listbox (spec §4–5), with keys through `slashNav`, and
  combobox ARIA on the textarea.
- Move the `.pensieve-slashmenu*` CSS out of `blocknote-skin.css` into
  `editor/slashmenu.css`, imported by both menus. Today Patronus can open without
  that skin loaded.
- Running a command clears the field, keeps focus, and announces the result in a
  polite live region.

**Tests:** `matchCommands` covers `/` → all; `/w` → web; `/W` → web (case-insensitive);
`/web on` and `/web off` (forced action); `/web foo` → no match; `/x` → none;
`hi /web` → none; `/web\nmore` → none; empty registry → none.
In the component: `/` opens the menu; Enter runs the command and clears the field;
Escape closes only the menu (the window stays open), and then Enter sends the text as a
message; arrow keys wrap; a click runs the command; with no match, Enter sends the text.

### Phase 3 — Web indicator, retire the picker, new words
- `WebIndicator.tsx` inside the field (spec §3). Clicking it turns web off and puts
  focus back in the field.
- Delete `ToolPicker.tsx` and `ToolPicker.test.tsx`. Update `ownerWalk.test.tsx`
  to the new flow.
- Rust words: `off_note` becomes "…say the owner can type /web to switch on web
  search." `EMPTY_REPLY` becomes "Patronus gave no answer. If this question needs the
  web, type /web and send it again."
- Update the comments that say "beside Send" (`useAssistant.ts:89`, the
  tool-picker spec's pointer).

**Tests:** the globe is absent when off and present when on, with name "Web search is
on. Turn off". Clicking it calls `setTools([])` and focus is back in the textarea.
The owner walk: `/web` Enter, then send, means `askAgent` gets `["web"]`. Clicking the
globe, then send, means `[]`. Per-agent scoping still holds. `cargo test` for the
registry string. `npx tsc --noEmit`.

### Phase 4 — End to end, ship
- Hand test in `npm run tauri dev` at 300px and in full screen. Type `/web`, Enter, ask
  about today's weather in Paris: the reply shows "Searched the web". Click the globe,
  ask again: no web call in the `assistant.ask` log.
- Check keyboard only and VoiceOver (spec §7).
- `npm run tauri:build`, close wiki.md, rename the folder `- CLOSED`, merge to `main`.

**Tests:** the full `npm test`, `cargo test --lib` and `tsc` are green, plus the hand
test above, with log excerpts pasted below.

## Status
- 2026-11-20: **Phase 0 done** (Jony). Plan, spec, mockup, and the user model are
  updated. Next: Phase 1 (Uncle Bob).
- 2026-11-20: **Phases 1–3 built** (Uncle Bob). `composerCommands.ts` (pure model:
  build / match / title / run), `CommandMenu.tsx`, `WebIndicator.tsx`, new
  `Composer.tsx` (controlled field, combobox ARIA, polite live region, logs
  `assistant:composer.command {name, arg, outcome}`). Skin moved to
  `editor/slashmenu.css` (`.is-fluid` drops the min-width). ToolPicker deleted; owner
  walk moved to `/web` + globe. Rust `off_note` / `EMPTY_REPLY` reworded. Tests: 19 new
  (model + composer), owner walk 12/12, `tsc` clean, `npm run build` ok. The full
  `npm test` run under load had 6 timeouts in unrelated files (sync media, gallery
  window, phone reel, App); they pass when run alone. **Not run here:** `cargo test`
  (not allowed in this shell; the Rust tests compare against the constants, so the
  rewording can't break them). Not done: the globe fades in but disappears at once (no
  fade-out). Next: Phase 4 hand test in `npm run tauri dev`.
