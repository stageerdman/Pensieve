// Frontend wrapper for the Rust side (src-tauri/src/assistant.rs) — same jobId +
// progress-event shape src/lib/transcripts/nativeEngine.ts already uses for streamed
// Rust work, since a reply now streams in token-by-token instead of arriving as one blob.

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

export type WebSource = { title: string | null; url: string };
/** One web call a reply made: `detail` is the query or URL that left the machine. */
export type WebCall = {
  kind: "search" | "fetch";
  detail: string;
  sources: WebSource[];
};
export type AgentReply = { text: string; sessionId: string; web: WebCall[] };

/** `tools` are tool ids from listAssistantTools() (e.g. ["web"]) granted to this one
 *  message; [] grants nothing. Rust rejects an unknown id. */
export async function askAgent(
  jobId: string,
  message: string,
  instructions: string,
  agentId: string,
  sessionId: string | undefined,
  tools: string[],
): Promise<AgentReply> {
  return invoke<AgentReply>("ask_agent", {
    jobId,
    message,
    instructions,
    agentId,
    sessionId: sessionId ?? null,
    tools,
  });
}

export type AssistantTool = { id: string; label: string; description: string };

/** The registry id of web search — the one tool the chat has web-specific UI for
 *  ("Search the web" on a reply). Everything else reads the list generically. */
export const WEB_TOOL_ID = "web";

/** The tools a chat may switch on, from the Rust registry (ai_tools/registry.rs). */
export async function listAssistantTools(): Promise<AssistantTool[]> {
  return invoke<AssistantTool[]>("list_assistant_tools");
}

interface AssistantWebCallPayload {
  jobId: string;
  kind: WebCall["kind"];
  detail: string;
}

/** Fires the moment a reply calls a web tool, before results: drives the live
 *  "Searching the web: …" line. Sources arrive with the final AgentReply.web. */
export async function onAssistantWebCall(
  jobId: string,
  onCall: (call: Omit<WebCall, "sources">) => void,
): Promise<UnlistenFn> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AssistantWebCallPayload>("assistant-web-call", (event) => {
    if (event.payload.jobId === jobId)
      onCall({ kind: event.payload.kind, detail: event.payload.detail });
  });
}

interface AskAgentProgressPayload {
  jobId: string;
  delta: string;
}

/** Subscribes to delta chunks for every in-flight reply (one global Rust event); the
 *  caller filters by jobId, same pattern as nativeEngine.ts's transcribe-progress. */
export async function onAskAgentProgress(
  jobId: string,
  onDelta: (delta: string) => void,
): Promise<UnlistenFn> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AskAgentProgressPayload>("ask-agent-progress", (event) => {
    if (event.payload.jobId === jobId) onDelta(event.payload.delta);
  });
}

export type NoteRef = { id: string; title: string };

interface AssistantNotesFoundPayload {
  jobId: string;
  notes: NoteRef[];
}

/** Fires once per search_notes/get_note/list_recent tool call a reply makes, as soon as
 *  that tool's own result comes back — before the reply text has even finished
 *  streaming. Lets the chat show clickable note chips instead of only prose describing
 *  them (see assistant.rs's NOTE_TOOLS/extract_note_refs). */
export async function onAssistantNotesFound(
  jobId: string,
  onNotes: (notes: NoteRef[]) => void,
): Promise<UnlistenFn> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<AssistantNotesFoundPayload>(
    "assistant-notes-found",
    (event) => {
      if (event.payload.jobId === jobId) onNotes(event.payload.notes);
    },
  );
}
