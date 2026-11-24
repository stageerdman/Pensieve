# WOW-SHOWCASE — wiki

Lasting decisions and lessons. The why behind `update v1.md` and `script.md`.

## A. Use the app's own world, don't add a new one
Wand → bottles (Flasks) → the Mac → Patronus are the real product's language. A showcase
that invents a second metaphor (bees, fireflies, a shore) would teach a world the visitor
won't find in the app. Backup world "the hive" is in `script.md` §2, for use only outside
the app's look.

## B. The ending carries the product
The whole tour builds to one chat answer that cites at least four *different shapes*
(voice, paper, photo, form, typed). That one reply says "multi-modal + transcripts + AI
coach" better than any slide. Protect it: skipped modes are filled from "earlier this week"
so it always works.

## C. Stay true to the real app
- Phone records, Mac transcribes (whisper.cpp). So live words appear on the Mac.
- iPad handwriting to text is Apple's Scribble, and the guide says so.
- AI never appears on the phone. A Patronus spell on the phone only *waits*.
- Sync isn't a mode. Opening the MacBook is the sync.

## D. Only made-up data
All words live in `showcase/src/data/`. A guard test checks that the built file makes no
network, microphone or storage calls. Nothing is read from a vault.

## E. Magic never costs time
Any click skips an animation to its end. Show me ≤ 6 s. The only slow moment is the voice
transcript typing itself (about 3 s), because it's the proof.
