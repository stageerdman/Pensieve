# UX check: a phone call during a recording (after commit 289e46e)

Columbo, 2026-11-20. **Method:** I read through the code from the user's side (`VoiceRecorderPanel.tsx`,
`voiceCapture.ts`, `captureWatch.ts`, `FormSession.tsx`, `mediaDom.ts`, toast in `PhoneApp.tsx`).
**I did not test this on a real iPhone.** Claims about how iOS presents a call (banner or full screen) are
assumptions, marked ⚠.

## Summary

Bob's fix works for the common case: the app stays open, the call shows as a banner, and the user declines it.
The panel switches to "Paused — mic was interrupted", the audio from before the call is saved, and Resume picks
up the same take. Three spots will still confuse people:

1. **A full-screen call ends the take in the Record spell, and the app gives the wrong reason** ("phone must have
   locked"). It may also show a "Tap Resume" message after the Resume button has already gone.
2. **Messages vanish too fast.** Every toast lasts 1.5 s. The long "something took the microphone…" toast shows
   up while the user is dealing with the call, so nobody reads it.
3. **Tapping Resume while still on a call** gives "Microphone unavailable." (with no reason), or the take
   pauses again straight away.

The raw `err=4(…) ready=0 net=3 slots=1/5` line still appears under "Can't play this recording". The new Repair
button is a good next step for the user. The debug text is not.

## Scope

- **In:** the Record spell panel and the Forms dock recorder, a call that is declined or answered, coming back
  to the app, and playing the take back.
- **Out:** desktop app, transcription, Siri/alarm interruptions (same code path, so I didn't check them separately),
  Bluetooth or headset switching.

## The user's job

"Capture what I'm saying (a thought, a meeting, a walk-through) and don't lose any of it, even if life gets in
the way." A call is the main way life gets in the way. The user's mental model comes from iOS Voice Memos:
*a call pauses my recording, and I tap to carry on afterwards.* So pausing and needing a manual Resume matches
what people expect. Auto-resume isn't needed.

## Behaviors

| Behavior | Likelihood | Frequency | Reason |
|---|---|---|---|
| Decline from the banner, then come back to the take | 8 | 7 | The most common reaction to a call while you're mid-thought. |
| Glance at the timer/label after the call to see "did it keep going?" | 9 | 7 | The first thing anyone checks after an interruption. Trust depends on it. |
| Answer the call, come back minutes later | 7 | 6 | Common for real calls. The user has forgotten the recording state by then. |
| Call arrives full-screen (phone locked / pocket recording / full-screen setting) | 7 | 6 | ⚠ Long recordings are often made with the phone face-down or in a pocket. iOS then shows the call full-screen. |
| Tap Resume while still on the call | 5 | 4 | People want to record the call or think "it's paused, I'll unpause". |
| Play the take back to check the call didn't break it | 7 | 5 | They do this right after the scare, especially those who saw err=4 before. |
| Hit "Can't play this recording" on an old take and tap Repair | 5 | 3 | Only takes from before the fix. Rare but high-emotion. |
| Form walk-through interrupted by a call | 4 | 4 | Fewer users, same situation. |

## Deep dives

### 1. Declined from the banner (works ✓, small gaps)
- **Moment:** mid-sentence, holding the phone, Pensieve open. A banner slides down.
- **Thoughts:** "Not now." Swipe or decline. "Did that mess up my recording?"
- **What they see:** the dot turns paused, "Paused — mic was interrupted", the timer frozen at the moment the call
  came in, and the Resume button. ✓ Clear, and nothing is lost.
- **Friction:**
  - The toast "Recording paused — something took the microphone (a call?)…" is 3 sentences, lasts 1.5 s and
    arrives while the user is looking at the banner. Effectively nobody reads it. The panel label is what works.
  - "Mic was interrupted" is technical. The user knows it was a call, so "Paused — a call took the mic" fits
    their own words better.
  - If iOS fires none of the events, the 3-second stall check catches it. The timer then counts up to ~3 s and
    jumps **back**, which looks like a glitch. Minor.
- **Suggested fix:** keep the reason in the panel, which stays on screen (it's the label). Make the label say
  what to do: "Paused for a call — tap Resume". Drop the toast or make it last ≥4 s.

### 2. Answered, back minutes later (works ✓ if Pensieve stayed on screen)
- **Emotion:** after a 10-minute call they've forgotten the recording. They come back with mild dread: "did it
  record my call? Is my earlier part gone?"
- **What they see:** the same paused panel, frozen timer. ✓ Reassuring, and the frozen timer shows the call wasn't recorded.
- **Gap:** nothing says "everything before the call is saved" on screen (only the vanished toast). Add one quiet
  line under the timer while interrupted: "Everything up to here is saved."

### 3. Full-screen call during the Record spell (confusing ✗)
- **Moment:** ⚠ phone in a pocket or face-down on a table during a long take. The call takes the whole screen, so
  Pensieve is hidden.
- **What happens in code:** being hidden ends the take (`onBackgrounded`, not session mode). The take is saved
  (✓ nothing lost). But:
  - The system notification says **"Recording stopped — Phone locked — saved m:ss"**. The phone wasn't locked.
  - Back in the app, the toast says **"Recording saved — the phone must have locked"**. Wrong again.
  - ⚠ Possible race: if the mic-loss fires first, its toast "…Tap Resume to carry on" can show after the panel is
    gone and there's no Resume button.
  - To carry on, the user has to start a new recording, so the note gets a second audio block. Nothing tells
    them that.
- **Thoughts:** "Locked? I didn't lock it… Where's my recording? Is it two files now?" This hurts trust in the
  exact moment the fix was meant to repair.
- **Suggested fix (product call for the team):** either (a) treat a hide during the Record spell the way Forms
  does: pause and keep the take, so Resume continues one file, or (b) keep finishing it but use a neutral
  message: "Recording stopped when Pensieve left the screen — everything so far is saved. Tap Record to add
  more." Also don't show the "Tap Resume" toast if the take was then finished.

### 4. Resume while still on the call (unclear ✗)
- **What happens:** iOS may refuse the mic, giving the toast "Microphone unavailable." for 1.5 s, or hand back a
  muted mic, which pauses the take again at once and repeats the long toast.
- **Thoughts:** "Is my mic broken? Is Pensieve broken?"
- **Suggested fix:** when resuming after an interruption fails, say why and what to do, and keep it on the panel:
  "Can't use the mic during a call — tap Resume when you hang up."

### 5. Playing the take back / the old err=4 (better, not finished)
- New takes cut at the call are one normal file, so the err=4 cause should be gone for them (not checked on
  device).
- For an old broken take the user sees "Can't play this recording" with a **Repair** button ✓, then a monospace
  `err=4(MEDIA_ERR_SRC_NOT_SUPPORTED) ready=0 net=3 slots=1/5 size=…B` line ✗. To a user that line reads as
  "something is badly broken".
- "No audio found" after Repair is honest but final. Users will want to know whether *anything* was saved.
- **Suggested fix:** hide the diagnostic line behind a small "Details" tap, or show it only in a debug build.
  After a failed repair, say "This take has no audio we can recover" so it's clear it's this take, not all takes.

### 6. Forms walk-through (works ✓, no reason shown)
- A full-screen call pauses the take (session mode), and Record resumes the same file ✓.
- The dock only says "Paused" with no reason, and the explanation is the 1.5 s toast. A user who didn't pause it
  themselves will wonder why. **Suggested fix:** show the same "Paused for a call" wording as the panel.

## Watch out
- **Trust:** wrong reasons ("phone locked") feel small but teach people the app doesn't know what happened.
  That's risky for a "never lose a word" tool.
- **Double files:** a second audio block after a full-screen call may later look like a duplicate and get
  deleted by mistake.

## Open questions
1. ⚠ On iOS, does an incoming call shown as a **banner** while Pensieve is open fire `visibilitychange: hidden`?
   I assume not. Needs a check on a real iPhone. If it does, case 3 is the *main* path, not the edge.
2. Which order do the "mic lost" and "page hidden" events come in during a full-screen call? Getting this on
   device settles the stray "Tap Resume" toast.
3. Should the Record spell keep the take open across a hide, like Forms does? That's a product decision. It's
   flagged above, not decided here.
