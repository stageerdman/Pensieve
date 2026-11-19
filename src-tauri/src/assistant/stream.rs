// Reads the CLI's `--output-format stream-json` NDJSON, one line at a time, and says what
// happened: text deltas, note refs, web calls, and the final result. Pure — the command
// (mod.rs) does the I/O and the emitting, so this can be tested against real recordings.

use std::collections::HashMap;

use serde_json::Value;

use super::notes::{extract_note_refs, NoteRef, NOTE_TOOLS};
use super::web::{sources_of, web_call, WebCall};

#[derive(Debug, PartialEq)]
pub enum StreamEvent {
    Delta(String),
    NotesFound(Vec<NoteRef>),
    /// Fires the moment the model calls a web tool, before any result: the UI's
    /// "Searching the web: …" line.
    WebCall(WebCall),
}

#[derive(Debug, Default, PartialEq)]
pub struct StreamOutcome {
    pub text: String,
    pub session_id: String,
    pub is_error: bool,
    /// Web calls that actually ran (refused ones are left out), with their sources.
    pub web: Vec<WebCall>,
}

#[derive(Default)]
pub struct ReplyStream {
    // A tool_result only carries tool_use_id, so this maps it back to the tool's name.
    // Grows by a handful of entries per reply.
    tool_names: HashMap<String, String>,
    pending_web: HashMap<String, WebCall>,
    outcome: StreamOutcome,
}

impl ReplyStream {
    pub fn feed(&mut self, line: &str) -> Vec<StreamEvent> {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else { return Vec::new() };
        match event["type"].as_str() {
            Some("stream_event") => text_delta(&event).into_iter().collect(),
            Some("assistant") => blocks(&event).filter_map(|b| self.on_tool_use(b)).collect(),
            Some("user") => blocks(&event).filter_map(|b| self.on_tool_result(b, &event["tool_use_result"])).collect(),
            Some("result") => {
                self.outcome.text = event["result"].as_str().unwrap_or_default().to_string();
                self.outcome.session_id = event["session_id"].as_str().unwrap_or_default().to_string();
                self.outcome.is_error = event["is_error"].as_bool().unwrap_or(false);
                Vec::new()
            }
            _ => Vec::new(),
        }
    }

    pub fn finish(self) -> StreamOutcome {
        self.outcome
    }

    fn on_tool_use(&mut self, block: &Value) -> Option<StreamEvent> {
        if block["type"] != "tool_use" {
            return None;
        }
        let (id, name) = (block["id"].as_str()?, block["name"].as_str()?);
        self.tool_names.insert(id.to_string(), name.to_string());
        let call = web_call(block)?;
        self.pending_web.insert(id.to_string(), call.clone());
        Some(StreamEvent::WebCall(call))
    }

    fn on_tool_result(&mut self, block: &Value, tool_use_result: &Value) -> Option<StreamEvent> {
        if block["type"] != "tool_result" {
            return None;
        }
        let id = block["tool_use_id"].as_str()?;
        if let Some(mut call) = self.pending_web.remove(id) {
            if block["is_error"] != true {
                call.sources = sources_of(&call, tool_use_result);
                self.outcome.web.push(call);
            }
            return None;
        }
        if !NOTE_TOOLS.contains(&self.tool_names.get(id)?.as_str()) {
            return None;
        }
        // An MCP tool_result's `content` is an array of content blocks (verified against
        // the live CLI); our MCP tools only ever return one text block.
        let text = block["content"].as_array()?.iter().find_map(|b| b["text"].as_str())?;
        let notes = extract_note_refs(text);
        (!notes.is_empty()).then_some(StreamEvent::NotesFound(notes))
    }
}

fn blocks(event: &Value) -> impl Iterator<Item = &Value> {
    event["message"]["content"].as_array().into_iter().flatten()
}

fn text_delta(event: &Value) -> Option<StreamEvent> {
    let inner = &event["event"];
    if inner["type"] != "content_block_delta" {
        return None;
    }
    Some(StreamEvent::Delta(inner["delta"]["text"].as_str()?.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assistant::web::WebKind;

    fn run(ndjson: &str) -> (Vec<StreamEvent>, StreamOutcome) {
        let mut stream = ReplyStream::default();
        let events = ndjson.lines().flat_map(|l| stream.feed(l)).collect();
        (events, stream.finish())
    }

    fn web_calls(events: &[StreamEvent]) -> Vec<&WebCall> {
        events.iter().filter_map(|e| if let StreamEvent::WebCall(c) = e { Some(c) } else { None }).collect()
    }

    #[test]
    fn a_granted_web_reply_reports_its_query_url_and_sources() {
        let (events, outcome) = run(include_str!("fixtures/web_granted.ndjson"));
        let live = web_calls(&events);
        assert_eq!(live.len(), 2);
        assert_eq!((live[0].kind, live[0].detail.as_str()), (WebKind::Search, "latest stable Kotlin release version"));
        assert_eq!(live[1].kind, WebKind::Fetch);

        assert_eq!(outcome.web.len(), 2);
        let search = &outcome.web[0];
        assert!(search.sources.iter().any(|s| s.url == "https://kotlinlang.org/docs/releases.html"));
        assert_eq!(outcome.web[1].sources[0].url, "https://kotlinlang.org/docs/whatsnew2420.html");
        assert!(outcome.text.contains("2.4.20"));
        assert!(!outcome.session_id.is_empty());
    }

    #[test]
    fn refused_web_calls_are_not_reported_as_used() {
        let (events, outcome) = run(include_str!("fixtures/web_refused.ndjson"));
        assert_eq!(web_calls(&events).len(), 3);
        // Only the one call whose result was not an error counts as used.
        assert_eq!(outcome.web.len(), 1);
        assert_eq!(outcome.web[0].detail, "https://nodejs.org/en/about/previous-releases");
    }

    #[test]
    fn note_tool_results_still_yield_note_refs() {
        let ndjson = concat!(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"mcp__pensieve__search_notes","input":{}}]}}"#,
            "\n",
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"[{\"id\":\"n1\",\"title\":\"Lake\"}]"}]}]}}"#,
        );
        let (events, outcome) = run(ndjson);
        assert_eq!(events, vec![StreamEvent::NotesFound(vec![NoteRef { id: "n1".into(), title: "Lake".into() }])]);
        assert!(outcome.web.is_empty());
    }

    #[test]
    fn deltas_stream_and_junk_lines_are_ignored() {
        let ndjson = "not json\n{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hi\"}}}";
        assert_eq!(run(ndjson).0, vec![StreamEvent::Delta("Hi".into())]);
    }
}
