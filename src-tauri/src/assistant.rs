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
