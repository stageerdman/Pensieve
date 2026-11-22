# User model — Pensieve (living file; update when we learn something)

## Who
One user, the owner: a thinker who journals daily. They capture on the phone (the Wand)
and organise and reflect on the desktop. AI (Patronus) is desktop-only. It's for
organising, planning and deep reflection, not for daily logging.

## Top goals (by how often × how much it matters)
1. Capture a thought instantly (phone + desktop). It must never feel slow.
2. Find and re-read past thoughts and memories.
3. Reflect with Patronus over their own notes ("what have I said about X?").
4. Check their thinking against the world, without leaving their own space
   (Patronus web search, opt-in per chat).
5. Trust: private words never leave the machine unless they chose that.
6. Leave a job for later from the phone ("tidy this", "make a list of the dreams, then
   drop the recording") and walk away. The computer does it on sync, and they can take it
   back (PATRONUS-BLOCK, 2026-11-22).

## What they actually do (phone note spells)
- They capture first and decide what to do with it right after, still in the memory. So
  the spell lives in the memory's own Spell Menu ring, not in a separate screen.
- They come back later only to glance: "did it happen, and what did it do?" One status
  line plus the one `did:` line answers that; Undo is the only action.

## What they actually do (search, goal #2)
- They search for *what*, not *when*: "that thought about the garden". A date-ordered
  view buried the best match under whatever was touched last, so while searching they get
  one flat list, best match first, with the timeline gone (design/search-results.md).
- They scan words, not icons, so a result is a title + the words around the match.
- On the phone they often drop the keyboard to read; the ranked list must stay until they
  clear the search.

## What they actually do (Patronus)
- Research chats run many turns, so a tool switched on should stay on for that chat.
- They ask first and remember the tool later, so they need a one-tap recovery on the reply.
- They check sources: "is that from my notes or a website?" Web and note sources must
  look different.
- They glance before sending something personal: "is this going to the internet?"
  The on-state must be visible where the eye is just before Enter. Since
  COMPACT-COMPOSER, that's a small globe inside the field.
- They use Patronus in a small popover (300–360px wide) and write long messages.
  Every fixed control beside the field squeezes the text (owner report, 2026-11-20).
  Composer controls therefore go inside the field, or behind `/`.
- They work keyboard-first on the desktop. Enter sends, and `/w` Enter switches on web.

## Assumptions (guesses, to check)
- The agent's instructions keep search queries generic. The shown query is how the
  owner verifies that. *Check:* read the queries in real use.
- ~~Two clicks to switch on web is acceptable.~~ The picker is replaced by `/web`
  (COMPACT-COMPOSER).
- Nobody misses a Send button. *Check:* ask the owner after a week. The fallback is a
  small arrow icon inside the field.
- The placeholder "/ for commands" is enough for the owner to find `/web`. *Check:* do
  they use `/web`, or only the "Search the web" link on replies?
- Keyboard dictation in the spell's field is enough for "spoken" spells, with no separate
  recorder. *Check:* after a week of real use, ask whether they missed recording a spell.
- "Waits for the computer" is clear enough without a "being cast" state on the phone.
  *Check:* the first real round trip (Phase 7).
- With nothing typed, the phone search sheet showing only recent searches (no memories)
  won't feel empty. *Check:* ask whether they open Accio just to browse.
- A memory's first category is a good enough "type" on a result. *Check:* whether they
  ever can't tell a voice note from a journal page in the list.
- A hover-revealed "Search the web" on the latest reply is found when it's needed.
  *Check:* see whether the owner uses it, or always goes to the picker.
