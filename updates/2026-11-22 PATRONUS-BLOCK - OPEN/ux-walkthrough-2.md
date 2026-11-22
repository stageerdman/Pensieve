# Patronus block — second UX walk-through (Columbo, 2026-11-22)

**Verdict: both blockers and all phone issues are fixed.** Nothing blocks shipping. There are two
new small findings (one is about wording, one is rare) and the old watch-outs. All are below.

## Method
I merged the Mac fixes (Uncle Bob, `41c07f6`) and the phone fixes (Jony, `c2a1b10` on
`studio/columbo-s-ux-walk-through-of-the-patronu-04d1ecc1`) into one working copy. They merged
with no conflicts. Then I walked the owner's round trip again with 20 probes
(`walkthrough2-probes.test.ts.txt`): phone saves → hint → Mac queue → cast → phone pulls and
re-saves → Undo / Try again / edit → Mac → phone. I backed the merge out afterwards, so this
branch only adds the report and the probes.
- All 20 probes pass. The related suites pass too (23 files, 227 tests).
- `tsc` passes for both the desktop and the phone.
- Not covered: I had no device and no real Claude. Screens, the keyboard mic and how the AI
  really phrases its answers were checked in code only.

## The first walk's list, re-checked
| # | Issue | Now |
|---|---|---|
| 1 | Undo refused after the phone re-saves a list | **Fixed.** Undo works with `- `, `* `, numbered, nested and `[X]` lists. A real edit (a changed word) is still refused, which is right. |
| 2 | A second spell in the same memory never runs | **Fixed.** A new spell under a cast one runs and the hint clears. With two waiting spells, one sync runs the first, keeps the second untouched (the AI never sees it), keeps the hint, and the next sync runs the second. Undoing the second spell keeps the first one's result. A spell added after a cast one survives that cast one's Undo. |
| 3 | Dictate key was a demo | **Fixed.** The key is gone, and so is Write's hold-to-speak. Speech now goes through the iOS keyboard's mic. (One stale comment is left: `PhoneApp.tsx:771`, "dictation (simulated)".) |
| 4 | Seeing the result / an open memory goes stale after a sync | **Fixed.** The open memory redraws to the cast copy. After a sync, a toast "Sync again in a minute" appears while a spell still waits, and it does not appear once the result has arrived. |
| 5 | "Keep mine" gave "Already ran" plus an Undo that never works | **Fixed.** The spell now shows Fizzled + Try again. Try again runs it on the owner's new words (the whale shows up in the list). |
| 6 | A command it can't do still showed Cast + Undo | **Fixed in the engine.** `cannot` → "Fizzled — I can't add tags.", and nothing is changed. It still depends on the AI choosing `cannot` (see B). |
| 7 | Fixing a fizzled spell's words did not re-arm it | **Fixed.** Editing re-arms it on the spot ("Waits for the computer"), and the next sync runs it. |
| – | Offline copy promised an automatic backup | **Fixed.** It now reads "Back up once you're connected." |
| – | Phone and Mac disagreeing on the hint | **Agree** in all 6 states, blank spell included. |

## New findings (none block)
**A. Undoing an older spell after a newer one ran says "You edited it since."**
Likelihood 5, frequency 3. Someone stacks "fix typos" and then "add a list", and later wants to
undo the first. Refusing is right, because the text changed. The words are wrong, though: the
owner edited nothing, a spell did. They will doubt their own memory. *Fix the wording (Uncle Bob):*
"Something changed since (another spell ran). Undo from Timeline on the computer."

**B. The AI may still "finish" a command it can't do.** The engine handles `cannot` well, but
the probes only use scripted replies. If Claude says "I can't move memories" inside `finish`,
the owner sees Cast + an Undo that does nothing. Check this once with real Claude ("tag this",
"move to Journal").

**C. Typing in the memory while a sync is running wins over the cast result.** Likelihood 2.
The page keeps the owner's words, which is good. But it also keeps the old *waiting* spell, so
the next save writes over the copy that came back from the Mac. The Mac then answers "Already
ran… Try again". This can be recovered (the result is on the computer's Timeline, and Try again
works), but the list the owner was waiting for disappears. Watch list.

## Still on the watch list (unchanged, low likelihood)
- A blank spell shows "Waits for the computer", although it is never sent (there is no toast
  for it now).
- An instruction whose first line starts with lower-case `error:` / `run:` / `did:` loses that
  line.
- A problem on the Mac side (for example, Claude logged out) leaves the phone on "Waits".

## To ship
Merge both fix branches, then run `npm run deploy:phone` (Jony's note). The phone fixes are not
deployed yet.
