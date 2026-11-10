// Real AI replies for the Patronus assistant — Pensieve's own AI chat, shelling out to
// the already-authenticated local Claude Code CLI rather than a pay-per-token API key
// (CLAUDE.md: "use the logged-in Claude account, no API key"). Ported from
// masters-wheel's assistant.rs (same proven shape — streaming `claude -p`, the app's own
// binary as the MCP server), stripped of its knowledge/RAG and multi-Space machinery
// Pensieve doesn't need: one vault, and an agent's persona is just the system prompt the
// frontend sends, not a per-agent indexed knowledge base.
//
// Run from `std::env::temp_dir()`, not this repo's root — Claude Code discovers
// CLAUDE.md by walking up from the subprocess's cwd, and this project's own CLAUDE.md
// (full of Pensieve's own coding conventions) has nothing to do with being a chat
// persona for the person using the app. `--system-prompt` *replaces* the CLI's default
// persona rather than appending to it — `--append-system-prompt` leaves "you are Claude
// Code" in place alongside the persona, which masters-wheel found breaks character on a
// direct "what are you" question (see its own update's wiki.md for the repro); carried
// forward here without re-verifying, since it's the same CLI and the same failure mode
// would apply.
//
// Streaming: `ask_agent` is async and does the actual subprocess work inside
// `spawn_blocking`, exactly like `transcribe::generate_transcript` and
// `ai_vision::describe_journal_page` — a plain synchronous command here would block
// Tauri's main thread for the whole multi-second reply. `--output-format stream-json
// --include-partial-messages` makes the CLI emit one NDJSON line per event as it
// generates; each `content_block_delta` text chunk is forwarded to the frontend
// immediately as an `ask-agent-progress` event. The trailing `result` event is still the
// authoritative final text + session id.
//
// Session continuity: the first call for a chat has no session id; the CLI returns one
// in its result event, which the frontend stores and passes back via `--resume` on every
// later turn — the CLI's own transcript is the source of truth for that conversation's
// history, not anything Pensieve stores itself.

use serde::Serialize;
use std::collections::HashMap;
use std::env::temp_dir;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

use crate::util::resolve_binary;

#[derive(Serialize)]
pub struct AgentReply {
    pub text: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

#[derive(Serialize, Clone)]
struct AskAgentProgress {
    #[serde(rename = "jobId")]
    job_id: String,
    delta: String,
}

fn emit_delta(app: &AppHandle, job_id: &str, delta: &str) {
    let _ = app.emit("ask-agent-progress", AskAgentProgress { job_id: job_id.to_string(), delta: delta.to_string() });
}

// The three MCP tools whose results name real notes (list_tags doesn't) — full
// `mcp__pensieve__<tool>` names, the shape a tool_use block's own "name" field actually
// carries (same as mcp/config.rs::ALLOWED_TOOLS, which is what grants the CLI these in
// the first place).
const NOTE_TOOLS: &[&str] = &["mcp__pensieve__search_notes", "mcp__pensieve__get_note", "mcp__pensieve__list_recent"];

#[derive(Serialize, Clone)]
struct NoteRef {
    id: String,
    title: String,
}

#[derive(Serialize, Clone)]
struct NotesFoundEvent {
    #[serde(rename = "jobId")]
    job_id: String,
    notes: Vec<NoteRef>,
}

fn emit_notes_found(app: &AppHandle, job_id: &str, notes: Vec<NoteRef>) {
    if notes.is_empty() {
        return;
    }
    let _ = app.emit("assistant-notes-found", NotesFoundEvent { job_id: job_id.to_string(), notes });
}

// A note tool's result content (search_notes::search_notes/list_recent return a JSON
// array, get_note a single JSON object) — only ever asking for id/title, so this reads
// fine against any of NoteSummary/SearchMatch/NoteContent without caring which. An
// error result (a bare string like "no note with id x") fails to parse as JSON here and
// correctly yields no refs, not a crash.
fn extract_note_refs(content: &str) -> Vec<NoteRef> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else { return Vec::new() };
    let items: Vec<&serde_json::Value> = match &value {
        serde_json::Value::Array(arr) => arr.iter().collect(),
        serde_json::Value::Object(_) => vec![&value],
        _ => Vec::new(),
    };
    items
        .into_iter()
        .filter_map(|v| {
            let id = v.get("id").and_then(|x| x.as_str())?.to_string();
            let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("Untitled").to_string();
            Some(NoteRef { id, title })
        })
        .collect()
}

#[tauri::command]
pub async fn ask_agent(
    app: AppHandle,
    job_id: String,
    message: String,
    instructions: String,
    session_id: Option<String>,
) -> Result<AgentReply, String> {
    let vault_root = crate::vault_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<AgentReply, String> {
        // --mcp-config points the CLI at this app's own MCP server (a re-exec of this
        // same binary — see mcp/server.rs); --strict-mcp-config means only that server's
        // tools are even considered. --tools "" is still required in addition to all of
        // the above: it controls the CLI's own *built-in* tool set (Bash/Edit/Read/...),
        // separately from --mcp-config/--allowedTools — leaving it off reintroduces
        // ~20k+ tokens/reply of built-in-tool schema bloat (masters-wheel verified this
        // by hand; see its own update's wiki.md).
        let mcp_config_path =
            crate::mcp::config::write_config_file(&vault_root).map_err(|e| format!("Couldn't prepare MCP tools: {e}"))?;

        let binary = resolve_binary("claude");
        let mut command = Command::new(&binary);
        command
            .current_dir(temp_dir())
            .arg("--output-format")
            .arg("stream-json")
            .arg("--include-partial-messages")
            .arg("--verbose")
            .arg("--system-prompt")
            .arg(&instructions)
            .arg("--permission-mode")
            .arg("dontAsk")
            .arg("--mcp-config")
            .arg(&mcp_config_path)
            .arg("--strict-mcp-config")
            .arg("--allowedTools")
            .arg(crate::mcp::config::ALLOWED_TOOLS.join(","))
            .arg("--tools")
            .arg("")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(id) = session_id.filter(|id| !id.is_empty()) {
            command.arg("--resume").arg(id);
        }

        // `-p` takes no value of its own — the prompt is a positional argument, and it
        // (plus the `--` separator) must come last: a message that happens to start
        // with `-` otherwise gets misparsed as another option.
        command.arg("-p").arg("--").arg(&message);

        let mut child = command.spawn().map_err(|e| {
            format!("The Claude Code CLI isn't available ({e}). Make sure `claude` is installed and you're logged in.")
        })?;

        // Drain stderr on its own thread while this thread reads stdout line by line
        // below — reading one pipe to completion while the other fills up unread is the
        // classic way to deadlock a child process.
        let stderr_reader = child.stderr.take().map(|mut pipe| {
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                let _ = pipe.read_to_end(&mut buf);
                buf
            })
        });

        let stdout = child.stdout.take().expect("stdout was piped");
        let mut final_text = String::new();
        let mut final_session_id = String::new();
        let mut is_error = false;
        // Maps a tool_use block's id to its tool name, populated from each "assistant"
        // message event and consumed by the matching "user" message event's
        // tool_result — the only way to know which tool a given result belongs to,
        // since tool_result itself only carries tool_use_id. Only ever grows by a
        // handful of entries per reply.
        let mut tool_use_names: HashMap<String, String> = HashMap::new();

        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            match event.get("type").and_then(|v| v.as_str()) {
                Some("stream_event") => {
                    let inner = &event["event"];
                    if inner.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
                        if let Some(delta) = inner["delta"]["text"].as_str() {
                            emit_delta(&app, &job_id, delta);
                        }
                    }
                }
                Some("assistant") => {
                    if let Some(blocks) = event["message"]["content"].as_array() {
                        for block in blocks {
                            if block.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                                if let (Some(id), Some(name)) =
                                    (block.get("id").and_then(|v| v.as_str()), block.get("name").and_then(|v| v.as_str()))
                                {
                                    tool_use_names.insert(id.to_string(), name.to_string());
                                }
                            }
                        }
                    }
                }
                Some("user") => {
                    if let Some(blocks) = event["message"]["content"].as_array() {
                        for block in blocks {
                            if block.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
                                continue;
                            }
                            let Some(tool_use_id) = block.get("tool_use_id").and_then(|v| v.as_str()) else { continue };
                            let Some(name) = tool_use_names.get(tool_use_id) else { continue };
                            if !NOTE_TOOLS.contains(&name.as_str()) {
                                continue;
                            }
                            // A tool_result's `content` is an array of content blocks (the real
                            // Anthropic tool_result shape — verified by hand against the live
                            // CLI, not a plain string as it might look from a quick skim of
                            // other code); our MCP tools only ever return one text block.
                            let Some(text) = block
                                .get("content")
                                .and_then(|v| v.as_array())
                                .and_then(|blocks| blocks.iter().find_map(|b| b.get("text").and_then(|t| t.as_str())))
                            else {
                                continue;
                            };
                            emit_notes_found(&app, &job_id, extract_note_refs(text));
                        }
                    }
                }
                Some("result") => {
                    final_text = event.get("result").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    final_session_id = event.get("session_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    is_error = event.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                }
                _ => {}
            }
        }

        let status = child.wait().map_err(|e| e.to_string())?;
        let stderr_text = stderr_reader
            .map(|handle| String::from_utf8_lossy(&handle.join().unwrap_or_default()).trim().to_string())
            .unwrap_or_default();

        if is_error || !status.success() {
            return Err(if !stderr_text.is_empty() {
                stderr_text
            } else if !final_text.is_empty() {
                final_text
            } else {
                "Claude didn't return a reply.".to_string()
            });
        }

        Ok(AgentReply { text: final_text, session_id: final_session_id })
    })
    .await
    .map_err(|e| format!("Internal error talking to Claude ({e})."))?
}

#[cfg(test)]
mod tests {
    use super::extract_note_refs;

    #[test]
    fn reads_a_search_notes_array() {
        let refs = extract_note_refs(r#"[{"id":"zz1","title":"A morning on the lake","snippet":"..."}]"#);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].id, "zz1");
        assert_eq!(refs[0].title, "A morning on the lake");
    }

    #[test]
    fn reads_a_get_note_object() {
        let refs = extract_note_refs(r#"{"id":"zz1","title":"A morning on the lake","body":"..."}"#);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].id, "zz1");
    }

    #[test]
    fn empty_array_yields_no_refs() {
        assert!(extract_note_refs("[]").is_empty());
    }

    #[test]
    fn a_plain_error_string_is_not_json_and_yields_no_refs() {
        assert!(extract_note_refs("no note with id zz9").is_empty());
    }

    #[test]
    fn missing_title_falls_back_to_untitled() {
        let refs = extract_note_refs(r#"[{"id":"zz1"}]"#);
        assert_eq!(refs[0].title, "Untitled");
    }
}
