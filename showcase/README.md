# Pensieve showcase: catch on the phone, understand on the Mac

**Open it:** double-click `pensieve-showcase.html`. It works offline and needs no server, install or build step.

It follows Merlin's script (`updates/2026-11-24 WOW-SHOWCASE - OPEN/script.md`) and Columbo's reference of the real app (`prototype/real-design-reference.md`). All the data is one made-up week.

## What's in it

- **The phone (left):** a replica of the real phone app. It has the Dock, the gold wand button and the Spell ring (general spells are gold, spells that belong to a memory are blue).
- **The guide (beside it):** for each capture mode it shows the moment, three steps and an honest note. Each step lights up as the animation reaches it.
- **Ten scenes:** The Wand, Write, Record, Film, Snap, Journal pages, iPad + Pencil, Form (Daily Review), the Patronus spell and Accio search. Use the strip along the bottom or "Next". Hovering a mode previews its guide.
- **The shelf:** every caught thought drops a real Flask bottle under the phone. It is still empty, because the phone doesn't transcribe.
- **The Mac:** a 3D MacBook opens. A gold thread runs from the shelf to the Mac and the bottles fly in as cards. Voice transcribes word by word, journal pages split into Mon 18 and Tue 19, and anything you skipped arrives as "From earlier this week".
- **Patronus chat:** three suggested questions with scripted answers. Each answer has citation chips: hovering one lights its card, and clicking one opens the memory at that line. Free text is matched by keyword. The closing answer ends the story.

## Behaviour

- Any click skips the animation that is playing. After 20 idle seconds the stage plays the tour by itself, and any touch takes control back.
- Sound is off by default. Turning it on adds soft tinks and a pour sound, and reads quotes aloud when you open them.
- With reduced motion on, the movement is cut down and every step still shows.

## Files

- `pensieve-showcase.html`: the whole showcase. Hand-written HTML, CSS and vanilla JS, with all the words in the `DATA` and `MODES` blocks at the top of the script. The plan suggested a Vite build; one hand-written file was chosen because it has no build to break and opens anywhere.
- `showcase.test.ts`: checks that the file never touches the network, mic or storage, plays the whole story through instantly, and checks every chat citation (`npx vitest run showcase`).
- `shoot.mjs`: takes 13 screenshots of the key moments to `screenshots/`, which git ignores (`node showcase/shoot.mjs [filter]`).

For tests, setting `window.__instant = true` before load makes everything instant. `window.__showcase` exposes the state and the scene functions.
