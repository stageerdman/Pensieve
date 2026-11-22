# Patronus block — UX walk-through (Columbo, 2026-11-22)

Method: no device in hand, so I followed the owner's round trip through the code (the phone's
spell block, autosave and sync; the Mac's queue, job, engine and undo) and ran the real modules
against 12 owner scenarios (`walkthrough-probes.test.ts.txt`: rename it to `.test.ts` inside
`src/lib/patronus/noteSpell/` to run it). The existing suites pass (8 files, 83 tests).

## Blockers
1. **Phone Undo is refused when the result has a list.** The phone re-saves `- ` bullets as
   `* `. After the owner taps Undo, the Mac compares hashes, sees a change and answers "You
   edited it since". The plan's own dreams example hits this. Fix (Mac): compare a normalised
   hash (bullet marker, blank lines), or have the AI/app write `* `. → Uncle Bob
2. **A second spell in the same memory never runs.** The Mac uses only the first block with a
   state. A new pending block under a cast one shows "Waits for the computer" forever, and the
   hint never clears. The phone spec's answer to "run again" is "add another block". With two
   pending blocks, the second is passed to the AI as memory text, and a rewrite deletes it
   silently. Fix: act on the first *actionable* block, keep the other spell blocks out of the
   content, and put them back. → Uncle Bob
3. **The Dictate key in the note toolbar is still a demo.** It types a fixed sample sentence
   into the memory body, not into the spell. "Spoken" works only through the iOS keyboard's
   own mic. Fix: hide Dictate while the spell field has focus, or make it real. → Jony

## Should fix
4. **Seeing the result:** phone sync is manual, so the owner must sync again later. Suspected,
   verify on device: if a sync runs while the memory is open, the block keeps saying "Waits"
   and later typing may write over the pulled copy (`currentRef` is not refreshed after a
   pull). → Jony
5. **"Keep mine" after a conflict** gives "Already ran… restore from Timeline", plus an Undo
   button that is always refused. The owner's new words are not processed. → Uncle Bob/Jony
6. **A command it can't do** ("tag this", "move to Journal") still shows *Cast* + *Undo*. Let
   `finish` say "couldn't" so the block shows Fizzled, or at least drop Undo when nothing
   changed. → Uncle Bob
7. **Fixing a fizzled spell's words does not re-arm it.** Only Try again does, and that is
   easy to miss. Re-arm on edit. → Jony
8. **A Mac problem** (Claude logged out) leaves the phone on "Waits for the computer" with no
   hint. Acceptable for v1. The Mac row shows it.

## Watch out (low likelihood)
- An instruction whose first line starts with lower-case `error:`/`run:`/`did:` loses that
  line to the header parser.
- A blank spell says "Waits for the computer" but is never sent.
- The offline panel says "It'll back up on its own once you're connected". It does not: the
  phone syncs only when tapped.

## Works as designed (verified)
Typed spell → hint → Mac queue → one write with receipt → phone shows Cast + did line.
Syncing twice does nothing more (one save). A stale `undo` is refused. Bad JSON shows Fizzled
with a reason. Undo with no list brings the removed recording back. Media bytes are never
deleted.
