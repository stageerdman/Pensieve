// State + effects for the Patronus assistant — phase (open/closed), the editable agent
// roster (loaded from disk via agentStore), and one running conversation per agent (own
// session id + message history), kept entirely in memory for this v1 (see this update's
// wiki.md: chat history persistence to disk is a later phase, not inside this one).

import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_AGENTS, type Agent } from "../../lib/ai/agents";
import { listAgents, saveAgents } from "../../lib/ai/agentStore";
import {
  askAgent,
  listAssistantTools,
  onAskAgentProgress,
  onAssistantNotesFound,
  onAssistantWebCall,
  WEB_TOOL_ID,
  type AssistantTool,
  type NoteRef,
  type WebCall,
} from "../../lib/ai/askAgent";
import { isTauri } from "../../lib/store";
import { log } from "../../lib/logger";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  error?: boolean;
  /** On a reply: the user text it answers, so Retry / "Search the web" can resend it
   *  without the user retyping (see this update's wiki.md / UX review). */
  prompt?: string;
  /** Tool ids this message was sent with (stamped on both the user message and its
   *  reply), so the transcript knows when the web was on. */
  tools?: string[];
  /** Notes the reply's own search_notes/get_note/list_recent tool calls actually found
   *  — rendered as clickable chips so a memory can be opened as a tab, not just
   *  described in prose. Deduped by id as tool results arrive. */
  foundNotes?: NoteRef[];
  /** Web calls the reply made: live (sources empty) while streaming, then replaced by
   *  the final list from Rust (only calls that actually ran, with their sources). */
  web?: WebCall[];
};

interface AgentSession {
  sessionId?: string;
  messages: ChatMessage[];
  /** Scoped per agent, not global — switching agents mid-reply shouldn't lock the
   *  composer for an agent that isn't actually busy (see UX review). */
  sending: boolean;
  /** Tool ids switched on for this chat (PATRONUS-WEB-TOOLS). Starts empty for every
   *  chat and every app start; sticks for this chat until switched off. */
  tools: string[];
}

const EMPTY_SESSION: AgentSession = { messages: [], sending: false, tools: [] };

export interface SendOptions {
  /** Grant these tools to this one message instead of the chat's own set. The chat
   *  setting is left as it is ("Search the web" on a single reply). */
  tools?: string[];
}

function newJobId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Fired after every agent reply: its tools may have written to the vault (tags). */
export const VAULT_TOUCHED_EVENT = "pensieve:vault-touched";

export function useAssistant() {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(SEED_AGENTS);
  const [agentId, setAgentId] = useState(SEED_AGENTS[0].id);
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({});
  // Keyed by agentId, not a single ref — a reply in flight for one agent must not be
  // clobbered by another agent's unlisten while both are mid-stream.
  const unlistenByAgent = useRef<Map<string, () => void>>(new Map());
  const [availableTools, setAvailableTools] = useState<AssistantTool[]>([]);

  // The slash commands' list comes from the Rust registry only (ids + labels live there).
  // AI is desktop-only, so outside Tauri the list just stays empty.
  useEffect(() => {
    if (!isTauri()) return;
    void listAssistantTools()
      .then(setAvailableTools)
      .catch((err) => {
        // An empty list means no slash commands; the log is the only trace of why.
        log.error("assistant", "tools.list.failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        setAvailableTools([]);
      });
  }, []);

  useEffect(() => {
    void listAgents().then((loaded) => {
      setAgents(loaded);
      setAgentId((cur) =>
        loaded.some((a) => a.id === cur) ? cur : (loaded[0]?.id ?? cur),
      );
    });
  }, []);

  /** Persist + apply a new roster in one step — used by the Agents editor tab after a
   *  save/delete so the picker everywhere else updates immediately, no reload round-trip. */
  const setRoster = useCallback(async (next: Agent[]) => {
    await saveAgents(next);
    setAgents(next);
    setAgentId((cur) =>
      next.some((a) => a.id === cur) ? cur : (next[0]?.id ?? cur),
    );
  }, []);

  const getAgent = useCallback(
    (id: string): Agent =>
      agents.find((a) => a.id === id) ?? agents[0] ?? SEED_AGENTS[0],
    [agents],
  );

  const session = sessions[agentId] ?? EMPTY_SESSION;

  const patchSession = useCallback(
    (forAgentId: string, patch: Partial<AgentSession>) => {
      setSessions((prev) => ({
        ...prev,
        [forAgentId]: { ...(prev[forAgentId] ?? EMPTY_SESSION), ...patch },
      }));
    },
    [],
  );

  const patchMessage = useCallback(
    (forAgentId: string, id: string, patch: Partial<ChatMessage>) => {
      setSessions((prev) => {
        const s = prev[forAgentId] ?? EMPTY_SESSION;
        return {
          ...prev,
          [forAgentId]: {
            ...s,
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, ...patch } : m,
            ),
          },
        };
      });
    },
    [],
  );

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const trimmed = text.trim();
      const forAgentId = agentId;
      if (!trimmed || (sessions[forAgentId]?.sending ?? false)) return;
      const agent = getAgent(forAgentId);
      // The set in effect right now is exactly what this one message is granted.
      const tools = options.tools ?? sessions[forAgentId]?.tools ?? [];
      const userMsg: ChatMessage = {
        id: newJobId(),
        role: "user",
        text: trimmed,
        tools,
      };
      const replyId = newJobId();
      const replyMsg: ChatMessage = {
        id: replyId,
        role: "assistant",
        text: "",
        streaming: true,
        prompt: trimmed,
        tools,
      };

      setSessions((prev) => {
        const s = prev[forAgentId] ?? EMPTY_SESSION;
        return {
          ...prev,
          [forAgentId]: {
            ...s,
            sending: true,
            messages: [...s.messages, userMsg, replyMsg],
          },
        };
      });

      const jobId = newJobId();
      let streamed = "";
      let foundSoFar: NoteRef[] = [];
      const unlistenProgress = await onAskAgentProgress(jobId, (delta) => {
        streamed += delta;
        patchMessage(forAgentId, replyId, { text: streamed });
      });
      const unlistenNotes = await onAssistantNotesFound(jobId, (notes) => {
        for (const n of notes) {
          if (!foundSoFar.some((f) => f.id === n.id))
            foundSoFar = [...foundSoFar, n];
        }
        patchMessage(forAgentId, replyId, { foundNotes: foundSoFar });
      });
      let webSoFar: WebCall[] = [];
      const unlistenWeb = await onAssistantWebCall(jobId, (call) => {
        webSoFar = [...webSoFar, { ...call, sources: [] }];
        patchMessage(forAgentId, replyId, { web: webSoFar });
      });
      const unlisten = () => {
        unlistenProgress();
        unlistenNotes();
        unlistenWeb();
      };
      unlistenByAgent.current.get(forAgentId)?.();
      unlistenByAgent.current.set(forAgentId, unlisten);

      try {
        const priorSessionId = sessions[forAgentId]?.sessionId;
        const reply = await askAgent(
          jobId,
          trimmed,
          agent.systemPrompt,
          agent.id,
          priorSessionId,
          tools,
        );
        patchMessage(forAgentId, replyId, {
          text: reply.text,
          streaming: false,
          web: reply.web,
        });
        patchSession(forAgentId, { sessionId: reply.sessionId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        patchMessage(forAgentId, replyId, {
          text: message,
          streaming: false,
          error: true,
        });
      } finally {
        unlisten();
        unlistenByAgent.current.delete(forAgentId);
        patchSession(forAgentId, { sending: false });
        // The agent may have written to the vault (add_tag) — let the app re-read it.
        window.dispatchEvent(new Event(VAULT_TOUCHED_EVENT));
      }
    },
    [agentId, sessions, getAgent, patchMessage, patchSession],
  );

  // Only hides the popover — does NOT tear down in-flight listeners. A reply may still
  // be streaming and visible elsewhere (the full-screen assistant tab shares this same
  // state via AssistantContext), so "closed" here must not mean "stop listening." Each
  // send()'s own `finally` block is what actually cleans up its listener.
  const close = useCallback(() => setOpen(false), []);

  /** Switch the current chat's tools. Takes effect from the next message on. */
  const setTools = useCallback(
    (tools: string[]) => patchSession(agentId, { tools }),
    [agentId, patchSession],
  );

  return {
    open,
    openAssistant: () => setOpen(true),
    close,
    agents,
    setRoster,
    agentId,
    setAgentId,
    messages: session.messages,
    sending: session.sending,
    send,
    availableTools,
    webToolId: availableTools.some((t) => t.id === WEB_TOOL_ID)
      ? WEB_TOOL_ID
      : undefined,
    tools: session.tools,
    setTools,
  };
}

export type AssistantState = ReturnType<typeof useAssistant>;
