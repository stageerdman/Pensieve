# Pensieve — Vision

One line: **one place to log all thoughts and memories of any kind — the ultimate tool for thinkers.**

## The problem
Thinking is scattered. Notes end up in Notion logs, voice memos, camera rolls,
paper journals, and half-finished docs. Capture has friction, so thoughts are
lost; and once captured, they're impossible to revisit as one body of work. The
lessons in your own past — what worked, what didn't, what you were reaching for —
stay buried.

## The product
A **smart multi-modal thought-capturing system**. Extremely lightweight and fast.
It takes any input — typed/rich text, images, handwritten pages, voice, video —
saves the **original media locally**, auto-generates a **transcript** so AI can
work with it later, and organizes everything with the **correct labels**.

Journaling is the core. Everything you learn, you learn to reach a goal;
everything you write, you write from a situation with dreams and goals. Pensieve
turns that stream into durable, searchable memory — and, on the computer, into an
**AI coach** that reads your thoughts and tells you what matters for your goals.

## Principles that define it
- **Capture is effortless.** Any device, any format, one gesture. If it's not
  frictionless, thoughts get lost.
- **Local-first.** Everything is stored on your machine — notes as plain `.md`,
  media as original files, indexed for search. You own your data.
- **Original + transcript.** Always keep the raw media; always generate a
  transcript beside it so AI (and future-you) can use it.
- **Track additions like commits.** What idea was added when is recorded
  separately — a log of your thinking over time, not one giant document.
- **Minimal, Steve-Jobs strict.** The UI disappears around the content. Writing
  must feel as smooth as Notion, with near-identical formatting, saved as `.md`.
- **Integratable.** Pensieve is for the owner today, but built as a clean module
  that folds into a bigger project later.

## Modalities
- **Writing** — Notion-smooth rich text, saved locally as `.md`. (First priority.)
- **Audio** — auto transcript, transcript↔time-point linking, notes on segments,
  AI or manual transcript edits, cut/extract clips. (Sales calls, therapy sessions.)
- **Video** — same transcript workflow as audio.
- **Images** — embed freely; multiple audios/videos per note.
- **Physical journal → digital** — photograph pages; background processing into
  digital notes; source tracking, no duplication, remembers where you stopped;
  hand-drawn images kept as part of the journal.
- **Notes & timeline** — separate notes with day labels; a commit-style log of
  when each addition was made.

## Where it runs
- **macOS desktop `.app` first** — the main home, where the heavy work happens.
- **AI is a desktop capability**, via the Claude Code CLI (logged-in Claude
  account, no API key). AI is for **organizing thoughts, planning, and deep
  reflection / heavy work** — not for daily logging.
- **Future iPhone/iPad app** — for frictionless capture and logging (no AI),
  syncing to the main app via **our own sync logic** (not OneDrive's).
- **Backup** to the cloud — OneDrive as backup-only for now (no sync).

## Non-goals (for now)
- No multi-user / collaboration.
- No AI on mobile.
- No relying on OneDrive (or any provider) for sync — sync is our own logic later.
- No feature sprawl: build the priority modalities well before the rest.
