# Tool picker & web search — UX research (Columbo)

For: Jony (UI) and Uncle Bob (backend). Goal: "Patronus can search the web when I allow it,
chosen from a tool picker in the chat."

## Summary
The owner will hire web search for one job: **"check my thinking against the world without
leaving my own space."** Two moments drive almost all use: (1) starting a research-flavoured
chat and wanting the web *on for the whole conversation*, and (2) getting a stale or guessed
answer and wanting *this one answer redone with the web*. The biggest emotional risk is not
friction; it is **trust**: this is a private journal, and web search is the first time
Patronus sends words off the machine.

**Recommendation (UX flow):**
1. **The picker sits next to Send** (in the composer). It is the only place to *switch tools on/off*.
2. **The choice sticks for that chat** (that agent's conversation) until switched off. Each
   **new chat starts with everything off**. It never carries over between chats or agents.
3. **When on, it is always visible**: a small "Web" chip stays in the composer. One click turns it off.
4. **The three-dots menu under a Patronus reply has one tool action only:** "Retry with web
   search". It is a one-off for that answer and does not switch the chat setting on.
5. **While searching, the reply bubble shows the real query**: "Searching the web: *best
   sleep tracking methods*". This is what left the machine, said plainly.
6. **After the answer:** a collapsed line "Searched the web · 4 sources". Opening it lists
   sources (title + site) as chips, **visually separate from the note chips** (my memories
   vs the internet). A click opens the page in the browser.
7. **If web is off and the question needs it**, Patronus says so in words and offers a
   one-tap "Search the web" button on that reply (same as the three-dots retry).

## Scope
**In (MVP):** desktop Patronus chat (popover + full-screen tab, which share one state), one
tool (web search), the picker, chat vs message scope, the searching state, showing sources.

**Out, and why:**
- Write tools (create/edit/link notes) in the picker. They come later; the picker should
  have room for them but this research does not cover them.
- Phone (the Wand). There is no AI on mobile, by project rule.
- Chat history after restart. Chats are in memory only today, so "sticks for the chat"
  currently means "until the app closes". This becomes an open question once chats persist.
- Per-agent default tools (e.g. Curator never gets web). Listed as an open question.

## Who and when (assumptions)
- One user: the owner, a reflective "thinker" who journals and values local-first privacy.
  *(From CLAUDE.md / VISION.md.)*
- AI use is desktop, for deep work: evenings, weekends, planning sessions. It is not for quick logging.
- They already use mainstream assistants. *Assumption:* their mental model comes from
  ChatGPT / Claude.ai / Perplexity. In those apps tools live in the composer ("+" or a
  "Search and tools" menu), a search toggle usually stays on until you turn it off, and
  sources show as a "Sources" list and inline citations. Message menus hold retry/copy.
  *(From my knowledge of these apps up to mid-2026. I could not live-check them in this session.)*

## Behavior table
Sorted by combined score (L = likelihood, F = frequency, 1–10).

| # | Behavior | L | F | Reason |
|---|----------|---|---|--------|
| 1 | **Keep web on for follow-ups** in the same chat | 8 | 8 | Research chats run 3–10 turns. Re-enabling each turn is the top annoyance in per-message designs. |
| 2 | **Glance: is web on?** before sending | 7 | 8 | Every send in a chat where web was ever on. Matters most before a personal message. |
| 3 | **Switch web on for a research question** | 8 | 7 | It is why the feature exists: "what does the research say about X I wrote about?" |
| 4 | **Forgot to switch on → recover** (answer is stale/guessed, or "I can't browse") | 8 | 7 | Most people ask first and only then remember the tool. Very common in other chat apps. |
| 5 | **Check the sources** after an answer | 8 | 7 | A thinker checks claims. They also check whether the answer came from their notes or the web. |
| 6 | **Watch it search / wait** | 7 | 7 | Web replies take seconds longer. People watch to judge "is it stuck?" |
| 7 | **Mix my notes with the web** ("compare my idea to what's out there") | 7 | 7 | Pensieve's unique value. Notes and web in one answer. This is where privacy is most at risk. |
| 8 | Open a source in the browser | 7 | 5 | Follows #5 for important claims. Less often than just scanning. |
| 9 | Retry one answer with web, without switching it on for the chat | 6 | 5 | Merged into #4 as the recovery path. On its own it is less frequent. |
| 10 | Expect the setting to carry over to a new chat | 6 | 5 | Habit from Claude.ai's account-level toggle. Lower because the vision says "off unless switched on". |
| 11 | Switch agent (Patronus ↔ Curator) and expect tools to follow | 5 | 5 | Agents feel like "the same chat window". Unsure, so scored lower. |
| 12 | Use web for a single message only | 5 | 5 | Power-user precision. Most people won't think in "per message" terms. |
| 13 | Turn web off mid-chat before a private reflection | 5 | 4 | Only privacy-minded moments. Low frequency, but see Watch out. |
| 14 | Type a shortcut ("/web", "@web") instead of clicking | 4 | 5 | Owner is technical (uses Claude Code). Nice later, not needed for MVP. |
| 15 | Save a web finding into a note | 6 | 4 | Natural next step, but it needs write tools. Out of scope. |
| 16 | Open the picker to see what else exists | 5 | 2 | Curiosity, once. Needs honest "coming later" or nothing at all. |
| 17 | Try it on the phone | 2 | 1 | No AI on mobile. Owner knows this. |

## Deep dives (both scores ≥ 7)

### 1. Keep web on for follow-ups (8/8)
- **Moment:** Saturday morning, desk, full-screen Patronus tab, third message into a chat about a
  habit they journaled about.
- **Trigger:** The first web answer was useful. They want to dig deeper.
- **Thoughts:** "Okay, and what about the counter-argument?" They don't think about tools at all.
- **Emotions:** Focused, in flow. Irritated if the flow breaks.
- **Expectations:** Web is still on, because "I turned it on in this chat." Zero extra steps.
- **Success:** Answers keep citing fresh sources without them doing anything.
- **Friction/fears:** Silent reset to off. They get a no-web answer and don't notice why it's worse.
- **Product insight:** **Sticky per chat.** Per-message-only would fail the most frequent behavior.

### 2. Glance: is web on? (7/8)
- **Moment:** Same chat, 20 minutes later. The topic drifts to something personal ("honestly I
  think I avoid this because of my dad…").
- **Trigger:** About to send something private.
- **Thoughts:** "Wait, is this going to the internet?"
- **Emotions:** A small jolt of worry. Relief if the answer is obvious.
- **Expectations:** They can see the state *without opening anything*, right next to where they type.
- **Success:** One glance, one click to turn off, confident sending.
- **Friction/fears:** State hidden in a menu. Or the fear that their sentence itself becomes a search query.
- **Product insight:** Web-on state must be **always visible in the composer**. This is the strongest
  reason the picker belongs next to Send, not in a bubble menu.

### 3. Switch web on for a research question (8/7)
- **Moment:** Evening, popover over a note they just wrote about a book idea.
- **Trigger:** "Has anyone already written about this?" Their own notes can't answer that.
- **Thoughts:** "Let it look this up, it's allowed now."
- **Emotions:** Curious, slightly cautious (first time: "what will it send?").
- **Expectations:** A tools control by the composer, like other chat apps. 1 click to turn on, then type and send.
- **Success:** The answer arrives with sources, and they understand what was searched.
- **Friction/fears:** Having to hunt for it. Unclear whether turning it on applies now or to the next message.
- **Product insight:** Picker next to Send, **off by default for each new chat**, and a clear "on" state before they send.

### 4. Forgot to switch on → recover (8/7)
- **Moment:** Mid-chat, quick question: "what's the latest version of X?"
- **Trigger:** Patronus answers from memory, sounding dated, or says it can't check.
- **Thoughts:** "Ugh, I didn't turn search on. Just redo that one with the web."
- **Emotions:** Mild frustration → wants a fast fix, not a lecture.
- **Expectations:** An action *on that answer*. They don't want to retype the question.
- **Success:** One click and the same question is answered again with the web.
- **Friction/fears:** Having to scroll up, copy, switch on, paste, send. Or Patronus inventing an answer
  instead of admitting it couldn't look.
- **Product insight:** This is the real job of the **three-dots menu: "Retry with web search"** (one-off).
  Patronus should also **say when web would help** and offer the same one-tap button.

### 5. Check the sources (8/7)
- **Moment:** Right after an answer that makes a claim they want to rely on.
- **Trigger:** "Where did that come from — my notes or the internet?"
- **Thoughts:** "Is that a real study? Which site?"
- **Emotions:** Skeptical → reassured, or annoyed if sources are vague.
- **Expectations:** Sources under the reply, near the note chips they already know, with title + site.
- **Success:** They can tell at a glance which parts came from their memories and which from the web.
- **Friction/fears:** Web sources looking like note chips (confusing "my thought" with "a website").
  Dead or invented links.
- **Product insight:** Show **"Searched the web · N sources"**, expandable. Make web chips **visually
  distinct** from memory chips. Only list sources the search actually returned.

### 6. Watch it search / wait (7/7)
- **Moment:** After sending with web on. The reply takes noticeably longer than usual.
- **Trigger:** The "…" sits there.
- **Thoughts:** "Is it stuck? What is it doing?"
- **Emotions:** Patience runs out after a few seconds of silence.
- **Expectations:** A live line in the bubble, "Searching the web: *query*", then the text streams in.
- **Success:** They know it's working and *exactly what was searched*.
- **Friction/fears:** No progress signal. A hidden query that might contain private words.
- **Product insight:** The searching state **shows the actual query text**. It's both progress and privacy proof.

### 7. Mix my notes with the web (7/7)
- **Moment:** Weekend planning session: "Compare my goals from last month with what experts recommend."
- **Trigger:** Pensieve's unique power: their memory + the world.
- **Thoughts:** "It should read my notes *and* look things up. But it shouldn't post my notes anywhere."
- **Emotions:** Excited by the idea, uneasy about leakage.
- **Expectations:** It reads their notes locally and searches only general terms.
- **Success:** The answer weaves both, sources are separated, and the queries shown are generic.
- **Friction/fears:** Seeing a query like "my anxiety about leaving my job at [company]".
- **Product insight:** Showing the query (dive 6) is essential here. *Assumption for Uncle Bob:* the agent's
  instructions should keep search queries generic and leave out personal details from notes.

## Watch out (low score or edge, but could break trust)
- **Private words in a query.** The worst outcome. The visible query plus a "keep queries generic"
  instruction are the guards.
- **Web left on, forgotten.** A personal message sent hours later. Guard: the always-visible
  chip, and new chats start off.
- **Web content treated as memory.** If web findings ever get written into notes (later write tools),
  they must stay marked as coming from the web.
- **Web pages giving the AI instructions.** Once write tools exist, a web page could try to make
  Patronus edit notes. Flag for whoever enables write tools. Not an MVP UX issue.
- **Invented sources.** One fake link ruins trust in all sources. Only show what the tool returned.

## Key insights
1. **Picker next to Send. Three-dots = one-off retry only.** Switching tools on is a "before I ask"
   decision, and the state must be visible while typing. The bubble menu fits the "after a bad
   answer" moment.
2. **Sticky per chat, off for every new chat.** This serves the most frequent behavior (follow-ups) and
   keeps the vision's "nothing on unless switched on" without carrying risk across chats.
3. **Show the query, separate the sources.** Trust in a private journal app depends on seeing what left
   the machine and what came from outside.

## Open questions
- When chats are saved across restarts later, should web stay on in a reopened old chat? *(My lean: no,
  reopen as off. Unverified.)*
- Should some agents never offer web (e.g. Curator)? That is a product decision for the owner.
- Should the first-ever web search ask a one-time "Patronus will send search words to the web" confirmation?
  It would help trust once, but it is added friction. Worth asking the owner.
- Can the backend reliably surface the exact query text and returned sources from the CLI's web-search
  tool events, the way it already does for note chips? (Uncle Bob)
