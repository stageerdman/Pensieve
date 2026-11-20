// Real AI replies for the Patronus assistant — Pensieve's own AI chat, shelling out to
// the already-authenticated local Claude Code CLI rather than a pay-per-token API key
// (CLAUDE.md: "use the logged-in Claude account, no API key"). Ported from
// masters-wheel's assistant.rs (same proven shape — streaming `claude -p`, the app's own
// binary as the MCP server), with a per-agent knowledge base (AGENT-RAG, see
// `crate::knowledge`). Pensieve has exactly one vault.
//
// Run from `std::env::temp_dir()`, not this repo's root — Claude Code discovers
// CLAUDE.md by walking up from the subprocess's cwd, and this project's own CLAUDE.md
// has nothing to do with being a chat persona. `--system-prompt` *replaces* the CLI's
// default persona; `--append-system-prompt` leaves "you are Claude Code" in place, which
// masters-wheel found breaks character on a direct "what are you" question.
//
// Streaming: the subprocess runs inside `spawn_blocking` (a synchronous command would
// block Tauri's main thread for the whole reply). `stream-json --include-partial-messages`
// gives one NDJSON line per event; stream.rs turns each into deltas, note refs and web
// calls, which are emitted to the frontend as they happen.
//
// Tools: the chat sends tool ids for this message (`tools`, e.g. ["web"]); ai_tools
// resolves them (unknown id = hard error) and builds the CLI's tool flags. Nothing is
// granted unless asked — see updates/2026-11-19 PATRONUS-WEB-TOOLS.
//
// Session continuity: the CLI returns a session id in its result event; the frontend
// passes it back via `--resume` on later turns. The CLI's transcript is the source of
// truth for the conversation's history.

mod notes;
mod stream;
mod web;

use serde::Serialize;
use std::env::temp_dir;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

use crate::ai_tools::args::tool_args;
use crate::ai_tools::registry::{resolve, ToolGrants};
use crate::util::resolve_binary;
use notes::NoteRef;
use stream::{ReplyStream, StreamEvent, StreamOutcome};
use web::{WebCall, WebKind};

#[derive(Serialize)]
pub struct AgentReply {
    pub text: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// Web calls that ran for this reply, with their sources (empty when web was off).
    pub web: Vec<WebCall>,
}

#[derive(Serialize, Clone)]
struct AskAgentProgress {
    #[serde(rename = "jobId")]
    job_id: String,
    delta: String,
}

#[derive(Serialize, Clone)]
struct NotesFoundEvent {
    #[serde(rename = "jobId")]
    job_id: String,
    notes: Vec<NoteRef>,
}

#[derive(Serialize, Clone)]
struct WebCallEvent {
    #[serde(rename = "jobId")]
    job_id: String,
    kind: WebKind,
    detail: String,
}

// How many knowledge excerpts to pull into one reply's prompt — enough to cover a
// question thoroughly without ballooning every turn's token cost (see knowledge/prompt.rs).
const RETRIEVAL_TOP_K: usize = 8;

// Seen in the spike: a chat that used the web, then asks for the web again with it
// switched off, gets an empty reply from the CLI (wiki.md). Say so instead of showing
// an empty bubble.
const EMPTY_REPLY: &str = "Patronus gave no answer. If this question needs the web, type /web and send it again.";

/// A finished CLI turn as the chat sees it. A blank answer is an error, never an empty
/// bubble: the UI then offers "Retry" and "Retry with web search" under it.
fn reply_from(outcome: StreamOutcome) -> Result<AgentReply, String> {
    if outcome.text.trim().is_empty() {
        return Err(EMPTY_REPLY.to_string());
    }
    Ok(AgentReply { text: outcome.text, session_id: outcome.session_id, web: outcome.web })
}

#[tauri::command]
pub async fn ask_agent(
    app: AppHandle,
    job_id: String,
    message: String,
    instructions: String,
    agent_id: String,
    session_id: Option<String>,
    tools: Vec<String>,
) -> Result<AgentReply, String> {
    // Fail fast, before any work: an unknown id is a bug in the caller, never ignored.
    let grants = resolve(&tools).map_err(|e| {
        log::error!("assistant.ask refused: agent={agent_id} job={job_id} tools={tools:?}: {e}");
        format!("Can't grant tools: {e}")
    })?;
    log::info!(
        "assistant.ask agent={agent_id} job={job_id} tools={:?} resume={}",
        grants.ids(),
        session_id.as_deref().is_some_and(|s| !s.is_empty())
    );
    let vault_root = crate::vault_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let ask = Ask { app: &app, job_id: &job_id, message: &message, session_id, grants: &grants };
        let result = ask.run(&vault_root, &instructions, &agent_id);
        match &result {
            Ok(reply) => log::info!("assistant.reply job={job_id} chars={} web_calls={}", reply.text.len(), reply.web.len()),
            Err(e) => log::error!("assistant.reply failed: agent={agent_id} job={job_id} tools={:?}: {e}", grants.ids()),
        }
        result
    })
    .await
    .map_err(|e| format!("Internal error talking to Claude ({e})."))?
}

struct Ask<'a> {
    app: &'a AppHandle,
    job_id: &'a str,
    message: &'a str,
    session_id: Option<String>,
    grants: &'a ToolGrants,
}

impl Ask<'_> {
    fn run(&self, vault_root: &std::path::Path, instructions: &str, agent_id: &str) -> Result<AgentReply, String> {
        let system_prompt = self.system_prompt(instructions, agent_id);
        let mcp_config =
            crate::mcp::config::write_config_file(vault_root).map_err(|e| format!("Couldn't prepare MCP tools: {e}"))?;
        let args = tool_args(&mcp_config, crate::mcp::config::ALLOWED_TOOLS, self.grants);
        let result = self.run_cli(&system_prompt, &args);
        let _ = std::fs::remove_file(&mcp_config);
        reply_from(result?)
    }

    // Knowledge grounding: the chunks most relevant to this message go ahead of the
    // persona. A retrieval failure (e.g. the embedding model still loading) falls back
    // to persona-only rather than blocking the reply. Always through
    // build_augmented_system_prompt: its persona wrapper keeps the CLI in character.
    // Last, one line per grantable tool saying whether it is on for this message.
    fn system_prompt(&self, instructions: &str, agent_id: &str) -> String {
        let chunks =
            crate::knowledge::commands::retrieve_for_agent(self.app, agent_id, self.message, RETRIEVAL_TOP_K).unwrap_or_default();
        let prompt = crate::knowledge::prompt::build_augmented_system_prompt(instructions, &chunks);
        format!("{prompt}\n\n{}", self.grants.prompt_note())
    }

    fn run_cli(&self, system_prompt: &str, tool_args: &[String]) -> Result<StreamOutcome, String> {
        let mut command = Command::new(resolve_binary("claude"));
        command
            .current_dir(temp_dir())
            .args(["--output-format", "stream-json", "--include-partial-messages", "--verbose"])
            .arg("--system-prompt")
            .arg(system_prompt)
            .args(tool_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(id) = self.session_id.as_deref().filter(|id| !id.is_empty()) {
            command.arg("--resume").arg(id);
        }
        // The prompt is positional and must come last, after `--`: a message starting
        // with `-` would otherwise be misparsed as an option.
        command.arg("-p").arg("--").arg(self.message);

        let mut child = command.spawn().map_err(|e| {
            format!("The Claude Code CLI isn't available ({e}). Make sure `claude` is installed and you're logged in.")
        })?;
        // Drain stderr on its own thread while stdout is read below — reading one pipe to
        // completion while the other fills up is the classic child-process deadlock.
        let stderr_reader = child.stderr.take().map(|mut pipe| {
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                let _ = pipe.read_to_end(&mut buf);
                buf
            })
        });

        let mut stream = ReplyStream::new(self.grants.cli_builtins());
        let stdout = child.stdout.take().expect("stdout was piped");
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            for event in stream.feed(&line) {
                self.emit(event);
            }
        }
        let outcome = stream.finish();

        let status = child.wait().map_err(|e| e.to_string())?;
        let stderr_text = stderr_reader
            .map(|handle| String::from_utf8_lossy(&handle.join().unwrap_or_default()).trim().to_string())
            .unwrap_or_default();
        if outcome.is_error || !status.success() {
            return Err(if !stderr_text.is_empty() {
                stderr_text
            } else if !outcome.text.is_empty() {
                outcome.text
            } else {
                "Claude didn't return a reply.".to_string()
            });
        }
        Ok(outcome)
    }

    fn emit(&self, event: StreamEvent) {
        let job_id = self.job_id.to_string();
        let _ = match event {
            StreamEvent::Delta(delta) => self.app.emit("ask-agent-progress", AskAgentProgress { job_id, delta }),
            StreamEvent::NotesFound(notes) => self.app.emit("assistant-notes-found", NotesFoundEvent { job_id, notes }),
            StreamEvent::WebCall(call) => {
                log::info!("assistant.web_call job={job_id} kind={:?} detail={}", call.kind, call.detail);
                self.app.emit("assistant-web-call", WebCallEvent { job_id, kind: call.kind, detail: call.detail })
            }
            // The CLI refuses it (not loaded), so nothing left the machine. Log it and keep
            // it out of the UI: showing "Searching the web" with web off would mislead.
            StreamEvent::UngrantedWebCall(call) => {
                log::warn!("assistant.web_call refused, not granted: job={job_id} tool={} detail={}", call.tool, call.detail);
                Ok(())
            }
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome_of(ndjson: &str) -> StreamOutcome {
        let mut stream = ReplyStream::new(Vec::new());
        for line in ndjson.lines() {
            stream.feed(line);
        }
        stream.finish()
    }

    // The spike's empty reply (wiki.md, point 3): web on, then off, then a question that
    // wants the web. The CLI reports success, but the model ended the turn with no text
    // (here after thinking only). Shape from a live off-after-on run, text left out.
    const EMPTY_AFTER_WEB_OFF: &str = concat!(
        r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"","signature":"x"}]},"session_id":"s1"}"#,
        "\n",
        r#"{"type":"result","subtype":"success","is_error":false,"stop_reason":"end_turn","result":"","session_id":"s1"}"#,
    );

    #[test]
    fn an_empty_reply_becomes_a_clear_message_not_a_blank_bubble() {
        let reply = reply_from(outcome_of(EMPTY_AFTER_WEB_OFF));
        assert_eq!(reply.err().as_deref(), Some(EMPTY_REPLY));
    }

    #[test]
    fn a_whitespace_only_reply_counts_as_empty() {
        let reply = reply_from(StreamOutcome { text: " \n\t".into(), session_id: "s1".into(), ..StreamOutcome::default() });
        assert_eq!(reply.err().as_deref(), Some(EMPTY_REPLY));
    }

    // The live off-after-on recording where the model did answer: the guard must let it through.
    #[test]
    fn a_real_answer_after_web_off_passes_through() {
        let reply = reply_from(outcome_of(include_str!("fixtures/web_off_after_on.ndjson"))).ok().expect("a reply");
        assert!(reply.text.starts_with("I couldn't check this time."));
        assert_eq!(reply.session_id, "db83465d-2528-4ad0-944e-f28c06e3008f");
        assert!(reply.web.is_empty());
    }
}
