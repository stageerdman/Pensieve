// Real knowledge grounding (local vector search) for Patronus agents' knowledge files.
// Ported from masters-wheel's src-tauri/src/knowledge/ (see this update's wiki.md for
// what's identical vs. adapted — mainly: no space_folder anywhere, since Pensieve has
// exactly one vault instead of masters-wheel's multiple Spaces).
//
// Each file below owns exactly one concern, so the whole pipeline reads top to bottom as
// one step per file:
//   extract  -> turn a knowledge file into plain text
//   chunk    -> split that text into small, retrievable pieces
//   embedder -> turn a piece of text into a vector (meaning, not keywords)
//   store    -> save/search those vectors in one SQLite file per agent
//   prompt   -> turn search results into text Claude actually reads
//   commands -> the Tauri commands the frontend calls, wiring the above together; also
//               the plain function assistant.rs calls before every reply
//   paths    -> where everything above reads/writes on disk

mod chunk;
mod embedder;
mod extract;
mod paths;
mod store;

pub mod commands;
pub mod prompt;
