Desired features — running backlog
(surfaced while preparing the Notion migration; not all of these belong to
THIS update — tracked here so they aren't lost. Promote to a real update's
roadmap when it's their turn; move resolved ones out or mark done.)

- [ ] **Star** — importance flag that boosts search ranking + brightens the
      note visually. IN PROGRESS this update (P3/P4 in `update v1.md`).
- [ ] **Typed relations beyond note-to-note.** Notion's Pensieve DB relates
      journal entries to People / Skills / Self-Mastery-Skills / Results /
      Specific-Sources — separate small reference databases, not just other
      journal entries. Pensieve's `links` only connects note-to-note. If the
      owner wants real "this entry is about Person X" / "this entry used
      Skill Y" structure (vs. flattening to tags on import), that's a
      standalone future update — bigger than a field mapping.
- [ ] **Core Point / pull-quote.** Notion entries carry a short highlighted
      takeaway separate from the body. No Pensieve equivalent. Candidate:
      a note-level "pinned quote" field, or just the first blockquote in the
      body — undecided, needs the owner's input (see wiki.md "Open").
- [ ] **Review-status workflow.** Notion's `Status` (💭 raw → ✍🏼 refining →
      ✔️ done) is a workflow the owner actually uses (1,570 of 1,980 notes are
      "done"). Pensieve has no equivalent note-state concept at all today.
      Worth a real feature, not just an import field to drop.
- [ ] **Life Stage / era tagging.** Notion's `Life Stage` (Belarus Childhood,
      Czech Childhood, High School, University, 2024, Starting Entrepreneur,
      The Conqueror) is really a single-select "which chapter of my life"
      axis, orthogonal to category and tags. Could just become tags on
      import, but a dedicated "era" concept (with its own timeline view?)
      might be worth it later.
- [ ] **Manual display-date override.** Notion's `Date Overwrite` lets an
      entry show a different date than its real created/modified time (e.g.
      backdating a memory to when it actually happened, not when it was
      typed). Pensieve's `createdAt` is already owner-editable per the Details
      panel — check whether that already covers this before treating it as a
      new feature.
