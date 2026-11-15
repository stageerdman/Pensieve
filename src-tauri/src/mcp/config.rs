// Generates the --mcp-config file assistant.rs hands to each `claude -p` call: one
// server entry pointing back at this app's own running binary (re-exec'd with
// PENSIEVE_MCP_SERVER set — see main.rs and server.rs's doc comment), so Claude Code
// CLI spawns our stdio MCP server instead of looking for a separately-installed one.
// Ported from masters-wheel's mcp/config.rs, stripped of its bridge/multi-Space
// machinery — Pensieve is single-user with exactly one vault, so the only thing the
// subprocess needs to be told is where that vault lives.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::mcp::paths::VAULT_ROOT_ENV;

static CONFIG_COUNTER: AtomicU64 = AtomicU64::new(0);

pub const MCP_SERVER_ENV: &str = "PENSIEVE_MCP_SERVER";

/// Tool names actually granted to the model via `--allowedTools`, in the
/// `mcp__pensieve__<tool>` shape the CLI expects. Read tools + add_tag (TAGS update,
/// 2026-11-13: the owner asks the AI to tag entries; the tool itself refuses new tags
/// without an explicit create flag). The other write tools stay off — see the
/// PATRONUS-AI wiki.md for why.
pub const ALLOWED_TOOLS: &[&str] = &[
    "mcp__pensieve__search_notes",
    "mcp__pensieve__get_note",
    "mcp__pensieve__list_recent",
    "mcp__pensieve__list_tags",
    "mcp__pensieve__add_tag",
];

/// Built on the server (mcp/server.rs) and ready to flip on — not in ALLOWED_TOOLS, so
/// the CLI will refuse to call them even though the server declares them. Flipping one
/// on is a one-line move into ALLOWED_TOOLS above, not new code.
pub const WRITE_TOOLS: &[&str] = &[
    "mcp__pensieve__create_note",
    "mcp__pensieve__edit_note",
    "mcp__pensieve__link_note",
];

pub fn write_config_file(vault_root: &Path) -> io::Result<PathBuf> {
    let current_exe = std::env::current_exe()?;
    let config = serde_json::json!({
        "mcpServers": {
            "pensieve": {
                "command": current_exe.to_string_lossy(),
                "args": [],
                "env": {
                    MCP_SERVER_ENV: "1",
                    VAULT_ROOT_ENV: vault_root.to_string_lossy(),
                }
            }
        }
    });

    let path = std::env::temp_dir().join(format!(
        "pensieve-mcp-config-{}-{}.json",
        std::process::id(),
        CONFIG_COUNTER.fetch_add(1, Ordering::SeqCst)
    ));
    std::fs::write(&path, serde_json::to_vec(&config)?)?;
    Ok(path)
}
