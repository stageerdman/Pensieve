// State + effects for the Patronus assistant — phase (open/closed), the active agent,
// and one running conversation per agent (own session id + message history), kept
// entirely in memory for this v1 (see this update's wiki.md: chat history persistence
// to disk is a later phase, not inside this one).

import { useCallback, useRef, useState } from "react";
import { AGENTS, DEFAULT_AGENT_ID, getAgent } from "../../lib/ai/agents";
import { askAgent, onAskAgentProgress } from "../../lib/ai/askAgent";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  error?: boolean;
};

interface AgentSession {
  sessionId?: string;
  messages: ChatMessage[];
}

function newJobId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAssistant() {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({});
  const [sending, setSending] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  const messages = sessions[agentId]?.messages ?? [];

  const patchMessage = useCallback((forAgentId: string, id: string, patch: Partial<ChatMessage>) => {
    setSessions((prev) => {
      const session = prev[forAgentId] ?? { messages: [] };
      return {
        ...prev,
        [forAgentId]: {
          ...session,
          messages: session.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        },
      };
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const forAgentId = agentId;
      const agent = getAgent(forAgentId);
      const userMsg: ChatMessage = { id: newJobId(), role: "user", text: trimmed };
      const replyId = newJobId();
      const replyMsg: ChatMessage = { id: replyId, role: "assistant", text: "", streaming: true };

      setSessions((prev) => {
        const session = prev[forAgentId] ?? { messages: [] };
        return { ...prev, [forAgentId]: { ...session, messages: [...session.messages, userMsg, replyMsg] } };
      });
      setSending(true);

      const jobId = newJobId();
      let streamed = "";
      const unlisten = await onAskAgentProgress(jobId, (delta) => {
        streamed += delta;
        patchMessage(forAgentId, replyId, { text: streamed });
      });
      unlistenRef.current = unlisten;

      try {
        const priorSessionId = sessions[forAgentId]?.sessionId;
        const reply = await askAgent(jobId, trimmed, agent.systemPrompt, priorSessionId);
        patchMessage(forAgentId, replyId, { text: reply.text, streaming: false });
        setSessions((prev) => ({
          ...prev,
          [forAgentId]: { ...(prev[forAgentId] ?? { messages: [] }), sessionId: reply.sessionId },
        }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        patchMessage(forAgentId, replyId, { text: message, streaming: false, error: true });
      } finally {
        unlisten();
        unlistenRef.current = null;
        setSending(false);
      }
    },
    [agentId, sending, sessions, patchMessage],
  );

  const close = useCallback(() => {
    unlistenRef.current?.();
    setOpen(false);
  }, []);

  return {
    open,
    openAssistant: () => setOpen(true),
    close,
    agents: AGENTS,
    agentId,
    setAgentId,
    messages,
    sending,
    send,
  };
}
