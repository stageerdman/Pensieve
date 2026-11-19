// The tools a chat message can be granted, by id. The UI only ever sends ids ("web");
// this table is the one place that knows which CLI tool names an id unlocks, so the
// frontend can never grant a raw CLI tool by name. Pure: no I/O.

use serde::Serialize;
use std::fmt;

#[derive(Debug, PartialEq, Eq)]
pub struct ToolDef {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    /// The CLI's own built-in tools this grant loads (`--tools`) and allows.
    pub cli_builtins: &'static [&'static str],
    /// Pensieve MCP tools (`mcp__pensieve__*`) this grant allows.
    pub mcp_tools: &'static [&'static str],
    /// Told to the model when granted / not granted. The "off" line matters: without
    /// it, a web question with no web tools made the CLI hang or return an empty reply
    /// (spike, wiki.md).
    pub on_note: &'static str,
    pub off_note: &'static str,
}

pub const WEB: ToolDef = ToolDef {
    id: "web",
    label: "Web search",
    description: "Search the web and read pages for this chat.",
    cli_builtins: &["WebSearch", "WebFetch"],
    mcp_tools: &[],
    on_note: "Web search is ON for this message: you may use WebSearch and WebFetch. \
        Keep search queries and URLs generic: never put names, private details or text \
        from the owner's notes into a query or URL.",
    off_note: "Web search is OFF for this message: you cannot search or open web pages, \
        even if you did earlier in this chat. If a question needs current information \
        from the web, say plainly that you can't look it up right now, give your best \
        answer from what you know, and say the owner can switch on Web search next to Send.",
};

pub const TOOLS: &[&ToolDef] = &[&WEB];

#[derive(Debug, PartialEq, Eq)]
pub struct UnknownTool(pub String);

impl fmt::Display for UnknownTool {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown tool id \"{}\" (known: {})", self.0, ids_of(TOOLS).join(", "))
    }
}

/// The tools granted to one CLI call, in registry order, each at most once.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ToolGrants {
    granted: Vec<&'static ToolDef>,
}

impl ToolGrants {
    pub fn none() -> Self {
        Self::default()
    }

    pub fn ids(&self) -> Vec<&'static str> {
        ids_of(&self.granted)
    }

    fn grants_builtin(&self, name: &str) -> bool {
        self.granted.iter().any(|t| t.cli_builtins.contains(&name))
    }

    pub fn cli_builtins(&self) -> Vec<&'static str> {
        self.granted.iter().flat_map(|t| t.cli_builtins.iter().copied()).collect()
    }

    /// Every registry built-in this call does NOT get — passed as a hard deny, so a
    /// tool stays off even through the CLI's own pre-approved paths (spike: WebFetch to
    /// some sites ran while merely left off the allowlist).
    pub fn denied_builtins(&self) -> Vec<&'static str> {
        TOOLS.iter().flat_map(|t| t.cli_builtins.iter().copied()).filter(|b| !self.grants_builtin(b)).collect()
    }

    pub fn allowed_tools(&self, base: &[&'static str]) -> Vec<&'static str> {
        let granted = self.granted.iter().flat_map(|t| t.cli_builtins.iter().chain(t.mcp_tools.iter()).copied());
        base.iter().copied().chain(granted).collect()
    }

    /// One line per registry tool saying whether it is on, for the system prompt.
    pub fn prompt_note(&self) -> String {
        TOOLS
            .iter()
            .map(|t| if self.granted.contains(t) { t.on_note } else { t.off_note })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub fn resolve(ids: &[String]) -> Result<ToolGrants, UnknownTool> {
    if let Some(unknown) = ids.iter().find(|id| !TOOLS.iter().any(|t| t.id == id.as_str())) {
        return Err(UnknownTool(unknown.clone()));
    }
    let granted = TOOLS.iter().copied().filter(|t| ids.iter().any(|id| id == t.id)).collect();
    Ok(ToolGrants { granted })
}

fn ids_of(tools: &[&ToolDef]) -> Vec<&'static str> {
    tools.iter().map(|t| t.id).collect()
}

/// What the picker shows: id + label + description, never CLI names.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct ToolInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
}

pub fn list() -> Vec<ToolInfo> {
    TOOLS.iter().map(|t| ToolInfo { id: t.id, label: t.label, description: t.description }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn no_ids_grants_nothing_and_denies_every_builtin() {
        let grants = resolve(&[]).unwrap();
        assert_eq!(grants, ToolGrants::none());
        assert!(grants.cli_builtins().is_empty());
        assert_eq!(grants.denied_builtins(), vec!["WebSearch", "WebFetch"]);
    }

    #[test]
    fn web_grants_both_builtins_and_denies_none() {
        let grants = resolve(&ids(&["web"])).unwrap();
        assert_eq!(grants.cli_builtins(), vec!["WebSearch", "WebFetch"]);
        assert!(grants.denied_builtins().is_empty());
        assert_eq!(grants.allowed_tools(&["base"]), vec!["base", "WebSearch", "WebFetch"]);
    }

    #[test]
    fn unknown_id_fails_and_names_the_id() {
        let err = resolve(&ids(&["web", "Bash"])).unwrap_err();
        assert_eq!(err, UnknownTool("Bash".into()));
        assert!(err.to_string().contains("\"Bash\""));
    }

    #[test]
    fn raw_cli_names_are_not_ids() {
        assert!(resolve(&ids(&["WebSearch"])).is_err());
    }

    #[test]
    fn duplicate_ids_grant_once() {
        assert_eq!(resolve(&ids(&["web", "web"])).unwrap().ids(), vec!["web"]);
    }

    #[test]
    fn prompt_note_says_web_is_off_unless_granted() {
        assert_eq!(ToolGrants::none().prompt_note(), WEB.off_note);
        assert_eq!(resolve(&ids(&["web"])).unwrap().prompt_note(), WEB.on_note);
    }
}
