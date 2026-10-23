# Wiki — SYNC-CONFLICT-UX

## Lesson: a "resolve" action and a "sync" action are different things
The original `keepLocal` conflated two separate concerns: "I've made my choice for
this note" (a pure local-state write, cheap, should be instant) and "now propagate
everything" (a full two-way sync, expensive, should never block UI). Coupling them
meant the cheap action inherited the expensive one's blocking behavior. The fix
pattern — resolve instantly and locally, defer propagation to a debounced trailing
sync — is a general one: watch for any other "do a small thing, then immediately
force a full refresh" coupling in this codebase.

## Lesson: a serial promise queue is a lightweight alternative to a mutex
Concurrent calls that each do their own read-modify-write against the same on-disk
state file (`vault.readState()`/`writeState()`) can race if allowed to run in
parallel. Rather than adding real locking, chaining each call onto a single
`Promise` ref (`queue.current = queue.current.then(run)`) serializes them for free
— and a trailing action (the debounced sync) chained onto the SAME queue is
guaranteed to run only after every already-queued item finishes, with no separate
coordination needed.

## Lesson: a React-state-only "is this already happening" guard can race itself
Two synchronous calls to the same handler in the same tick (e.g. a genuine
double-click, or two test assertions back-to-back) both read the SAME stale
`useState` snapshot before either one's `setState` has committed a re-render — a
state-based re-entrancy guard will let both through. Use a `useRef` for the guard
(mutated synchronously, no render needed) and keep the `useState` twin purely for
what the UI needs to render.

## Lesson: a timer stored in a ref needs an unmount cleanup, always
`followUpTimer.current = setTimeout(...)` with no `useEffect` unmount cleanup is a
real bug, not just a test artifact — found via cross-test pollution (a previous
test's un-cancelled real timer fired during a later test and inflated its call
count), but the same thing happens in production if the sync panel's owner
component unmounts with a debounce in flight: the timer still fires and calls
`setState` on a gone component. Any `useRef`-held timer/interval needs a
`useEffect(() => () => clearTimeout(...), [])`.

## UX decision: no full multi-select for conflict resolution
Both UX-expert passes (behavior + visual) independently rejected checkboxes/a
selection toolbar for this list, in favor of per-row instant-resolve + one bulk
shortcut ("keep this device for all"). Reasoning: this is a single-user app where
conflicts are rare and the dominant case (trust this device after being offline) is
served by the shortcut; checkbox chrome is enterprise-software weight for an event
that happens occasionally, not a routine workflow. Keep this bias — reach for a
single clear shortcut over generic batch-selection UI elsewhere in this app too.
