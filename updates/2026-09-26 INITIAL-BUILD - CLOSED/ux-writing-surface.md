# UX spec — writing surface (v1)

Produced by a UX-expert agent (WORKFLOW.md orchestration). This drives the build.

## Decisions locked
- **Two regions only:** collapsible sidebar (flat, reverse-chron notes list) +
  editor. **Timeline is a summoned per-note overlay (`⌘T`)**, never a standing column.
- **Title = first line** of the note (H1); `.md` filename slugified from it.
- **Create:** `⌘N` → instant empty editor, cursor placed, no dialog.
- **Autosave:** debounced ~500ms + on blur / note-switch / window-close, async,
  never blocks typing. Feedback is a whisper bottom-right (`Saving…` → `Saved`,
  then fades). No save button, no unsaved nags. `⌘S` = reassurance no-op.
- **No persistent toolbar.** Formatting = markdown-as-you-type (primary) +
  selection bubble (Bold/Italic/Link/Code) + slash menu (`/`) for block insert.
- **Format set (ceiling = standard Markdown):** H1–H3, body, bullet/numbered
  list, to-do, quote, code block, divider; bold/italic/inline-code/link/strike.
  Excluded: tables, images/embeds, callouts, colors, nested pages, columns, math.
- **Timeline = per writing session** (session closes on ~2min idle or note
  switch): one entry with net word delta + `created` badge on first. Stored in a
  sidecar (`.pensieve/<note>.timeline.json`) so the `.md` stays pristine.
  Read-only in v1 (no restore/diff). Ambient `●` dot on the sidebar row.
- **Focus mode (`⌘.`):** hide sidebar + top strip; typewriter scroll + paragraph
  dimming on by default.
- **Cut from v1:** folders, tags, colors, sync, accounts, export, images,
  stats/streaks, timeline diffing/restore, multi-window, AI. If it isn't
  *writing* or *seeing what you added when*, it doesn't exist yet.

## Keyboard shortcuts
Global: `⌘N` new · `⌘K` search/open · `⌘T` timeline · `⌘\` sidebar · `⌘.` focus ·
`⌘↑/⌘↓` prev/next note · `⌘⌫` delete (→ OS trash, undoable) · `⌘⇧L` theme · `Esc` dismiss.
Blocks: `⌘⌥0..3` body/H1–H3 · `⌘⇧8/7` bullet/number · `⌘⇧9` todo · `⌘Enter` toggle
todo · `⌘⇧.` quote · `⌘⌥C` code · `/` slash · `Tab/⇧Tab` indent.
Inline: `⌘B/⌘I` bold/italic · `⌘E` inline code · `⌘K` link (on selection) · `⌘⇧X` strike.

_Full spec preserved from the UX agent; the build implements the core first and
notes anything deferred in wiki.md._
