# Live check after the deploy (Jony, 23 Nov, 15:40)

Goal: a form's flask shape can be picked and sticks after a sync. Every form is on the
phone and usable there after a fresh sync.

## Result: nothing broken found. Two screen taps are still owed.

| Check | How | Result |
|---|---|---|
| Installed Mac app runs the fix | App log: last start 14:31:04, after both fix commits (14:26, 14:29) | ✅ |
| Mac publishes the form flag to the phone | Rebuilt notes-index.json from the vault (`check-index.mjs`) and compared it with the hash the app last uploaded (`sync/state.json`) | ✅ Exact match **with** `f: 1` on both forms (`13xadw:232913`). Without the flag the hash is `oztj5q:232901`, so the uploaded index is the new one |
| Chosen shapes are saved and survive syncs | Form frontmatter + listing cache, read after 60+ syncs since 14:19 | ✅ CANI `round-bottom/h310/50/25`, Weekly reflection `teardrop/h137/50/75`, both still `form: true` |
| Live phone site runs the shape fix | Fetched pensieve-phone.pages.dev, `assets/index-D8FvPvDU.js` | ✅ `drawShape` is there: a form draws its own shape, a memory never draws the form flask |
| Live phone site keeps and brings in every form | Same bundle | ✅ `belongsOnPhone` (`index.get(id)?.f \|\| inWindow`) is used for keep, bring-in, the sync pull and cloud restore |
| Mac picker offers a shape on forms | Code: `FlaskPicker` with `form` shows 7 shapes (Form flask + 6) and `App.tsx` passes `form` | ✅ by code and Uncle Bob's tests (I didn't run them: this checkout has no `node_modules`) |

## Not done: needs hands on the devices

I can't tap an iPhone or click in the Mac app. These two checks take about a minute for the owner:

1. **Mac:** open CANI → click its flask → pick **Conical flask**. Wait one sync (about 1 min), then quit and reopen the app. It should still be conical.
2. **iPhone:** pull to sync twice (the first pull gets the new index, the second brings in any missing form). Tap "fill a form": both CANI and Weekly reflection should be listed, in their own shapes. Open one, answer a question, tap Done.

If either one fails, the app logs will show it (`npm run logs -- --module sync --since 1h`).

## Small observation (not a bug, no action)

On the phone, a memory being filled from a form wears the form's shape while it's a draft
(`PhoneApp.tsx:861`). So today's CANI draft is a round-bottom flask, like its form. On the
desktop, a memory made from a form copies no icon (`lib/forms` has no icon code), so it gets
the default vial. This only matters if the owner finds it
hard to tell a form from its copy, the open question from the user test.
