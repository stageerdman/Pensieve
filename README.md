# Pensieve

One place to log all thoughts and memories of any kind — the ultimate tool for
thinkers. A lightweight, fast, local-first, multi-modal thought-capturing system
(text, images, audio, video, handwritten journals) with a desktop AI coach.

See **[VISION.md](VISION.md)** for the full vision and **[ROADMAP.md](ROADMAP.md)**
for the plan. Working conventions live in **[CLAUDE.md](CLAUDE.md)**.

## Status
Early setup. First build (`updates/… INITIAL-BUILD`) delivers the foundation +
smooth Notion-like writing saved locally as `.md`.

## Run
_Commands land here once the app is scaffolded (see CLAUDE.md → Commands)._

```
npm run tauri dev     # run (dev)
npm test              # tests
npm run tauri build   # build the .app
```

## Data & privacy
Local-first: notes are plain `.md` files and original media on disk (a vault kept
outside this repo), indexed by SQLite. AI runs on the desktop via the Claude Code
CLI. Cloud is backup-only (OneDrive) for now.
