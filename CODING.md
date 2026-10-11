# CODING.md — how to write UI code

Conventions that keep the UI modular, reusable, and surgically editable. Pairs with
`STRUCTURE.md` (where code lives) and `design.md` (the visual standard). Referenced by
`CLAUDE.md` Core Principles 1 & 3.

## Modularity & reuse
- **One logical element, one file.** If you're scrolling a file to find "the other part,"
  it's two files.
- **Never build the same thing twice.** Before writing an interaction (dismiss-on-outside-
  click, press-becomes-drag, a popover shell), check for an existing shared hook/component.
  Two real callers → extract a shared primitive; don't pre-generalize before the second.
- **Parents govern children.** A small set of base components (`Button`, `IconButton`,
  `Panel`, `Toast`, `LabelChip`, `Flask`, `Editor`) that everything composes from. Change a
  parent → change the whole app. Don't hand-roll one-off variants of what a parent provides.

## The pure-module ↔ hook ↔ component split (non-negotiable)
Logic that is math-on-data (parsing, ranking, geometry, spring physics, state reducers,
word-boundary finding) goes in a **pure module** with zero DOM access, unit-tested against
fixed inputs. **Hooks** own the imperative DOM/event/rAF/timer wiring and call the pure
modules. **Components** render markup + the hook's output and never re-derive logic.
- A component with a 40-line `useMemo` of real branching logic is a smell → that logic is a
  pure function the component should import.
- Decision/derivation logic (e.g. "which sync phase shows which copy/action") belongs beside
  its type in `lib/`, not inside the component — so a second consumer can reuse it.

## Animation & gesture code (the phone, and any rAF UI)
- **rAF physics write to the DOM via refs and bypass React's render cycle.** Never drive a
  60fps loop through `setState` — mount the nodes once, then mutate `transform`/`opacity`/
  CSS custom properties directly in the rAF callback. Port physics formulas verbatim into
  pure modules and unit-test them against their tunables; do NOT re-approximate hand-tuned
  feel with a generic animation library.
- **Focus for the mobile keyboard must be synchronous inside the user gesture** — never from
  an effect or timeout, or iOS won't raise the keyboard. Derive "keyboard up" from
  `visualViewport`, never from focus.
- **contenteditable is an uncontrolled node** React must not re-render while the user types
  (hold it by ref).
- Native listeners for order/passivity-sensitive handlers (`{passive:false}` touchmove
  guards, post-native-pass selection overrides) go through `useEffect` + `addEventListener`,
  not JSX `onX` props.

## Styling
- **Tokens, not literals.** Colour/spacing/type/radius come from the token scale
  (`design.md`), consumed as Tailwind utilities (`bg-surface`, `text-text-muted`,
  `text-xs`, `rounded-lg`). No raw hex, no `hsl(43 92% 55%)` literals, no arbitrary
  `text-[13px]`/`rounded-[22px]` — if a value isn't in the scale, add it to the scale.
- **Inline `style` is for COMPUTED geometry only** — a position from a measurement, a hue
  from data (`hsl(var(--flask) ...)`). It is NOT an escape hatch for static styling that
  belongs in a class. If the value is a constant, it's a class.
- **Z-index is a managed scale**, not per-component guesses. Use the documented layers; if
  you need a new layer, add it to the table in `design.md`, don't invent a `z-[9999]`.

## Debugging & logging
All non-trivial code paths log through the one central logger (`lib/logger`) — level,
module, event, session id, relevant data — into the capped searchable store. When a bug is
reported, read the logs first. Don't `console.log` in shipped paths.

## Testing
- Test the pure layer hard (logic, risky paths, silent-regression risks); skip trivial glue.
- Gesture/phone code is verified with the **jsdom technique** (shims for `visualViewport`,
  `PointerEvent`, `Element.prototype.animate/setPointerCapture/scrollTo`) under Vitest —
  drive the real DOM and assert on classes/structure. See the phone update's wiki.
- After tests pass, verify by running the actual thing (app build / dev server / on-device),
  not just green tests.

## Commits
Small, focused, one logical unit; commit AND push after every working change. Behavior-
neutral refactors are their own commits, separate from behavior changes.
