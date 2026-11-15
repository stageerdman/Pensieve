// The real (Tauri-only) call behind form spells: `claude -p` with the Pensieve MCP server's
// READ tools (src-tauri/src/ai_text.rs ask_claude_with_vault). Desktop-only by design.
import { invoke } from "@tauri-apps/api/core";

export function askClaudeVaultTauri(prompt: string): Promise<string> {
  return invoke<string>("ask_claude_with_vault", { prompt });
}
