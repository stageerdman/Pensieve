import { useEffect, useRef } from "react";
import { Bookmark } from "../../components/icons";
import type { ChatMessage } from "./useAssistant";

// Plain text bubbles for v1 — no Markdown rendering yet (a reply is read, not edited,
// so this is a smaller gap than it would be in the note editor). Auto-scrolls to the
// newest message, including live deltas as a streaming reply grows. A reply that found
// real notes (via search_notes/get_note/list_recent) shows them as clickable chips —
// onOpenNote opens one as a real tab, the same openNote() every other note-click in
// the app already uses (see App.tsx).
export function MessageList({
  messages,
  agentName,
  onRetry,
  onOpenNote,
}: {
  messages: ChatMessage[];
  agentName: string;
  onRetry: (text: string) => void;
  onOpenNote: (id: string) => void;
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

            {m.foundNotes && m.foundNotes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.foundNotes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onOpenNote(n.id)}
                    title={`Open "${n.title}"`}
                    className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text transition-colors hover:border-accent hover:text-accent"
                  >
                    <Bookmark size={11} />
                    <span className="max-w-[160px] truncate">{n.title}</span>
                  </button>
                ))}
              </div>
            )}

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
