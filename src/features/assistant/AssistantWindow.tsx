import { useState } from "react";
import { useDismiss } from "../../hooks/useDismiss";
import { IconButton } from "../../components/IconButton";
import { X, ChevronDown, Expand } from "../../components/icons";
import type { Agent } from "../../lib/ai/agents";
import type { ChatMessage } from "./useAssistant";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

// The Patronus popover — grows out of the same bottom-left corner the orb sits in.
// A plain fixed panel for v1, not a full drag-to-dock/resize surface (that's a bigger
// lift than this phase needs — see this update's wiki.md); native `resize: both` gives
// the owner some control over size without custom drag logic. Escape closes it (matching
// every other floating panel in the app — SyncStatus/OverflowMenu both do); outside-click
// deliberately does NOT close it, since that would be disruptive mid-conversation.
export function AssistantWindow({
  agents,
  agentId,
  onAgentChange,
  messages,
  sending,
  onSend,
  onRetry,
  onOpenNote,
  onClose,
  onExpand,
}: {
  agents: Agent[];
  agentId: string;
  onAgentChange: (id: string) => void;
  messages: ChatMessage[];
  sending: boolean;
  onSend: (text: string) => void;
  onRetry: (text: string) => void;
  onOpenNote: (id: string) => void;
  onClose: () => void;
  onExpand: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useDismiss<HTMLDivElement>(() => setPickerOpen(false), {
    enabled: pickerOpen,
  });
  const rootRef = useDismiss<HTMLDivElement>(() => {}, { onEscape: onClose });
  const activeAgent = agents.find((a) => a.id === agentId) ?? agents[0];

  return (
    <div
      ref={rootRef}
      className="patronus-resizable fixed bottom-4 left-4 z-40 flex h-[520px] w-[360px] min-h-[320px] min-w-[300px] max-h-[80vh] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      style={{ resize: "both" }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-text hover:bg-surface-raised"
          >
            {activeAgent.name}
            <ChevronDown size={14} className="text-text-muted" />
          </button>
          {pickerOpen && (
            <div
              role="menu"
              className="absolute left-0 top-9 z-20 min-w-[200px] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
            >
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAgentChange(a.id);
                    setPickerOpen(false);
                  }}
                  className={
                    "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm " +
                    (a.id === agentId
                      ? "bg-surface text-text"
                      : "text-text-muted hover:bg-surface")
                  }
                >
                  <span className="font-medium text-text">{a.name}</span>
                  <span className="text-xs text-text-muted">{a.tagline}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Open full screen" onClick={onExpand}>
            <Expand size={16} />
          </IconButton>
          <IconButton label="Close Patronus" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <MessageList
        messages={messages}
        agentName={activeAgent.name}
        onRetry={onRetry}
        onOpenNote={onOpenNote}
      />
      <Composer onSend={onSend} disabled={sending} />
    </div>
  );
}
