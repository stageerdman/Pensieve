# PATRONUS-WEB-TOOLS — wiki

Lasting decisions and lessons. The plan lives in `update v1.md`.

## Principles
- **Off unless granted.** The `claude` CLI never gets a built-in tool unless that
  message's grant includes it. `--tools ""` is still the default (it also keeps out the
  ~20k-token built-in schema bloat, see `assistant.rs`).
- **Ids in, CLI names out.** The UI sends tool ids (`"web"`). Only
  `src-tauri/src/ai_tools/registry.rs` knows which CLI tool names they map to. Unknown
  ids fail loudly.
- **One arg builder.** Chat (`assistant.rs`) and spells (`ai_text.rs`) build their tool
  flags through the same function, so they can't drift apart.

## Open risk: write tools after web
Web content in a chat can carry prompt injection. Today the worst a page can do is
steer the reply, or `add_tag`. Before `create_note`/`edit_note`/`link_note` join the
picker, decide whether they may be granted **together with** `web` in the same message.
The safe default is no: make them mutually exclusive in `registry.rs`.

## Spike findings (Phase 1)
_To fill in: the answers to the five questions in update v1.md, Phase 1._
