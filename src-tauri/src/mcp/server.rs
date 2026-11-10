// The MCP server Pensieve's AI assistant talks to. Deliberately not a separate compiled
// binary — this app's own executable re-execs itself with PENSIEVE_MCP_SERVER set (see
// main.rs), which sidesteps every question of how a second bin target gets bundled/
// signed into the packaged .app: there's only ever one binary, already bundled,
// already wherever `std::env::current_exe()` says it is. Claude Code CLI spawns this as
// an ordinary stdio-transport MCP server subprocess per assistant.rs's --mcp-config.
// Ported from masters-wheel's mcp/server.rs (same rmcp shape), stripped of its
// bridge/permission/multi-Space machinery Pensieve doesn't need (single-user, one vault).

use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, ServerCapabilities, ServerConfig},
    tool, tool_handler, tool_router,
    transport::stdio,
    ServiceExt,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::mcp::{paths, tools};

#[derive(Clone)]
pub struct PensieveServer {
    #[allow(dead_code)]
    tool_router: ToolRouter<PensieveServer>,
}

fn ok_json<T: serde::Serialize>(value: &T) -> Result<CallToolResult, McpError> {
    let json = serde_json::to_string_pretty(value).map_err(|e| McpError::internal_error(e.to_string(), None))?;
    Ok(CallToolResult::success(vec![ContentBlock::text(json)]))
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchNotesInput {
    /// A word or phrase to search for across every note's title and body. Plain
    /// case-insensitive substring match — not semantic — so use the exact words likely
    /// to have been written, not a paraphrase.
    pub query: String,
    /// Maximum number of matching notes to return. Omit for the default of 20.
    pub max_results: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetNoteInput {
    /// A note id from search_notes or list_recent.
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListRecentInput {
    /// How many notes to return, most recently updated first. Omit for the default of 20.
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateNoteInput {
    /// The note's Markdown body. The title is derived from its first line.
    pub body: String,
    /// Category names to file the note under. Omit for none.
    pub categories: Option<Vec<String>>,
    /// Tags to attach. Omit for none.
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EditNoteInput {
    pub id: String,
    /// Replace the Markdown body entirely. Omit to leave it unchanged.
    pub body: Option<String>,
    /// Replace the full category list. Omit to leave it unchanged.
    pub categories: Option<Vec<String>>,
    /// Replace the full tag list. Omit to leave it unchanged.
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AddTagInput {
    pub id: String,
    pub tag: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct LinkNoteInput {
    pub id: String,
    /// The id of the other note to link to.
    pub linked_id: String,
}

#[tool_router]
impl PensieveServer {
    fn new() -> Self {
        Self { tool_router: Self::tool_router() }
    }

    #[tool(
        description = "Search for a word or phrase across every note's title and body. Use this to find which note(s) mention a specific thing. Always safe to call. Returns each match's id, title, categories/tags, and a short snippet of real content — use get_note with a result's id to read the whole thing."
    )]
    async fn search_notes(&self, Parameters(input): Parameters<SearchNotesInput>) -> Result<CallToolResult, McpError> {
        ok_json(&tools::search_notes(&paths::vault_root(), &input.query, input.max_results))
    }

    #[tool(
        description = "Read one note's full content (title, categories, tags, links, and the whole Markdown body) by its id from search_notes or list_recent."
    )]
    async fn get_note(&self, Parameters(input): Parameters<GetNoteInput>) -> Result<CallToolResult, McpError> {
        match tools::get_note(&paths::vault_root(), &input.id) {
            Ok(note) => ok_json(&note),
            Err(message) => Ok(CallToolResult::success(vec![ContentBlock::text(message)])),
        }
    }

    #[tool(
        description = "List the most recently updated notes (id, title, categories, tags, and a short excerpt only — not the full body). Use this to see what's been written lately, or as a starting point before get_note. Always safe to call."
    )]
    async fn list_recent(&self, Parameters(input): Parameters<ListRecentInput>) -> Result<CallToolResult, McpError> {
        ok_json(&tools::list_recent(&paths::vault_root(), input.limit))
    }

    #[tool(description = "List every tag used anywhere in the vault. Always safe to call.")]
    async fn list_tags(&self) -> Result<CallToolResult, McpError> {
        ok_json(&tools::list_tags(&paths::vault_root()))
    }

    #[tool(description = "Create a new note with the given Markdown body and optional categories/tags. Returns the new note's id.")]
    async fn create_note(&self, Parameters(input): Parameters<CreateNoteInput>) -> Result<CallToolResult, McpError> {
        match tools::create_note(
            &paths::vault_root(),
            input.body,
            input.categories.unwrap_or_default(),
            input.tags.unwrap_or_default(),
        ) {
            Ok(id) => ok_json(&serde_json::json!({ "id": id })),
            Err(message) => Ok(CallToolResult::success(vec![ContentBlock::text(message)])),
        }
    }

    #[tool(description = "Edit an existing note by id — replace its body, categories, and/or tags. Any field left out is unchanged.")]
    async fn edit_note(&self, Parameters(input): Parameters<EditNoteInput>) -> Result<CallToolResult, McpError> {
        match tools::edit_note(&paths::vault_root(), &input.id, input.body, input.categories, input.tags) {
            Ok(()) => ok_json(&serde_json::json!({ "ok": true })),
            Err(message) => Ok(CallToolResult::success(vec![ContentBlock::text(message)])),
        }
    }

    #[tool(description = "Add a single tag to an existing note by id, leaving its other tags and body unchanged.")]
    async fn add_tag(&self, Parameters(input): Parameters<AddTagInput>) -> Result<CallToolResult, McpError> {
        match tools::add_tag(&paths::vault_root(), &input.id, &input.tag) {
            Ok(()) => ok_json(&serde_json::json!({ "ok": true })),
            Err(message) => Ok(CallToolResult::success(vec![ContentBlock::text(message)])),
        }
    }

    #[tool(description = "Link one note to another by id, leaving everything else about both notes unchanged.")]
    async fn link_note(&self, Parameters(input): Parameters<LinkNoteInput>) -> Result<CallToolResult, McpError> {
        match tools::link_note(&paths::vault_root(), &input.id, &input.linked_id) {
            Ok(()) => ok_json(&serde_json::json!({ "ok": true })),
            Err(message) => Ok(CallToolResult::success(vec![ContentBlock::text(message)])),
        }
    }
}

#[tool_handler]
impl ServerHandler for PensieveServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Tools for reading (and, once allowed, writing) the user's Pensieve vault of notes \
             and journal entries."
                .to_string(),
        )
    }
}

pub fn run_stdio() {
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(e) => {
            eprintln!("pensieve mcp server: failed to start tokio runtime: {e}");
            return;
        }
    };
    runtime.block_on(async {
        let service = match PensieveServer::new().serve(stdio()).await {
            Ok(service) => service,
            Err(e) => {
                eprintln!("pensieve mcp server: failed to start: {e}");
                return;
            }
        };
        if let Err(e) = service.waiting().await {
            eprintln!("pensieve mcp server: error while serving: {e}");
        }
    });
}
