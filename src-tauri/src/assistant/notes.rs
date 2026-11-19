// Note chips: which vault notes a reply's tool calls returned.

use serde::Serialize;

// The MCP tools whose results name real notes (list_tags doesn't) — full
// `mcp__pensieve__<tool>` names, the shape a tool_use block's own "name" field actually
// carries (same as mcp/config.rs::ALLOWED_TOOLS).
pub const NOTE_TOOLS: &[&str] =
    &["mcp__pensieve__search_notes", "mcp__pensieve__get_note", "mcp__pensieve__list_recent", "mcp__pensieve__list_notes"];

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct NoteRef {
    pub id: String,
    pub title: String,
}

// A note tool's result content (search_notes/list_recent return a JSON array, get_note a
// single JSON object) — only ever asking for id/title, so this reads fine against any of
// NoteSummary/SearchMatch/NoteContent without caring which. An error result (a bare
// string like "no note with id x") fails to parse as JSON here and correctly yields no
// refs, not a crash.
pub fn extract_note_refs(content: &str) -> Vec<NoteRef> {
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
