# FAST-RELEVANT-SEARCH: searching like a real user (Columbo)

## Summary

The Mac passes the main test. "What do I want today" puts that note first, "I" alone leaves the timeline alone, clearing brings the timeline back, and typing never waits on the search. **The phone fails the brief.** It still runs the old search (on purpose: `update v1.md` lists the phone as out of scope). There, "What do I want today" returns **zero results**, because the phone reads "today" as "made today". "I" floods the list with 2,113 of 2,121 memories. The Mac has one real ranking flaw: when a search isn't an exact phrase, **starred memories jump over a memory whose title holds every word you typed**. "what i want today" puts "What do I want today" at **#27**.

## How I tested (and what I could not)

- I ran the app's own search code (`runSearch` + `MemoryIndex` on the Mac, `rankNotes` on the phone) on the owner's real vault: **2,121 notes**, 119 starred, metadata blocks removed the way the app removes them. Everything was read-only, and the temporary scripts are deleted.
- I typed each query one letter at a time and timed every keystroke. Then I read the top results the way a person would.
- **Not done:** I had no access to a real iPhone or the running Mac window. So frame drops while the list repaints, and the phone's real speed, are **estimates**. I also didn't add voice transcripts to the test index, so spoken-word search was not checked.

## Scope

- **In:** typing speed, title search, short words, word-only search, series titles, clearing, on both the Mac and the phone.
- **Out:** chip filters (tags, dates, categories), the editor, sync. The brief is about free-text search.

## What I found, at a glance

| Check | Mac | Phone |
|---|---|---|
| "What do I want today" → that note first | ✅ #1 | ❌ **0 results** ("today" becomes a date filter) |
| "what do i want" (title prefix) | ✅ #1 | ✅ #1 |
| "what i want today" (one word dropped) | ❌ **#27**, behind starred notes | ❌ absent |
| Typo "wht do i want today" | ❌ #75 | ❌ absent |
| "I" / "the" alone | ✅ ignored, timeline stays | ❌ **2,113 results** |
| "CANI Report", "Hour of Power" (many notes share the title) | ✅ all on top, newest first | ✅ same |
| Czech without accents, "rozhodnuti" | ❌ 0 (34 notes have "rozhodnutí") | ❌ 0 |
| Clearing brings the timeline back | ✅ in the code (`clearAll`; an empty or stop-word query counts as "not searching") | ✅ in the code (`clearSearch` restores the scroll spot) |
| Typing speed | ✅ search took 4–68 ms per keystroke on a busy shared machine, mostly under 30 ms. It runs one step behind your typing, so the box never waits. The list shows 50 rows at a time. | ⚠️ The old search checks every note's title and body on every keystroke, with no lag-behind. On the full vault in Node: 45–110 ms per keystroke. The phone keeps only 14 days of bodies (plus older titles), so its real load is smaller, but its processor is slower. **Not measured on a device.** |

## Behavior table

Likelihood (L) = how likely real users are to do this. Frequency (F) = how often. Both are 1–10, sorted by L+F.

| # | Behavior | L | F | Why |
|---|---|---|---|---|
| 1 | **Watch results while typing:** glance mid-word | 9 | 9 | Every search passes through half-typed states, and people look at the list on each keystroke. |
| 2 | **Clear to go home:** empty the box, Esc, or tap the pill | 9 | 9 | Every search ends this way. |
| 3 | **Retype a remembered title** | 9 | 8 | The owner names notes as questions to themselves ("What do I want today"), and series repeat. |
| 4 | **Search one theme word** ("fear", "Ria", "sales") | 9 | 8 | The commonest way people search personal notes. |
| 5 | **Start with a short word** ("I…", "A…", "What…") | 8 | 8 | Many of the owner's titles start with "I". The first keystroke is often a stop word. |
| 6 | **Half-remembered title:** a word dropped, swapped or reordered | 8 | 7 | Memory of your own titles is fuzzy. "what i want today" is a very natural slip. |
| 7 | **Find the latest in a series** ("CANI Report" ×20+, "Hour of Power") | 8 | 7 | Recurring journal formats are a big part of this vault. |
| 8 | **Date words used as plain words** ("today", "this week" inside a title phrase) | 7 | 7 | 28 titles contain "today" or "want". People don't think of them as commands. |
| 9 | Typo on the phone keyboard ("wht", "wnat") | 7 | 6 | Phone thumbs. Lower frequency because people usually correct before reading the list. |
| 10 | Czech typed without accents | 6 | 6 | **Assumption:** a bilingual owner on an English keyboard often skips the accents. Scored low because I haven't seen the owner do it. |
| 11 | Search the words of an old note on the phone | 6 | 5 | The phone only has titles beyond 14 days, so body words in old notes can't be found. |
| 12 | Search something said in a voice memo | 6 | 5 | Transcripts are folded into the Mac index. Not tested here. |

**Watch out (low score, high trust cost):** #10 and #11. A search that returns **nothing** for something the owner knows exists ("rozhodnuti", or an old note's body text on the phone) makes people stop trusting search altogether.

## Deep dives (both scores 7 or more)

### 1. Watch results while typing (L9 F9)
- **The moment:** At the Mac in the evening, with a thought half-formed, or on the phone at a café with one thumb.
- **Thoughts:** "It's the one about wanting… there it is."
- **Expectations:** The letters appear instantly. The list keeps up within a breath and doesn't jump around once the right row shows up.
- **Evidence:** On the Mac, typing never waits on the search, and the search itself mostly stays under one or two frames. On the phone the search is unchecked and not deferred, so this is the riskiest spot on a big week.
- **Product insight:** When the phone moves to the shared ranker, it should also adopt the Mac's lag-behind search, not just the ordering.

### 2. Clear to go home (L9 F9)
- **Thoughts:** "Done, back to my timeline, where I was."
- **Emotions:** Relief. Anxiety if the timeline comes back at the top or looks empty.
- **Evidence:** Both clear paths restore the timeline. The phone also restores the scroll spot. This passes in the code; I didn't check it on a device.
- **Product insight:** Keep the restored scroll spot on the Mac too, if it isn't already.

### 3. Retype a remembered title (L9 F8): the brief's core case
- **The moment:** Morning. The owner wants to add to "What do I want today" from last week.
- **Trigger:** They remember the title word for word.
- **Expectations:** The note is row 1 before they finish typing, with no thinking needed.
- **Evidence:** Mac ✅. From "what do I want tod" onward it is #1. **Phone ❌:** typing "today" silently turns into "notes made today", and the list goes empty. That is the worst feeling search can give: "it's gone?"
- **Product insight:** The phone must not swallow date words when they are part of what you typed. On the Mac, a date becomes a chip you confirm, and that matches how people think about it. **Fix:** have the phone use the shared `runSearch` ranker, as `update v1.md` planned ("one import"). Treat date words as suggestions, never as silent filters.

### 4. Search one theme word (L9 F8)
- **Evidence:** "fear", "Ria", "procrast" and "today" all put title hits first on the Mac. Within those groups, starred notes lead, which reads as "my important ones first". That's fine here.
- **Product insight:** This works. No change.

### 5. Start with a short word (L8 F8)
- **Thoughts:** "I… I crave… I crave connection."
- **Expectations:** Nothing crazy happens after the first letter.
- **Evidence:** On the Mac, "I" and "the" leave the timeline untouched ✅. On the phone, "I" shows a 2,113-row "results" list, and "What do I want today" is #117 in it.
- **Product insight:** Same fix as #3. The shared ranker already ignores stop words.

### 6. Half-remembered title (L8 F7): the main Mac ranking flaw
- **The moment:** They remember the idea, not the exact words: "what i want today".
- **Thoughts:** "I typed basically its title. Why are these first?"
- **Evidence:** "What do I want today" has **every typed word in its title** yet comes **#27**. The 26 above it are mostly starred notes where "want" and "today" appear somewhere in the body ("God Wants to Ask it Refined", "The Inner Judge & The Kid"…). The same starred notes head nearly every loose query. With the typo "wht", it falls to #75.
- **Why:** In `rank/compare.ts`, "starred" is checked before the score inside a group. In the all-words and some-words groups, a starred note with body-only hits beats an unstarred note with title hits. The ranker's own comment says title hits should weigh more than body hits.
- **Product insight / fix:** Inside a group, the score (where the words hit) should decide before "starred". Use starred only to break near-ties, or give it a small score bonus instead of the first say. Then "every typed word in the title" beats "words scattered in a starred note's body". Add "what i want today" to the ranking tests.

### 7. Find the latest in a series (L8 F7)
- **Evidence:** "CANI Report" returns 20+ identical titles in a row, newest first, on both platforms ✅. The "Type · date" line is the only way to tell them apart.
- **Product insight:** The date line is doing important work for this owner. Keep it on every row in the series case.

### 8. Date words used as plain words (L7 F7)
- **Evidence:** On the phone, "today", "yesterday", "week" and "recent" are always taken as date filters. "lessons from this week" returns 0. On the Mac, these words are plain text unless you confirm a chip ✅.
- **Product insight:** Same fix as #3.

## Key insights

1. **The phone is the blocker.** The goal says "fast and ranked, no timeline" on both devices, but the phone was left out of scope. The test phrase returns nothing there. **Recommendation:** bring the phone onto the shared ranker before this goal ships, or say clearly that the goal covers the Mac only.
2. **On the Mac, starred outranks where the words hit.** One ordering change fixes the half-remembered-title case (deep dive 6).
3. **Searches that come back empty break trust.** Accent-free Czech returns nothing today. Matching "rozhodnuti" to "rozhodnutí" (on both index and query) is cheap and would give this bilingual owner a lot of trust back. Typo tolerance can wait.
4. Minor: the snippet often repeats the title, because notes start with the title as a heading ("God Wants to Ask it Refined Today a big shift…"). Skipping the opening heading in snippets would free up the line.

## Open questions

- Should this goal cover the phone? `update v1.md` says no, but the checklist brief says yes. **The orchestrator needs to decide.**
- Does the owner really type Czech without accents? This is my assumption, so I scored it low.
- Real-device timings (iPhone, Mac webview) are still unmeasured. Someone with the device should type "What do I want today" on a busy day and watch for stutter.
