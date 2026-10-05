# UX.md — Pensieve UX/UI vision

How Pensieve should **feel and behave**. Complements `design.md` (visual tokens /
the look) and `VISION.md` (the product). Read before designing any user-facing flow.

## North star
**Magical AND highly practical.** The UI disappears around the thoughts. Finding and
orienting should feel like magic — but with real intelligence behind it, not just
pretty visuals. Delight matters: the small joy of rediscovering a past thought is a
feature, not an accident.

## The memory object — flasks
Thoughts are little glass **flasks / vials** of captured memory (from the "Strands &
Vials" concept the owner loved). Capturing a thought = pouring it into a flask.
Serendipity — stumbling back onto an old note, "mixing things up" — is desirable and
fun, and should be designed *for*, not treated as noise.

## The importance engine — DECIDED (the magic behind the practicality)
Surface what matters using a **transparent, steerable blend of signals already in the
data** — no manual bookkeeping required:
- **pins** — explicit "on my mind / working on this"
- **revisit frequency** — how often the thought is opened
- **highlights** — passages the owner marked as important
- **links / relationships** — a well-connected thought is a central one
- **(future) AI-judged importance**

Importance drives ranking, size, and brightness — the single legible axis
"**near / bright = matters now**." Always show *why* something surfaced (e.g.
"pinned · revisited 11× · 3 links"), let the owner **steer the weights**, and offer a
"**Stir**" that resurfaces important-but-forgotten thoughts (high standing, low
recency). This is the locked foundation that the orientation UX is built on.

## Concepts — retained vs dropped
From the vision exploration (`updates/2026-10-05 PENSIEVE-VISION/`):
- **The Surface** — *home.* Importance rises: a calm pool of flasks where what matters
  floats to the top. The practical reimagining of The Basin. **Keep.**
- **The Basin** — the **visual / atmospheric north star** (silver memory-mist on ink
  dark; the pour ritual). **Keep as the look.**
- **Summon** — an *Accio*-style, keyboard-fast, super-fast magical **search**. Not the
  home — a ⌘K retrieval layer. **Keep as inspiration for the search engine (later).**
- **The Mind Map** — fascinating but not actually useful. **Dropped.**

## Working rule
Iterate with **at most two concepts at a time** from here on.

## The behaviours to make trivial (the real activities)
"Getting an overview of my thoughts" is really these concrete activities:
1. **Working set** — returning to the thoughts currently being worked on → these are
   **pinned**.
2. **Topical shelves** — pulling up every thought on a topic, e.g. all thoughts tagged
   `@Sales Mindset` — as a **shelf / basket the owner creates on demand**, whenever a
   need arises.
3. **Reviews** — a **weekly review** (go through every thought from the week), a
   **monthly review** (go through every weekly review), and so on — a temporal rollup.

### The principle we're chasing (next concept round)
Don't build three separate features. Find **one simple, scalable behaviour** that makes
*all* of these the same easy action. Leading hypothesis: **"shelves / collections" as
one universal container** = a saved lens over the flasks. Pinned (working set), topical
(a tag/query), and temporal (this week / this month) are all just *shelves* — some
automatic, some made on demand — and **reviews are simply stepping through time-shelves**.
Must be easy, scalable, and not bespoke per use case. This is the brief for the
two-concept round that follows.
