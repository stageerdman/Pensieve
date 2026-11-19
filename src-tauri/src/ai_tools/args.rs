// The one place that turns a grant into `claude` CLI tool flags, for chat (assistant)
// and spells (ai_text) alike, so the two can't drift apart.
//   --strict-mcp-config: only Pensieve's own MCP server is considered.
//   --tools: the CLI's built-in tools to load. "" when nothing is granted — this also
//     keeps out ~20k tokens/reply of built-in schema bloat (see assistant/mod.rs).
//   --disallowedTools: a hard deny for every registry built-in not granted (see
//     ToolGrants::denied_builtins for why the allowlist alone is not enough).
//   --permission-mode dontAsk: anything off the allowlist is refused, never prompted
//     (nobody can answer a prompt in -p mode).

use std::path::Path;

use super::registry::ToolGrants;

pub fn tool_args(mcp_config: &Path, base: &[&'static str], grants: &ToolGrants) -> Vec<String> {
    let mut args = vec![
        "--mcp-config".to_string(),
        mcp_config.to_string_lossy().into_owned(),
        "--strict-mcp-config".into(),
        "--allowedTools".into(),
        grants.allowed_tools(base).join(","),
        "--tools".into(),
        grants.cli_builtins().join(","),
    ];
    let denied = grants.denied_builtins();
    if !denied.is_empty() {
        args.push("--disallowedTools".into());
        args.push(denied.join(","));
    }
    args.push("--permission-mode".into());
    args.push("dontAsk".into());
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_tools::registry::resolve;
    use crate::mcp::config::{ALLOWED_TOOLS, READ_TOOLS};

    fn value_of<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        args.iter().position(|a| a == flag).map(|i| args[i + 1].as_str())
    }

    fn config() -> &'static Path {
        Path::new("/tmp/pensieve-mcp.json")
    }

    #[test]
    fn no_grants_keeps_todays_chat_flags_and_hard_denies_web() {
        let args = tool_args(config(), ALLOWED_TOOLS, &resolve(&[]).unwrap());
        assert_eq!(value_of(&args, "--tools"), Some(""));
        assert_eq!(value_of(&args, "--allowedTools"), Some(ALLOWED_TOOLS.join(",").as_str()));
        assert_eq!(value_of(&args, "--disallowedTools"), Some("WebSearch,WebFetch"));
        assert_eq!(value_of(&args, "--permission-mode"), Some("dontAsk"));
        assert!(args.contains(&"--strict-mcp-config".to_string()));
    }

    #[test]
    fn web_grant_loads_and_allows_both_web_tools() {
        let args = tool_args(config(), ALLOWED_TOOLS, &resolve(&["web".into()]).unwrap());
        assert_eq!(value_of(&args, "--tools"), Some("WebSearch,WebFetch"));
        let allowed = format!("{},WebSearch,WebFetch", ALLOWED_TOOLS.join(","));
        assert_eq!(value_of(&args, "--allowedTools"), Some(allowed.as_str()));
        assert!(!args.contains(&"--disallowedTools".to_string()));
    }

    #[test]
    fn spell_args_never_allow_web_or_add_tag() {
        let args = tool_args(config(), READ_TOOLS, &crate::ai_tools::registry::ToolGrants::none());
        let allowed = value_of(&args, "--allowedTools").unwrap();
        assert!(!allowed.contains("Web"));
        assert!(!allowed.contains("add_tag"));
        assert_eq!(value_of(&args, "--tools"), Some(""));
    }
}
