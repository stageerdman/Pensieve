# Compact composer: design spec

For Uncle Bob. The mockup is `mockup.html` in this folder (open it in a browser). It
shows every state below at the popover's narrowest width (300px).

## 1. User goal
"Say what's on my mind to Patronus, however long, without fighting the box," and
"know at a glance whether this message may go to the internet." (User model goals 3–5.)

## What was removed, and why
| Removed | Why |
|---|---|
| **Send button** (~60px) | Enter already sends. This is desktop and keyboard-first. A button repeats a key everyone knows and costs a fifth of the row on a 300px window. |
| **Globe button when web is off** | Off is the default and the safe state, so it needs no marker. You find the tool by typing `/` (taught by the placeholder). |
| **"Web ×" pill** (~70px) | Replaced by a 24px globe inside the field. The × was a second control for one job, so clicking the globe itself now turns web off. |
| **"Tools for this chat" popover with switches** | One switch in a popover took two clicks and a mouse. `/w` Enter takes two keystrokes, and the hands never leave the keys. |
| **Disabled field while a reply streams** | It looked broken and dropped focus. Now you can keep typing, and only Enter waits. |
| *Not added:* a send arrow icon, `/new`, `/clear`, `/agent`, one-off `/web <question>` | No user goal asks for them yet. The command list is built so each one is a single entry later. |

## 2. Layout
```
┌ composer: border-t border-border p-3 ───────────────────────────┐
│ ┌ field: relative ────────────────────────────────────────────┐ │
│ │ textarea  w-full                                    [globe] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```
- **Composer:** `border-t border-border p-3`. It's no longer a flex row: the field is
  the only child (plus the live region and the menu).
- **Field wrapper:** `relative`.
- **Textarea:** today's classes, minus `flex-1` and `disabled:opacity-60`, plus
  `block w-full`. When web is on, add `pr-9` so text never runs under the globe.
  It grows with content up to `MAX_HEIGHT_PX = 128` (about 6 lines), then scrolls. That
  is unchanged, but the field now uses the full width, so it wraps far less.
- **Placeholder:** `Ask anything · / for commands` when the registry has at least one
  command, otherwise `Ask anything…`.
- **Focus on mount:** unchanged.

## 3. Web indicator (`WebIndicator.tsx`)
| State | Looks like |
|---|---|
| Web off (or no tools) | nothing is rendered |
| Web on | a 24×24 button at `absolute bottom-[7px] right-[7px]`, `rounded-sm text-accent`, `Globe size={16}`. Hover: `bg-accent/10`. Focus: `focus-visible:ring-2 ring-accent` |
| Several tools on (future) | same globe, with a dot badge if the tool has no globe-like icon. Decide when a second tool exists; don't build it now |

- Bottom-anchored on purpose: on a one-line field it is vertically centred
  (7 + 24 + 7 = 38px: 20px line + 16px padding + 2px border), and on a tall field it stays near the last line, where the
  caret and the eye are just before Enter.
- **Name** (aria-label): `Web search is on. Turn off`. **Tooltip** (`title`):
  `Web search is on. Click to turn off`.
- **Click:** `setTools(enabled without "web")`, then focus the textarea. Announce
  "Web search off".
- **Appear:** opacity 0 → 1 over 120ms, ease-out. No motion with
  `prefers-reduced-motion`. **Disappear: at once.** You just clicked it or ran
  `/web`, so the instant vanish is the confirmation. A fade-out would be extra code
  for nothing.
- Mousedown on it must not blur the textarea (call `preventDefault` on mousedown),
  so the caret doesn't jump.

## 4. Slash commands: exact behaviour

### The command model (`composerCommands.ts`, pure)
```ts
interface ComposerCommand {
  name: string;          // "web": what you type after "/"; from tool.id
  icon: ReactNode;       // Globe for web
  title: string;         // what Enter will do now: "Turn on web search" / "Turn off web search"
  description: string;   // tool.description from the registry
  run(arg?: "on" | "off"): string;  // applies the change; returns the announcement text
}
buildCommands(available: AssistantTool[], enabled: string[], setTools): ComposerCommand[]
matchCommands(text: string, commands): { open: boolean; items: ComposerCommand[]; arg?: "on"|"off" }
```
For each registry tool: name = `tool.id`, and the title verb comes from the current
state (`Turn on` / `Turn off`) + `tool.label` lowercased ("web search"). When
`run()` gets no arg, it toggles.

### When the menu opens (`matchCommands`)
Let `text` = the whole field value.
1. `text` must start with `/`, and contain no newline. Otherwise it's closed.
2. Split what follows the `/` on the first space: `query` and `rest`.
3. `items` = commands whose `name` starts with `query`, case-insensitive. `/` alone
   lists them all, in registry order.
4. `rest` (trimmed, lowercased): empty means toggle. `on` or `off` means `arg`, and the
   row title becomes that verb. A partial arg keeps the menu open so it never flickers
   mid-word: `o` is still ambiguous (toggle), `of` means `off`. Anything else means no
   match (closed).
5. `items` empty means closed. **A closed menu means Enter sends the text as a normal
   message.** So `/etc/hosts is missing` or `/shrug` just sends.

### Keys while the menu is open
These are handled in the textarea's `onKeyDown`, reusing `editor/slashNav.ts` as-is:
| Key | Does |
|---|---|
| ↓ / Tab | next row (wraps) |
| ↑ / Shift+Tab | previous row (wraps) |
| Home / End | first / last row |
| Enter | runs the highlighted row (Shift+Enter also runs it; it never adds a line in the menu) |
| Escape | closes the menu only. `stopPropagation` keeps the Patronus window open. The text stays, and the menu stays dismissed until the text changes. |
| any other key | types normally; the list refilters, and the highlight resets to the top |
Left and right arrows move the caret as usual.

### Running a command
1. `command.run(arg)`. For web, that's `setTools(...)`, the same per-agent chat state as
   today.
2. Clear the field and reset its height. Focus stays in the textarea.
3. Announce the returned text in the composer's `aria-live="polite"` region (visually
   hidden): "Web search on for this chat" / "Web search off" / "Web search is already
   on".
4. The globe appearing or disappearing is the visual confirmation. There's no toast.
- It works while a reply is streaming, and applies from the next message (as today).
- Pointer: `onPointerDown` + `preventDefault` on a row runs it, and the field keeps
  focus. Hover moves the highlight. (This is the same pattern as `SlashMenu.tsx`.)

## 5. The menu (`CommandMenu.tsx`)
```
┌───────────────────────────────────────────┐   ← bottom-full left-0 right-0 mb-1 z-20
│ 🌐  Turn on web search              /web  │   ← is-active (accent/14 background)
│     Search the web and read pages for t…  │
└───────────────────────────────────────────┘
┌ field ────────────────────────────────────┐
│ /w|                                       │
└───────────────────────────────────────────┘
```
- It sits above the field, at the field's full width (`absolute bottom-full left-0
  right-0 mb-1 z-20`). That never overflows a narrow window, and there's always room
  above, because the messages sit there.
- Skin: the existing `.pensieve-slashmenu` classes (`-item`, `is-active`, `-icon`,
  `-text`, `-title`, `-sub`). Override `min-width` to `0`, because the field sets the
  width. Those rules live in `blocknote-skin.css`, which only `Editor.tsx` and
  `NotePreview.tsx` import, so Patronus can't rely on it being loaded. **Move**
  the `.pensieve-slashmenu*` block (lines 384–438) into
  `src/components/editor/slashmenu.css`, and import that file from both
  `SlashMenu.tsx` and `CommandMenu.tsx`. Move it, don't copy it.
- Trailing hint per row: `/{name}` in `font-mono text-2xs text-text-muted ml-auto`.
- At most 5 rows visible (`max-height: 20rem` already), and it scrolls the active row
  into view.
- No group headers and no "No matches" row: no match means no menu (§4 rule 5).
- No open/close animation. It's a typing aid, and it must feel instant.

## 6. All states at a glance
| # | State | Field | Globe | Menu | Enter does |
|---|---|---|---|---|---|
| A | Empty, web off | placeholder | none | no | nothing |
| B | Typing, web off | text | none | no | send |
| C | Long text (wraps) | grows to 128px, then scrolls; full width | none | no | send |
| D | `/` or `/w` | `/w` | as is | open, row "Turn on web search" | runs the command |
| E | Web on, typing | text, `pr-9` | accent globe | no | send with `["web"]` |
| F | Web on, `/web` | `/web` | globe | "Turn off web search" | runs the command (off) |
| G | Reply streaming | editable | as is | works | nothing (the text is kept) |
| H | Escape on an open menu | text kept | as is | closed | send the text as a message |
| I | No tools in the registry / outside Tauri | placeholder without the "/" hint | none | never | send |
| J | Error reply | as B | as is | – | – ("Retry" / "Retry with web search" are unchanged) |
Fallback if the owner misses a send affordance (assumption §8): a 24×24 `ArrowUp`
icon, at the same spot as the globe (globe moves left), shown only when the text is not
empty. Don't build it unless asked.

## 7. Accessibility
- Textarea: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded={open}`,
  `aria-controls="composer-commands"`, `aria-activedescendant` = the active row id
  while open. Keep `aria-label="Message"`.
- Menu: `role="listbox" id="composer-commands" aria-label="Commands"`. Each row:
  `role="option" id=… aria-selected`.
- How to send is described once: `aria-describedby` points to a visually hidden
  "Enter to send, Shift+Enter for a new line".
- The globe is a real button, reachable with Tab (after the textarea), and it has a
  visible focus ring. Accent on surface passes AA in both themes (design.md tokens).
- Tap targets: the globe and the rows are at least 24×24 (WCAG 2.5.8). This is
  pointer-on-desktop, not touch.
- Everything works without a mouse: `/w` Enter, Tab to the globe, Space.

## 8. Assumptions (to check in use)
- **Nobody misses Send.** *Check:* ask the owner after a week. The fallback is in §6.
- **The placeholder hint is enough to find `/`.** *Check:* does the owner turn web on
  via `/web`, or via the reply's "Search the web" link? If they only use the link, the
  hint isn't landing.
- **Toggle-on-Enter (no on/off choice) never surprises them,** because the row title
  always says the action. *Check:* look for `/web` runs followed by an immediate
  second `/web` in the logs. Log each run as `composer.command {name, arg, result}`.

## 9. Files
New: `composerCommands.ts` (+ test), `CommandMenu.tsx` (+ test), `WebIndicator.tsx`
(+ test). Changed: `Composer.tsx`, `ownerWalk.test.tsx`,
`src-tauri/src/ai_tools/registry.rs` (`off_note`), `src-tauri/src/assistant/mod.rs`
(`EMPTY_REPLY`), and `blocknote-skin.css` → `editor/slashmenu.css` (a move).
Deleted: `ToolPicker.tsx`, `ToolPicker.test.tsx`. Reused as-is:
`components/editor/slashNav.ts`, the `.pensieve-slashmenu` skin, `Globe`, and
`useAssistant`'s `tools` / `setTools`.
