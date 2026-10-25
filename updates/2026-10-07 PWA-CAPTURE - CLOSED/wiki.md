# PWA-CAPTURE — wiki (durable findings)

## Decisions
- **Separate UI from desktop.** Phone = capture + read only; its own minimal
  component set, not the desktop surface. (Owner's explicit instruction, 2026-10-07.)
- **PWA first, native later.** $0, no Apple account, reuses React. Native is a
  future thin wrapper over the same bundle; only the $99/yr Apple account (or free
  but fiddly SideStore re-signing) separates PWA from a durable native install.
- **Online-only v1.** Owner accepts no offline / no simultaneous-edit handling.

## Dependencies
- Blocks on the secret-less PKCE auth path — tracked in
  [[../2026-10-07 ONEDRIVE-SYNC - OPEN/wiki]].

## Findings
_(filled as Phase 0+ proceed)_
