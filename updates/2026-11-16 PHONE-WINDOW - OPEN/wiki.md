# PHONE-WINDOW — wiki
- In a "missing locally = deleted" sync model, any local eviction MUST be a distinct state
  (`remoteOnly`), never just a missing file — and must be persisted before the removal.
- A delta cursor won't re-deliver unchanged items; anything that re-enters a partial
  mirror needs its own driver (here: the published index).
- Window decisions need the other device's signals (desktop opens) — publish them as a
  small catalogue rather than syncing sidecars.
