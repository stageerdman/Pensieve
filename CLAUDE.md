# CLAUDE.md

## Project
Pensieve is one place to log every thought and memory — the ultimate tool for thinkers. It captures input in any form (typed/rich text, images, handwritten pages, voice, video), saves the original media locally, auto-generates transcripts so AI can work with it, and organizes everything with correct labels. Journaling is the core: over time it surfaces past lessons and acts as an AI coach that reads your thoughts and tells you what matters for your goals. It must be **extremely lightweight and fast**, local-first, and easy to integrate into a bigger project later. Currently single-user (the owner). AI is a **desktop-only** capability for organizing, planning, and deep reflection — **not** for daily logging, and **not** on mobile (the future iPhone app is capture-only). See `VISION.md` (full vision) and `ROADMAP.md` (roadmap of updates).

**Stack:** Tauri (Rust shell + web UI) · React + TypeScript + Tailwind + shadcn/ui · TipTap (ProseMirror) editor serializing to Markdown · local files (`.md` + original media) with a SQLite index · whisper.cpp (local transcription) · Claude Code CLI for AI (coach / labeling / transcript editing) — uses the logged-in Claude account, no API key, while running on the computer · OneDrive (Microsoft Graph) backup adapter.
**Runs on / deploys to:** a native desktop `.app` (macOS first). Future: an iPhone capture app syncing to the main app via our own sync logic. No web server.

## Map
Planned layout — created as the project grows, kept flat until it needs folders (STRUCTURE.md).
- `src/` — React UI: `components/` (reusable, standardized), `features/` (capture, editor, audio, video, journal-import, timeline, coach), `lib/` (logger, store, transcripts, backup, ai — the AI layer shells out to the Claude Code CLI).
- `src-tauri/` — Rust shell: filesystem, SQLite index, media handling, whisper.cpp binding.
- `VISION.md` — the product vision · `ROADMAP.md` — the roadmap of updates.
- `design.md` — the visual standard (read before building any screen).
- `updates/` — one folder per update (see below). `issues.txt` — known issues & TODOs.
- Note vault (user data) lives outside the repo: `.md` notes + media on disk, indexed by SQLite.

## Commands
- Run (browser, fast iterate): `npm run dev` → http://localhost:5173
- Run (native app): `npm run tauri dev`
- Test: `npm test` (Vitest; `npm run test:watch` to watch)
- Typecheck: `npx tsc --noEmit`
- Build (web bundle): `npm run build` · Build (native `.app`): `npm run tauri build`
- Deploy: n/a (local `.app`); future: notarize & distribute the build
- Logs: query the central log store (`log.query({...})`, see Debugging) — filtered, never full dumps

## User Preferences
- Build mode: **auto-build the full update without waiting** — run all phases end to end; only check in when genuine feedback is needed (a real decision, a blocker, or the update is done).
- Execution pacing: **phase by phase internally** — commit + push and verify each phase, but keep moving through the whole update on my own.

## Core Principles
1. **Modularity.** Plan modules ahead so any piece can be understood and fixed in isolation, with its own bounded context and small, explicit interfaces. Every logical UI element gets its own file; compile to a single file only when something must be posted somewhere. Keep cross-coupling low so a bug has one obvious home. (CODING.md, STRUCTURE.md)
2. **Debugging.** All code logs through one central logger (level, module, event, session ID, relevant data) into a capped, searchable store. The logs command returns small filtered results, never full dumps. When the user reports a problem, read the logs first — they must show what happened in the background.
3. **Reusability.** Never build the same thing twice. Prefer shared helpers and components over duplication — but don't over-generalize before a second real caller. In UI, use parent/child components and shared tokens so many elements are controlled from one place. (CODING.md, UX.md)
4. **UI & UX.** Follow `design.md`. Design serves the user: relentlessly cut anything that isn't truly needed (Steve-Jobs strict), keep the fewest screens/controls/steps that do the job well, minimal font/color/spacing scale, accessible by default. Always launch UX-expert agents — several in parallel for a multi-part surface — and synthesize as the orchestrator. (UX.md)

## Workflow
1. **Asking.** Identify what's unclear about the user's desire before building. Never ask about the stack; ask about vision, needs, and the preferences that matter. Ask a lot if needed.
2. **Planning.** Any non-trivial task starts as `updates/YYYY-MM-DD UPDATE_NAME - OPEN/` with `update v1.md` (goal + phased roadmap + live status) and `wiki.md`. Include, as needed: tech research, impact research so nothing breaks, scenario/UX research, an isolated research spike, per-phase test plans, then build phases.
3. **Execution.** Follow Build mode; go phase by phase, record progress in `update vX.md`, adjust the roadmap as reality demands.
4. **Research spikes.** New API / unfamiliar library / genuinely new design → a throwaway spike run *outside* the main code, inside the update folder. Capture findings in `wiki.md`.
5. **Agents.** Act as an orchestrator: decompose and delegate to focused agents in parallel; always bring in UX experts for user-facing work. Synthesize their output.
6. **Testing.** Most phases end with tests that lock in what they built (core logic, risky paths, silent-regression risks — skip trivial glue). Then verify by running the actual thing, not just a green test. If the user tests, rely on logs, not only their feedback.
7. **Committing.** Commit AND push after every working change — small, focused, one logical unit; never batch unrelated edits; never commit `.env`/secrets. Branches: `main` = stable. `update/<name>` = copy of `main` + the update; when built and verified, merge into `main`, then prune it. Rename the update folder `- OPEN` → `- CLOSED`. Everything lives on GitHub — if it isn't backed up yet, fix that first.

## Updates Folder
- `update vX.md`: goal, phased roadmap, live status (done, decisions, next). Starts at v1; bump when substantially reworked.
- `wiki.md`: durable decisions and lessons — what works, what doesn't, principles discovered.
- Optional: logs, test scripts, and isolated research-spike code for the update. An update can be reopened (`CLOSED` → `OPEN`).
