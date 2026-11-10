// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Re-exec entry point for the Pensieve MCP server (see src/mcp/server.rs's doc
// comment): Claude Code CLI spawns this exact binary again as a stdio MCP server
// subprocess, with this env var set so it skips the GUI app entirely instead of
// opening a second window.
const MCP_SERVER_ENV: &str = "PENSIEVE_MCP_SERVER";

fn main() {
    if std::env::var(MCP_SERVER_ENV).is_ok() {
        app_lib::mcp::server::run_stdio();
        return;
    }
    app_lib::run();
}
