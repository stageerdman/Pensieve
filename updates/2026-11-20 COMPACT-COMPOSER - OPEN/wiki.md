# COMPACT-COMPOSER: wiki

## Durable decisions
- **Status markers inside the field, not beside it.** Each fixed-width control in the
  composer row comes straight out of the text width, and that matters most on the
  300px popover. A status that matters ("this may go to the internet") goes inside
  the field, at the trailing edge, and only while it is true.
- **The default state gets no marker.** Off is safe and normal, so it shows nothing.
- **Commands live in text, behind `/` at the very start of the field.** That's one
  pattern for every future tool, with no new buttons. The start-only rule and the
  "no match → send as text" rule mean a message can never be swallowed by the menu.
- **Each command's row title is the action Enter will take.** That's why a single
  toggle command is safe.
- **We reuse the editor's `slashNav` keyboard reducer and the `.pensieve-slashmenu`
  skin.** There's one slash-menu look and one key map across the app.

## Lessons
- The old tool picker (PATRONUS-WEB-TOOLS Phase 3) fixed "is web on?" but cost about
  70px. Send cost about 60px more. Together they left about 135px for text on a 300px
  window. That's where the "huge box" came from.
