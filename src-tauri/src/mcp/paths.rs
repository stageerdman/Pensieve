// Where the MCP server subprocess finds the vault — it's a separate re-exec of this same
// binary (see mcp/server.rs's doc comment), with no AppHandle of its own to call
// app.path().app_data_dir() on, so the one path it needs is passed in as an env var by
// whoever wrote its --mcp-config (see mcp/config.rs::write_config_file).

use std::path::PathBuf;

pub const VAULT_ROOT_ENV: &str = "PENSIEVE_VAULT_ROOT";

pub fn vault_root() -> PathBuf {
    PathBuf::from(std::env::var(VAULT_ROOT_ENV).unwrap_or_else(|_| {
        panic!("{VAULT_ROOT_ENV} not set — the MCP server must only ever be launched via mcp::config::write_config_file")
    }))
}
