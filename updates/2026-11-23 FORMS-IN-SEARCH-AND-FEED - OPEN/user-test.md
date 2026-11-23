# FORMS-IN-SEARCH-AND-FEED: using Forms like a real user (Columbo)

## Summary

The three main jobs work in the code on the real vault. Typing "form" offers **Form**, and picking it leaves exactly the two forms (CANI, Weekly reflection) on both Mac and phone. A memory made from either form now comes out with **Journal** plus the form's tag. Forms draw as their own measuring flask in their own colour. What breaks:

1. **The phone will lose both forms in 6 days.** Both were last opened on 15 Nov. The phone forgets anything untouched for 14 days, and nothing protects forms from that. From about **29 Nov**, `form:` on the phone finds nothing, because older memories come back as title-only stubs with no form flag. The phone's own "fill a form" list goes empty too.
2. **Three real CANI memories (16–18 Nov) have no labels.** The fix only works from now on. These three are missing from every Journal or @CANI view.
3. **Enter after "for" adds a Form chip.** "for" is one of the most common words in titles. Type "prep for", press Enter out of habit, and the list goes empty.

## How I tested (and what I could not)

- I ran the app's own code, read-only, on the owner's vault: **2,123 memories, 2 forms, 8 memories made from forms**. On the Mac: `parseQuery`, `completionsAt`, `runSearch` + `MemoryIndex`. On the phone: `rankNotes`, `formSuggestion`. For making a memory from a form: `memoryFromForm` + `inheritLabels`, the same pure steps `startFromForm` uses. I also read each form's open history and the phone's window rules. The temporary script is deleted, and nothing in the vault changed.
- **Not done:** the installed Mac app hasn't been rebuilt with this work yet (P4 is open), and I had no iPhone. So the look is checked from the code and the design note, not seen on screen. Whether you can spot a form at a glance in the feed is my **judgement**, not a measurement.
- "Duplicate a form" means making a memory from a form (`update v1.md`). The app has no plain "duplicate" command.

## What I found, at a glance

| Check | Mac | Phone |
|---|---|---|
| "fo", "form", "Form", "forms" offer Form | ✅ | ✅ (chip above the bar) |
| Pick Form → only forms | ✅ CANI, Weekly reflection | ✅ same |
| Form + a word ("cani", "weekly") | ✅ the one form | ✅ |
| "form" typed but **not** picked | ⚠️ CANI #5, Weekly reflection absent (rows 1–4 are "Formula…" notes) | ⚠️ #33 / #37 of 516 |
| Name first, then "form" ("CANI form") | ✅ CANI #1 | ❌ **0 results** unless the chip is tapped (the phone matches the whole phrase as one string) |
| "form cani" (chip word first) | ✅ CANI #1 by text, but no Form row (rows only follow the last word) | ❌ 0 results, no chip |
| "form" + a category ("form journal") | ❌ 0 (category words aren't searched as text) | ❌ 0 |
| "template", "formy", "formulář" | ❌ no Form row; forms not found | ❌ same |
| Memory made from a form keeps its categories and tags | ✅ CANI → [Journal] [@CANI]; Weekly → [Journal] [@Weekly Reflection]. Its own labels are kept and duplicates merged | ✅ the desktop resolves phone sessions with the same rule |
| Old memories made from forms | ❌ 3 of 8 have no labels (CANI Mon 16, Tue 17, Wed 18 Nov) | — |
| A form stands out in the feed | ⚠️ shape only (see deep dive 3) | ⚠️ same |
| Forms stay findable over time | ✅ the Mac keeps everything | ❌ forgotten after 14 untouched days (both on 29 Nov) |

## Behavior table

L = likelihood, F = frequency (1–10). Sorted by L+F.

| # | Behavior | L | F | Why |
|---|---|---|---|---|
| 1 | **Start today's entry from a form** (CANI daily, Weekly reflection on Sunday) | 10 | 9 | 6 of the 8 memories made from forms are daily CANIs. It's a daily ritual. |
| 2 | **Filter or review by a form's label** (Journal, @CANI) | 8 | 7 | 5 of the 8 have Journal + their tag even though the old code dropped labels. **Assumption:** the owner added them by hand, which shows they care. Weekly reflection asks you to look back over the week. |
| 3 | **Scan the feed and spot "which one is the form"** | 8 | 7 | The form sits among its own daily copies, which have nearly the same colour (CANI h310, its copies h295–309). |
| 4 | **Type "form" and pick Form** | 8 | 6 | It's the new path. With only 2 forms it's a few times a week, mostly to edit a form. |
| 5 | **Fill a form on the phone** (walk-through) | 7 | 7 | The phone is the capture device. The CANI questions suit a voice answer at the end of the day. |
| 6 | **Press Enter out of habit** after typing | 8 | 5 | Spotlight and Google taught "type, then Enter". Enter picks the top row, and Form comes first. |
| 7 | Type the form's name first ("CANI form", "weekly form") | 7 | 5 | People name the thing before its type. |
| 8 | Edit a form (add a question, change its colour) | 7 | 3 | Forms evolve: the weekly form has a crossed-out "~~expectation~~". |
| 9 | Search a different word ("template", "formulář") | 4 | 3 | **Assumption:** the app calls them forms everywhere, so this is rare. Scored low. |

**Watch out (low score, high trust cost):**
- Phone forms vanishing (from #5): the owner opens the phone to fill CANI, and the form isn't there.
- Enter-traps-to-empty (#6): an empty list right after Enter reads as "my notes are gone".

## Deep dives

### 1. Start today's entry from a form (L10 F9) ✅
- **The moment:** Late evening at the Mac. They open a new memory and see "Start from CANI / Weekly reflection".
- **Thoughts:** "Same as every day. Tap, answer, done."
- **Expectations:** One click. The title is dated, the questions are there, and it's already filed under Journal and @CANI.
- **Evidence:** It works. "CANI — Mon 23 Nov" comes out with [Journal] [@CANI]. Labels the memory already had are kept, and case-different duplicates collapse.
- **Small inconsistency:** the "Start from" buttons still show the old generic form icon, not the form's own flask and colour. The owner learns "this colour flask = CANI" in the feed, then doesn't see it at the one place they pick a form.

### 2. Filter or review by label (L8 F7): breaks for existing data
- **Thoughts:** "Show me this week's CANIs." They pick Journal or @CANI.
- **Evidence:** Mon 16, Tue 17 and Wed 18 Nov are missing: three days in a row. The fix only covers new memories.
- **Emotion:** "Did I skip those days?" A gap in a streak hurts more than a missing note.
- **Suggested fix:** a one-time backfill. For every memory with `fromForm` and no labels, add the form's labels (it's the same `inheritLabels`, so it's safe and only adds). Back up the vault first. The orchestrator decides.

### 3. Spot the form in the feed (L8 F7): works, but weakly
- **Evidence:** A form differs only by silhouette: a measuring flask with ticks instead of a vial. The ticks only appear at larger sizes. It sits in a run of near-same-colour copies, and since it was made on 13 Nov it's far down a newest-first feed. At the 28 px search-row size, flask vs vial with the same hue is a subtle difference.
- **Thoughts:** "Which pink one is the template? I don't want to type today's answers into the form itself."
- **Fear:** writing into the form by mistake. That changes every future copy.
- **Suggestion:** test it on the rebuilt app. If the owner hesitates, add a cue beyond shape. That's a design call for Jony.

### 4. Type "form" and pick Form (L8 F6) ✅
- **Evidence:** It works on both devices. On the Mac, the Form row is the top row for "fo/for/form/forms", and Enter stacks the chip.
- **Friction:** "forms" without picking the row shows 9 unrelated notes. The Form row sits right above them, so this is fine.

### 5. Fill a form on the phone (L7 F7): breaks on 29 Nov
- **The moment:** On the sofa at night, phone in hand, voice-answering CANI.
- **Evidence:** The phone's form list (`formsIn`) and the `form:` filter only see memories stored on the phone. Both forms were last opened on 15 Nov. Starting a memory from a form on the Mac doesn't count as opening the form. The phone doesn't protect forms from its 14-day cleanup (`protect` is never passed). So both forms drop off the phone around **29 Nov** and come back as title-only stubs with no form flag.
- **Emotion:** Confusion, then distrust: "Where did my CANI go?"
- **Suggested fix:** always keep form templates on the phone, by protecting them or exempting `form: true` from the cleanup. Or add the form flag to the notes index so stubs keep it. This is needed before this goal ships.

### 6. Enter out of habit (L8 F5): watch out
- **Evidence:** "for" offers Form ("forms" starts with "for"), and Form becomes the highlighted top row. "plan for" + Enter → Form chip + "plan" → **0 results**. The same happens with "fo".
- **Suggested fix:** only offer Form from "form" (or keep "fo"/"for" showing it but not highlighted). The phone chip has the same trigger, and its list jumps up and down while typing "food", "for", "focus" (`.suggesting` changes the list margin). Starting at "form" fixes both.

## Key insights

1. **Fix before shipping:** keep forms on the phone (deep dive 5). It's a dated, certain break.
2. **Backfill the three unlabeled CANIs** (deep dive 2). It's cheap, and it closes a visible gap in the owner's streak.
3. **Start the Form suggestion at "form", not "fo"/"for"** (deep dive 6).
4. **Nice to have:** show the form's flask on the "Start from" buttons. And on the phone, "CANI form" / "form cani" return 0. The phone's phrase-only text match is the same old-ranker problem I reported in the search test.

## Open questions

- Should the backfill touch existing memories? It writes to the owner's vault. The orchestrator or owner decides.
- Is the shape-only cue enough at a glance? Check on the rebuilt Mac app (P4) and on the phone.
- My open to-do, "re-test search after the phone uses the shared ranker": the phone still runs `accioRank` (the old ranker), so that re-test is still waiting.
