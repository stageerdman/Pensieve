// Adding/removing one agent's knowledge files. Picking is a plain native file dialog;
// the actual work (copy the file in, extract its text, chunk it, embed every chunk
// locally, store it for retrieval) happens entirely on the Rust side — see
// src-tauri/src/knowledge/. This module only knows how to ask for that work, report
// progress as it happens, and report back what was stored. Ported from masters-wheel's
// src/lib/agents/knowledgeFiles.ts (AGENT-RAG), minus the space_folder every call there
// needed — Pensieve has exactly one vault.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { KnowledgeFile } from "./agents";

export const SUPPORTED_KNOWLEDGE_EXTENSIONS = ["txt", "md", "markdown", "pdf"];

export function isKnowledgeFilePath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_KNOWLEDGE_EXTENSIONS.includes(extension);
}

// Opens the native "add files" dialog; returns [] if the user cancels.
export async function pickKnowledgeFiles(): Promise<string[]> {
  const selection = await open({
    multiple: true,
    filters: [{ name: "Knowledge", extensions: SUPPORTED_KNOWLEDGE_EXTENSIONS }],
  });
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// Indexes one already-picked file for an agent. The caller passes its own `jobId` and
// should start listening via onKnowledgeIngestProgress with that same id *before*
// calling this, so no early progress event is missed — same jobId-then-subscribe-then-
// call shape as askAgent.ts. Throws (with a message safe to show the user) if the file
// type isn't supported or extraction fails.
export async function ingestKnowledgeFile(
  agentId: string,
  sourcePath: string,
  jobId: string,
): Promise<KnowledgeFile> {
  return invoke<KnowledgeFile>("ingest_knowledge_file", {
    jobId,
    agentId,
    fileId: crypto.randomUUID(),
    sourcePath,
    fileName: basenameOf(sourcePath),
  });
}

export type KnowledgeIngestProgress = {
  jobId: string;
  processed: number;
  total: number;
};

// Subscribes to chunk-indexing progress for every in-flight ingestion (the Rust side
// emits one global event); the caller filters by `jobId`. Returns the unlisten function.
export async function onKnowledgeIngestProgress(
  callback: (progress: KnowledgeIngestProgress) => void,
): Promise<() => void> {
  return listen<KnowledgeIngestProgress>("knowledge-ingest-progress", (event) =>
    callback(event.payload),
  );
}

export async function removeKnowledgeFile(
  agentId: string,
  file: KnowledgeFile,
): Promise<void> {
  await invoke("remove_knowledge_file", {
    agentId,
    fileId: file.id,
    fileName: file.name,
  });
}

// Deletes everything an agent "knows" in one shot — called when the agent itself is
// removed from the roster, not when an individual file is removed.
export async function removeAgentKnowledge(agentId: string): Promise<void> {
  await invoke("remove_agent_knowledge", { agentId });
}
