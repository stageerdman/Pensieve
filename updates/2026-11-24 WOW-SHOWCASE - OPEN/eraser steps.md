# Step count: the showcase, first-time visitor

**Goal:** see every capture mode, then reach the Mac and ask it something.

Measured with `node showcase/walkthrough.mjs` (real speed, Chrome, 1440×900).

## Before

| # | Step | Verdict |
|---|------|---------|
| 1 | Click **Begin** | Keep: the visitor chooses to start |
| 2–10 | Click **Next: …** after each of 9 scenes | **Automate**: always the same answer ("keep going") |
| 11 | Click **Open your Mac →** | **Automate**: same reason |
| 12–14 | Click a suggested question (×3) | Keep: this is the visitor exploring |
| — | Film acts out the optional Save Video share sheet | **Cut**: an extra that looked required; the guide's note still offers it |
| — | Mac fills 7 cards one after another, then waits 1 s before the chat | **Merge**: fill together, a beat apart |

14 clicks · 114 s watching (plus answers).

## After

- After a scene, Next fills up for 2.6 s and presses itself, all the way to opening the Mac. Under it: "Moving on by itself · click anywhere to stay". Clicking anything else, or hovering the strip, stops it.
- Film ends after "Use Video", without the share sheet.
- Typing, the walk captions and the Form answers run 15–25% faster.
- Mac cards fill together. Chat opens 0.5 s after the last card.

**1 click to the Mac chat** (Begin), then the questions the visitor chooses to ask. 106 s of scenes, plus 26 s of countdowns that any click can cut short.

## Watch later

- If visitors feel rushed reading the "done" line, lengthen the countdown. Don't bring back the Next click.
- Form (14 s), Record and Film (12.5 s) are the longest scenes. If the tour needs to be shorter, trim inside those.
