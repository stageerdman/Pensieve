// Load/save the AI agent roster. Same shape as lib/categories/store.ts (a single JSON
// file at <vault>/agents.json, travelling with backup/sync, mirrored to localStorage in
// the browser dev build) — not masters-wheel's one-file-per-agent folder, since
// Pensieve already has an established convention for "a small editable collection" and
// there's no per-agent knowledge/RAG data here that would need its own folder (see this
// update's wiki.md: knowledge files were deliberately not ported).

import { log } from "../logger";
import { SEED_AGENTS, type Agent } from "./agents";

const FILE = "agents.json";
const LS_KEY = "pensieve:agents";
const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface Stored {
  version: number;
  agents: Agent[];
}

function sanitize(parsed: unknown): Agent[] {
  const list = (parsed as Stored)?.agents ?? (parsed as Agent[]);
  if (!Array.isArray(list)) return [...SEED_AGENTS];
  const out: Agent[] = [];
  for (const a of list) {
    const id = typeof a?.id === "string" ? a.id.trim() : "";
    const name = typeof a?.name === "string" ? a.name.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      tagline: typeof a?.tagline === "string" ? a.tagline : "",
      systemPrompt: typeof a?.systemPrompt === "string" ? a.systemPrompt : "",
    });
  }
  return out.length ? out : [...SEED_AGENTS];
}

export async function listAgents(): Promise<Agent[]> {
  try {
    if (inTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string | null>("read_text", { rel: FILE });
      if (!raw) {
        await saveAgents(SEED_AGENTS);
        return [...SEED_AGENTS];
      }
      return sanitize(JSON.parse(raw));
    }
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      await saveAgents(SEED_AGENTS);
      return [...SEED_AGENTS];
    }
    return sanitize(JSON.parse(raw));
  } catch {
    log.warn("agents", "load.failed");
    return [...SEED_AGENTS];
  }
}

export async function saveAgents(agents: Agent[]): Promise<void> {
  const payload = JSON.stringify({ version: 1, agents } satisfies Stored);
  try {
    if (inTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_text", { rel: FILE, contents: payload });
    } else {
      localStorage.setItem(LS_KEY, payload);
    }
    log.debug("agents", "save", { count: agents.length });
  } catch {
    log.warn("agents", "save.failed");
  }
}

export function newDraftAgent(): Agent {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name: "New Agent", tagline: "", systemPrompt: "" };
}
