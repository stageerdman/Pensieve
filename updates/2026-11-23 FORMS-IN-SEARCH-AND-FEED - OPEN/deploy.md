# Deploy — 2026-11-23

Shipped from branch `studio/rebuild-the-mac-app-and-deploy-the-phone-46e6c6f3`: `main` at
`7eaea2d` plus the two walk-through fixes, `4567db8` (the phone never forgets a form) and
`e78980e` (Form chip only from "form").

Before shipping: `npm test` passed (1,700 tests, 198 files). `npx tsc --noEmit` and
`tsc -p phone/tsconfig.json` passed. Nothing in the vault was changed, so no backup was needed.

## Phone (the Wand)

- `npm run deploy:phone` → https://5f2942e1.pensieve-phone.pages.dev (branch `main`).
- Checked: https://pensieve-phone.pages.dev serves the new bundle `index-B6upjqsF.js`, which
  has the new "form"/"forms" rule and no longer has the old `"forms".startsWith` prefix check.
- The installed PWA picks this up the next time it is opened online.

## Mac

- `npm run tauri:build` → installed `/Applications/Pensieve.app`. The binary was built
  **2026-11-23 06:02 UTC**, after both fixes. The build-tree copy was removed, so only one
  `Pensieve.app` exists. Its web bundle `dist/assets/index-DHlL57zE.js` has the new rule.
- The installer quit the running app. **Reopen Pensieve** to get the new build.

## Check on the real vault (read-only)

I ran the shipped code (desktop: `completionsAt`, `runSearch`, `memoryFromForm` +
`inheritLabels`; phone: `formSuggestion`, `noteFromRemoteContent`, `planForget`) on the owner's
vault: 2,123 memories, 2 forms. The temporary script is deleted.

| Check | Result |
|---|---|
| Form chip offered for `fo` / `for` / `plan for` / `food` | No, on Mac and phone ✅ |
| Form chip offered for `form` / `Forms` | Yes, on Mac and phone ✅ |
| Form filter on Mac | CANI, Weekly reflection ✅ |
| New memory from CANI | Journal + @CANI ✅ |
| New memory from Weekly reflection | Journal + @Weekly Reflection ✅ |
| Phone window on 30 Nov (both forms last opened 15 Nov) | Forgets 2,076 old memories; keeps both forms ✅ |

## Not checked on screen

No GUI driver or iPhone was available, so I did not see the form flask in the feed on screen.
Its drawing code and tests (Flask, FlaskPicker, phone flaskSvg) are in both builds. The owner
should look once after reopening the app.

## Still open

- The 3 CANI entries from 16–18 Nov still have no labels. A backfill waits for the owner's OK.
- The "Start from" buttons still show the generic icon instead of the form's own flask.
