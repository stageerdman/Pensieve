# Phone Patronus spell — design spec (Phase 4, phone parts of 5 + 6)

## The user goal
"Tell the computer to do something with this memory later, without thinking about it."
The owner is on the phone, usually just after capturing (a recording, a few lines). They
want to leave an instruction and walk away. They come back later to see whether it was done,
and to take it back if they don't like the result.

## What was cut, and why
- **No separate recorder for the command.** The iOS keyboard's dictation mic works in the
  spell's text field. It gives text right away that the owner can read and correct *before*
  the spell is cast, with zero new UI. A hidden recording that only the Mac can read is
  heavier and can't be checked. The block format still keeps a `voice:` line and the phone
  carries it verbatim, so a spoken command can be added later without a format change.
- **No "Run again".** Want another spell? Add another block. One action fewer on Done.
- **No "Running" state on the phone.** The Mac never writes it (one write per run), so the
  phone can't know it. Faking it would lie. "Being cast" is shown where it is true: the
  Process queue on the computer.
- **No command syntax, no options, no picker.** The instruction is plain words.
- **No delete button.** The block is removed like any other block (backspace next to it).
  The sync hint follows the body, so removing the block also cancels it.

## Flow
1. In a memory: Spell Menu → **Patronus** (conditional ring, before Delete).
2. The spell appears at the caret (or at the end) with the keyboard up in its field.
3. Type or dictate. It saves as you type, like the rest of the memory.
4. Close the memory. On the next sync the computer casts it.
5. Later: the block reads **Cast** with what was done, and **Undo**.

## The block — a conditional spell
```
 ◉  WHEN SYNCED · PATRONUS CASTS                     (trigger line, 12px muted, caps)
 ┃  Make a bullet list of the dreams, then remove      (the incantation: 16px italic,
 ┃  the recording.                                      left accent rule = the scroll)
    Waits for the computer                             (status, 12px muted)
```
- The orb is the existing Patronus orb, so it matches the package/form block.
- The trigger is shown first and plainly: the spell is *conditional*.
- One accent colour (the rule + orb). Danger only for Fizzled. No gold, no shadows.

## States
| Block state | Orb | Status line | Instruction | Action |
|---|---|---|---|---|
| `pending` (armed) | still, dimmed | "Waits for the computer" | editable | — |
| `done` (cast) | breathing | "Cast · 22 Nov, 14:05" + each `did:` line; "Moved to Trash: …" per `removed:`; the `undo:` note if the Mac refused an undo | read-only | **Undo** (hidden if an undo was refused) |
| `failed` (fizzled) | danger, still | "Fizzled — <error>" | editable (fix the words) | **Try again** |
| `undo` | still, dimmed | "Undo waits for the computer" | read-only | — |
| `undone` | none (muted) | "Undone" | read-only, muted | — |
| no `state` line (forms, packages, legacy) | as today | as today | read-only | — (unchanged) |

Transitions written by the phone (Uncle Bob's contract):
new → `pending` · Try again: `failed` → `pending`, `error` cleared, `run` kept ·
Undo: `done` → `undo`. The frontmatter hint `patronus: pending` is derived from the body
on every save: present iff some block is `pending` or `undo`; never added to a memory
without one, so every other memory's bytes are unchanged.

## Details
- Empty instruction: placeholder "Tell Patronus what to do. Write or dictate." An empty
  pending block is never runnable, so a stray tap costs nothing.
- The field grows with its text (no inner scroll). Tap targets ≥ 44px for the buttons.
- The block is `contentEditable=false` like every block; the field is a real `<textarea>`
  so the iOS keyboard, dictation, autocorrect and VoiceOver all work natively.
- Field keys and taps don't reach the note editor (no title-Enter handling, no double-tap
  word selection), so editing the rest of the memory is unchanged.
- Screen reader: the block is a `group` labelled "Patronus spell, <status>"; the field is
  labelled "Spell for Patronus"; the status line is `aria-live="polite"`.
- Reduced motion: no breathing.
- The reel preview never shows the spell (already stripped today).
- Form templates: the spell is not useful there (the Mac never runs it), so casting
  Patronus in a form template shows a short note instead of adding a block.
