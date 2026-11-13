// The real (Tauri-only) text call behind Forms — shells out to the logged-in `claude` CLI via
// the ask_claude_text command (src-tauri/src/ai_text.rs). Desktop-only by design (CLAUDE.md).
import { invoke } from "@tauri-apps/api/core";

export function askClaudeTauri(prompt: string): Promise<string> {
  return invoke<string>("ask_claude_text", { prompt });
}
