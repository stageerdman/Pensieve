# Tool picker — design spec (Phase 3)

Built from Columbo's flow (`ux-research-tool-picker.md` / report "Tool picker & web
search: how the owner will use it") on top of Uncle Bob's backend contract (wiki.md).

## User goal
"Check my thinking against the world without leaving my own space", while staying
sure no private words leave the machine unless I chose that.

## What was removed, and why
- **The three-dots menu under replies.** It doesn't exist today, and building one
  for a single item adds a click. Its one action ("Retry with web search") is now a
  quiet text link on the reply itself.
- **A separate "Web" chip beside the picker.** The picker button *becomes* the chip
  when web is on: one control, not two.
- **A tools stamp on the user's bubble.** The reply already shows "Searched the web"
  when the web was used. A second marker would be noise.
- **"/web" shortcut, per-agent defaults, saving the setting.** Out of scope (Columbo).
  Every chat starts off.
- **"Search the web" under every reply.** It's offered on the latest reply only, and
  only on hover or keyboard focus, so a private reflection isn't nudged toward the
  internet after every answer.

## Flow
1. Type as always. Web is **off** in every new chat and after every app start.
2. Click the globe left of **Send** → "Tools for this chat" → switch **Web search** on.
3. The globe turns into an accent **Web ×** pill. It stays visible while you type and
   for every follow-up in this chat (per agent). Click **×** to switch it off.
4. Send → the reply bubble shows **"Searching the web: *query*"** (the real query).
5. Reply done → under it: **"Searched the web · N sources ⌄"**, collapsed. Opening it
   lists every query/URL that was sent, then the source pills. A click opens the page
   in the browser.
6. Forgot to switch it on? Hover the latest reply → **"Search the web"** resends that
   same question with web for that one message. The chat stays off.
   On a failed reply: **Retry** · **Retry with web search**.

## Layout and states

### Composer row (popover 360px and full screen)
`[ textarea (flex) ] [ picker ] [ Send ]`, all 36px high (`h-9`), `gap-2`, `p-3`.

| State | Picker looks like |
|---|---|
| No tools in the registry (or outside Tauri) | not rendered |
| Off | 36×36 globe icon button, `text-text-muted`, hover `bg-surface-raised`. aria-label "Tools" |
| Off, list open | same button, `bg-surface-raised text-text`, `aria-expanded=true` |
| On | pill `bg-accent/10 text-accent`: globe + "Web" (opens the list) and a 24×24 **×** ("Turn off Web search") |
| Several tools on (future) | pill reads "N tools" |
| Sending | the picker stays usable. A change applies from the next message |

### "Tools for this chat" list
Opens upward (`bottom-11 right-0`), `w-64`, `z-20`, same surface/border/radius/shadow as
the agent menu. Header `text-2xs` uppercase muted. One row per registry tool:
icon · label (`text-sm`) + description (`text-xs` muted) · switch track (accent when on).
Each row is a `role="switch"` button with `aria-checked`. Escape closes the list only
(capture phase), not the whole Patronus window. Outside click closes it.

### Reply
| State | Shows |
|---|---|
| Streaming, no web call yet | "…" as today |
| Streaming, web called | inside the bubble, first line: pulsing accent globe + "Searching the web: *query*" (`role=status`). For fetch: "Reading *site*" |
| Done, web used | below the bubble, after note chips: "Searched the web · N sources ⌄" (`text-xs` muted, `aria-expanded`) |
| Expanded | each call as "Searched *query*" / "Read *url*", then source pills: `rounded-full bg-surface-raised`, globe, title (truncate 160px), "· site". Note chips stay `rounded-md` + border + bookmark, so the two never look alike |
| Source without a title | the pill shows the site |
| Done, web off, latest reply | "Search the web" link (accent `text-xs`), revealed on hover / focus-visible |
| Error | "Retry", plus "Retry with web search" when it was sent without web |

## Accessibility
Every control is a real button with a visible accent focus ring. The switches carry
`role="switch"` + `aria-checked`. The on-pill's name says what is on. The live search
line is `role=status`. The hover-only link still shows on keyboard focus. Colours are
tokens only (accent is AA on surface in both themes).

## Files
`ToolPicker.tsx` · `WebActivity.tsx` · `ReplyActions.tsx` · `ChatPane.tsx` (shared by
popover + full screen) · `useAssistant.ts` (`tools`, `setTools`, `send(text, {tools})`).
Tests next to each one.

## Assumptions (to check in use)
- One click to open + one to switch is fine at one tool. If the owner finds it slow,
  make a single-tool registry toggle directly on click (easy: ToolPicker only).
- The hover-revealed "Search the web" is easy enough to find, because Patronus itself
  says "switch on Web search next to Send" when it can't look something up.
