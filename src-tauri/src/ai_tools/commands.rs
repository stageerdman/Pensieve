// Tauri glue: the picker reads the grantable tools from here, so ids and labels live
// only in registry.rs.

use super::registry::{list, ToolInfo};

#[tauri::command]
pub fn list_assistant_tools() -> Vec<ToolInfo> {
    list()
}
