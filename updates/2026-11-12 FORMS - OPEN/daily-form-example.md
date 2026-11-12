# The first form to replicate — "Daily Review" (owner's real form, verbatim)

**If this was the last day of your life, how satisfied are you (1-5):**

*1: I could delete it (blank page)
2: Background noise (mildly boring, one or two things happened)
3: I enjoyed the day (fine day, some parts were nice or fun)
4: Mini high (joy, connection, growth, good energy)
5: Core memory (full of energy, alive, excited, fulfilled, aligned)*

**Sales Progress Tracking**

- [ ]  Hour of Power
- [ ]  Mindset. Giving to god before every call.
- [ ]  Acquisition. Recordings uploaded, transcribed, analyzed, and conditioning improved.
- [ ]  Conditioning. At least 30 minutes of repeating questions or frames.

**Was I a king? What can I do next time to be more of a king?**

**Freeform**

**How this day shaped my or other's life or character:**

-

**What effort can I reward today? 🏆**

1.

**What I feel I failed at today? → What's the lesson?**

-

**Life Success Tracking**

- [ ]  Body Movement
- [ ]  PEAK - Walk, talk sit like a BOSS
- [ ]  Celebrating Wins

**Mr Nice Guy Fights**

**Traits**: Ownership, Honesty, Fortitude, Confidence, Intentionality, Assertive

**Questions**: Where have I shown trait today? Where I wish I'd shown it but I didn't? Why?

---

## Field types this one form already implies (first-pass analysis — to be validated by the prototypes)
| Field | Example in the form | Answer shape |
|---|---|---|
| **Rating scale** with labelled anchors | "Last day of your life… (1-5)" + 5 anchor descriptions | one integer 1..N; anchors are guidance |
| **Checklist** (habit/tracker) | Sales Progress Tracking, Life Success Tracking | set of booleans per fixed item |
| **Open question** (long answer) | "Was I a king?…" | free rich text |
| **Freeform** section | "Freeform" | free rich text, no prompt |
| **List answer** (bulleted) | "How this day shaped…", "Failed at → lesson" | N bullets, user adds items |
| **Numbered list answer** | "What effort can I reward today? 🏆" | N numbered items |
| **Guided prompt with reference text** | Mr Nice Guy Fights: Traits list + Questions | static guidance + free answer (maybe per-trait) |
| Two-part answer | "Failed at → lesson" | pairs (failure → lesson)? |
