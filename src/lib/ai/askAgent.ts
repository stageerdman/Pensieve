// Frontend wrapper for the Rust side (src-tauri/src/assistant.rs) — same jobId +
// progress-event shape src/lib/transcripts/nativeEngine.ts already uses for streamed
// Rust work, since a reply now streams in token-by-token instead of arriving as one blob.

import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

export type AgentReply = { text: string; sessionId: string };

export async function askAgent(
  jobId: string,
  message: string,
  instructions: string,
  sessionId: string | undefined,
): Promise<AgentReply> {
  return invoke<AgentReply>("ask_agent", {
    jobId,
    message,
    instructions,
    sessionId: sessionId ?? null,
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
