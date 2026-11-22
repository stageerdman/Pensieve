# Search results — one flat list, best match first (Mac + phone)

**User goal (#2 in user-model):** "find that thought again." When they search, they want
the answer, not a calendar. Date order buries the best match under whatever was touched
last. The date rail asks them to think about *when*, while they're asking *what*.

## What was removed, and why
| Removed | Why |
|---|---|
| Date rail + date buckets while searching (Mac) | Search asks *what*, not *when*. A relevance list can't also be grouped by date. |
| The "Starred" lead section (Mac) | It was a patch to get relevance into a date view. In a relevance list, starred text matches simply rank first, so no section is needed. |
| "IN TITLE / IN TAG / IN NOTE" reason label (Mac) | The highlight already shows where it matched. One less line per result. |
| The large flask grid while searching (Mac) | Results are for scanning words. A 64px flask per result means 6 results on screen instead of 12. The flask stays, at 28px, as the memory's face. |
| The filtered timeline reel behind a held query (phone) | When the keyboard drops, the phone used to fall back to the date-ordered reel, so the best match was lost. Now the ranked list stays until the search is cleared. |
| The 30 newest memories in the sheet when nothing is typed (phone) | That's just the timeline again, dimmed. With nothing typed, the sheet shows only recent searches, and the timeline stays visible behind. |
| Body-start snippet (phone) | It showed the first line of the note, not the words that matched. The snippet now centres on the match. |

## Flow
1. **At rest:** the timeline (Mac date-rail grid, phone reel).
2. **Typing** (Mac: the Summon bar; phone: Accio): the timeline is replaced by **one flat
   list, best match first**. Each keystroke updates it in place, with no fade and no scroll jump.
3. **Holding a query** (phone keyboard drops / Mac focus leaves the bar): the list stays.
   The query stays visible (phone: in the dock; Mac: in the bar).
4. **Opening a result** (the memory opens) and coming back: the same list, same query.
5. **Clearing** (Esc, ×, emptying the field, or tapping the dock query on the phone): the
   timeline comes back. Mac: fades in at the top, the way Home always opens. Phone: the
   reel returns to where it was before the search (the existing `preSearchTop`).

## A result (the one component)
```
[flask]  Title with the matched word highlighted                 
         …the words around the match, matched words highlighted…   (2 lines Mac, 1 phone)
         Journal · 12 Nov 2026                                     (quiet: muted, smallest size)
         ▸ "spoken words" 2:14                                     (Mac: transcript jumps, if any)
```
- **Title:** one line, truncated. Every matched term is highlighted, not just the first.
- **Snippet:** the body around the first match (`makeSnippet`, shared by Mac and phone),
  with the matched terms highlighted. If the match is in the title or a tag only, the
  normal excerpt shows, plain.
- **Meta:** `Type · date`. Type is the memory's first category (Journal, Idea…). If it has
  none, only the date shows. The date is the created date: absolute on the Mac, and the
  phone's existing created label.
- **Starred:** a small star halo on the flask. There's no other special treatment, because rank does the lifting.
- **Highlight:** the existing accent `mark` style on each platform. Nothing new.

## States
| State | Mac | Phone |
|---|---|---|
| Not searching | Timeline (unchanged) | Reel (unchanged) |
| Search open, nothing typed | Timeline (the bar is part of Home) | Sheet shows recent searches only, with the reel dimmed behind |
| Results | Flat list, centred column (max 680px) | Flat list above the bar/dock, best match nearest the thumb (bottom) |
| Body index still building | Title/tag matches show at once; body matches appear in place when the index is ready | n/a (phone filters in memory) |
| Holding a query | List stays (focus can leave the bar) | List stays above the dock's Accio bar; the reel is hidden, not dimmed |
| No results | Empty flask + "No thoughts answer that summons" + "Try fewer words, or press Esc to see everything." | "Nothing answered the summons." in the sheet |
| Many results | First 50 rendered, then 50 more each time you near the end (no button) | First 30, as before (scroll) |

## Build map
- Mac: `src/features/gallery/SearchResults.tsx` (list + paging) → `SearchResultRow.tsx`
  (row, `resultMeta`), keys from `cardKeys.ts`, marks via `components/Highlighted.tsx`;
  wired in `Gallery.tsx` (`searchActive` → list instead of the date rail).
- Phone: `phone/src/components/accio/SearchSheet.tsx` (mounted while searching OR holding
  a query) → `SearchResultRow.tsx` (`resultSnippet`, `resultWhen`); CSS in `styles/wand.css`.
- Shared: `src/lib/search/snippet.ts` (`makeSnippet`, `markTerms`).
| Remote (older) memory on phone | n/a | Title only, the flask pulses while it's fetched (unchanged) |

## Interaction + accessibility
- **Mac:** each result is a `button` in a `list`. Tab/Shift-Tab moves between them. Enter
  opens; ⌘/Alt-Enter or ⌘-click opens in the background; Space peeks; W adds to the working
  set; S stars; Shift-F10 or right-click opens the context menu. These are the same keys as
  a gallery card, from one shared handler.
- **Screen readers:** the list is labelled "Search results, N". Each row's label is
  "Title, starred, Journal, created 12 Nov 2026".
- **Tap targets:** phone rows are ≥ 58px tall, and Mac rows are full-width click targets.
- **Contrast:** meta uses `text-muted` at the smallest size, which already passes on both themes.

## Order (owned by the backend)
The view never sorts. `runSearch` / `rankSearch` return results already ordered best-first.
Until Uncle Bob's scorer lands, `src/lib/search/rankResults.ts` provides the order:
starred text matches → title → tag → body → filter-only, newest-updated first within each
group. It is deleted when the scorer lands.

## Assumptions (to check)
- With nothing typed, the phone sheet showing only recent searches (no memories) won't feel
  empty. *Check:* ask the owner after a week whether they reach for the sheet to browse.
- Returning Mac Home to the top on clear (rather than to the old scroll spot) is fine,
  because Home always opens at the top. *Check:* watch for "I lost my place" reports.
- First category is a good enough "type". *Check:* whether the owner ever asks "is this a voice note or a journal page?"
