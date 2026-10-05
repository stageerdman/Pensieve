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
- **The Basin** — **loved; keep AND maximise (do NOT drop it).** Not just the look —
  explore making it the centrepiece / home canvas that actually shows memories. Strong
  candidate: the Basin IS the overview that shows *all* flasks at once (see round-3
  notes below).
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

## Round-3 review — owner notes (2026-10-05, continue later)
Reactions to the two "shelves" concepts (`shelves/01-shelves.html`,
`shelves/02-memory-desk.html`):

1. **No hardcoded baskets/buttons.** The "basket" framing felt a bit annoying because
   it reads as pre-baked features (a "Weekly review" button, pre-made baskets). The
   owner does NOT want fixed features per use case. Instead: **one fast, fluid
   interaction that quickly pulls up exactly the info asked for**, on the fly. ("This
   week" as a *lens* is fine; "This Week" as a hardcoded basket/button is not.) So:
   keep **shelf = saved lens** as the underlying MODEL, but deliver it as an **ephemeral,
   summoned, on-demand interaction** (closer in spirit to **Summon**) — not a rail of
   permanent baskets or dedicated review buttons.

2. **Keep and MAXIMISE the Basin.** The owner really loves the Basin visual and felt it
   got dropped. Decision: **do not drop it — find how to make the most of it.** Leading
   idea: the Basin is the **home overview that shows all the flasks** (the memory pool),
   with importance surfacing what matters.

3. **The overview must show ALL flasks at once.** The Shelves rail was *comfortable to
   work with*, BUT only showing one shelf's flasks at a time isn't useful — the owner
   wants to **see everything simultaneously** (a true overview of all memories), then
   fluidly focus/filter down. Seeing-everything is a requirement, not optional.

### Working synthesis for next round (to validate, ≤2 concepts)
A **Basin-centred home that shows ALL flasks at once** (importance surfaces the ones
that matter), combined with a **single fluid "summon a lens" interaction** that
instantly narrows to what you need (pinned / a #tag like @Sales Mindset / a time range
like this week) — lenses applied live and ephemerally, **no hardcoded baskets or
review buttons**. Reviews = narrow to a time-lens and step through; sealing a review is
an action, not a pre-built feature. Fuses Basin (visual + all-at-once) + The Surface
(importance) + Summon (fast fluid lens) + shelf-as-lens (the model, made ephemeral).

**Status: PAUSED — owner will continue later.**
