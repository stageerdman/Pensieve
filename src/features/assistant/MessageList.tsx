import { useEffect, useRef } from "react";
import type { ChatMessage } from "./useAssistant";

// Plain text bubbles for v1 — no Markdown rendering yet (a reply is read, not edited,
// so this is a smaller gap than it would be in the note editor). Auto-scrolls to the
// newest message, including live deltas as a streaming reply grows.
export function MessageList({
  messages,
  agentName,
  onRetry,
}: {
  messages: ChatMessage[];
  agentName: string;
  onRetry: (text: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
        Ask {agentName} anything about your notes and memories.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={
            "flex " + (m.role === "user" ? "justify-end" : "justify-start")
          }
        >
          <div className="max-w-[85%]">
            <div
              className={
                "whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed " +
                (m.role === "user"
                  ? "bg-accent text-white"
                  : m.error
                    ? "bg-danger/10 text-danger"
                    : "bg-surface-raised text-text")
              }
            >
              {m.text || (m.streaming ? "…" : "")}
            </div>
            {m.error && m.retryText && (
              <button
                type="button"
                onClick={() => onRetry(m.retryText!)}
                className="mt-1 text-xs font-medium text-accent hover:underline"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
