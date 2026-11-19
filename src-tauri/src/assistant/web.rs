// Web calls a reply made through the CLI's built-in WebSearch/WebFetch: what was asked
// (the query or URL that left the machine) and the sources that came back. Shapes are
// from real recordings (fixtures/, spike in updates/2026-11-19 PATRONUS-WEB-TOOLS).

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WebKind {
    Search,
    Fetch,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct WebSource {
    /// Search results carry a title; a fetched page doesn't.
    pub title: Option<String>,
    pub url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct WebCall {
    /// The CLI tool name, kept for the permission check, not sent to the UI.
    #[serde(skip)]
    pub tool: String,
    pub kind: WebKind,
    /// The search query or the fetched URL: exactly what left the machine.
    pub detail: String,
    pub sources: Vec<WebSource>,
}

/// A tool_use block → a web call, if it is one. Sources come later, with the result.
pub fn web_call(block: &Value) -> Option<WebCall> {
    let tool = block.get("name")?.as_str()?;
    let (kind, field) = match tool {
        "WebSearch" => (WebKind::Search, "query"),
        "WebFetch" => (WebKind::Fetch, "url"),
        _ => return None,
    };
    let detail = block["input"][field].as_str().unwrap_or_default().to_string();
    Some(WebCall { tool: tool.to_string(), kind, detail, sources: Vec::new() })
}

/// The sources a successful call returned. `tool_use_result` is the CLI's structured
/// copy of the result on the "user" event: for a search, `results[]` mixes link lists
/// (`{content: [{title, url}]}`) with plain-text commentary, which is skipped.
pub fn sources_of(call: &WebCall, tool_use_result: &Value) -> Vec<WebSource> {
    match call.kind {
        WebKind::Fetch => vec![WebSource { title: None, url: call.detail.clone() }],
        WebKind::Search => {
            let mut sources: Vec<WebSource> = Vec::new();
            let links = tool_use_result["results"].as_array().into_iter().flatten().filter_map(|r| r["content"].as_array()).flatten();
            for link in links {
                let Some(url) = link["url"].as_str() else { continue };
                if sources.iter().any(|s| s.url == url) {
                    continue;
                }
                let title = link["title"].as_str().map(str::to_string);
                sources.push(WebSource { title, url: url.to_string() });
            }
            sources
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_a_search_and_a_fetch_and_ignores_other_tools() {
        let search = web_call(&json!({"name":"WebSearch","input":{"query":"rust release"}})).unwrap();
        assert_eq!((search.kind, search.detail.as_str()), (WebKind::Search, "rust release"));
        let fetch = web_call(&json!({"name":"WebFetch","input":{"url":"https://a.org/x"}})).unwrap();
        assert_eq!((fetch.kind, fetch.detail.as_str()), (WebKind::Fetch, "https://a.org/x"));
        assert!(web_call(&json!({"name":"mcp__pensieve__get_note","input":{}})).is_none());
    }

    #[test]
    fn search_sources_skip_commentary_and_duplicates() {
        let call = web_call(&json!({"name":"WebSearch","input":{"query":"q"}})).unwrap();
        let result = json!({"results":[
            {"content":[{"title":"A","url":"https://a.org"},{"title":"A again","url":"https://a.org"}]},
            "some commentary text",
            {"content":[{"url":"https://b.org"}]}
        ]});
        let sources = sources_of(&call, &result);
        assert_eq!(sources, vec![
            WebSource { title: Some("A".into()), url: "https://a.org".into() },
            WebSource { title: None, url: "https://b.org".into() },
        ]);
    }

    #[test]
    fn a_fetch_source_is_its_url() {
        let call = web_call(&json!({"name":"WebFetch","input":{"url":"https://a.org/x"}})).unwrap();
        assert_eq!(sources_of(&call, &json!({"code":200})), vec![WebSource { title: None, url: "https://a.org/x".into() }]);
    }
}
