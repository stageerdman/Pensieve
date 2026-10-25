# PWA-CAPTURE — update v1

## Goal
A **separate, phone-first app** for quick capture on iOS — its own UI, **not** a
reskin of the desktop app. The phone is for *capturing thoughts fast* and *reading
what already exists*, nothing more. Built as an installable **PWA** (add-to-home-
screen) so it costs **$0** and needs no Apple Developer account. Online-only for
v1. It talks to OneDrive directly and leans on the sync spine built in
[[../2026-10-07 ONEDRIVE-SYNC - OPEN/update v1]].

### Why a distinct UI (not shared with desktop)
- Desktop is for organizing, planning, deep reflection, AI coaching — a rich,
  dense surface. The phone is the opposite: open → thumb → type → saved.
- Different runtime too: desktop runs inside Tauri; the PWA runs in mobile Safari
  as a client-side app. Shared *concepts* (OneDrive auth + file model) — separate
  *presentation*.
- So this update owns a small, independent component set tuned for one-handed,
  glance-and-go phone use. No sidebar, no flasks, no multi-pane. A capture box and
  a lightweight reading list.

### The experience (v1)
1. Open app (installed icon) → instantly in a capture field, keyboard up.
2. Type a thought → one tap to save → it becomes a new `.md` in OneDrive.
3. A simple reverse-chronological list of existing notes to read (read-only).
4. Clear sync state; honest messaging when offline or when another device holds
   the edit lock (single-writer rule from the sync spine).

## Non-goals (v1)
- No images / voice / video capture yet (text only).
- No editing of existing notes from the phone in v1 if it complicates the
  single-writer story — capture + read first; revisit edit after the spine lands.
- No offline queue. No native wrapper yet (that's the later, optional step).

## Hard dependency
Needs the **secret-less public-client PKCE** flow confirmed by the ONEDRIVE-SYNC
Phase 0 spike. A PWA is a public client and **cannot hold a client secret**, so if
Microsoft truly requires one for personal accounts we'd need either an **SPA**
platform redirect on the Azure app (expected fix) or a tiny token-exchange proxy
(which would break the "no server, free" goal). **Do not start Phase 1 until the
spike confirms the auth path.**

## Phased roadmap
- **Phase 0 — Auth path confirmed** *(blocked on ONEDRIVE-SYNC spike)*. Register an
  SPA redirect on the Azure app; prove browser PKCE login → Graph call, no secret.
- **Phase 1 — PWA shell.** Vite + React static app, `manifest.webmanifest`,
  minimal service worker, installable, phone viewport. Its own design tokens
  (follows `design.md` spirit but phone-native). Hosted on a free static host
  (GitHub Pages / Vercel / Cloudflare) over HTTPS for the OAuth redirect.
- **Phase 2 — Capture screen.** Single thumb-friendly capture field; save → writes
  a new unique-id `.md` to the Pensieve OneDrive folder. Instant, forgiving, fast.
- **Phase 3 — Read list.** Reverse-chronological list of existing notes, tap to
  read. Read-only.
- **Phase 4 — Sync state + single-writer UX + polish.** Surface sync status and
  the edit-lock rule; graceful offline messaging; real-device test on the owner's
  iPhone. Document the install steps.

## Live status
- 2026-10-07: Update opened alongside ONEDRIVE-SYNC. Blocked on the auth spike
  before Phase 1.

## Later (explicitly deferred, not forgotten)
- Wrap the same PWA bundle in Capacitor/Tauri-mobile for a native iOS app. Free
  path: run via SideStore/AltStore (7-day re-sign, automated). Paid path: $99/yr
  Apple Developer for a durable install / App Store. Same code either way.
