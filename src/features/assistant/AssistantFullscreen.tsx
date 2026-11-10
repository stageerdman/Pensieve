import { Plus } from "../../components/icons";
import { useAssistantContext } from "./AssistantContext";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

// The full-screen Patronus surface — opened as its own tab (App.tsx/TabBar), not a new
// window: a persistent agent sidebar (masters-wheel's ChatPage/Sidebar, minus the
// saved-chat-session list — this v1 keeps one running conversation per agent, not many
// named chats) + the same MessageList/Composer the popover uses, reading the same
// shared AssistantContext so the conversation carries over exactly as it was.
export function AssistantFullscreen({
  onAddAgent,
}: {
  onAddAgent: () => void;
}) {
  const { agents, agentId, setAgentId, messages, sending, send } =
    useAssistantContext();
  const activeAgent = agents.find((a) => a.id === agentId) ?? agents[0];

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-sunken">
        <div className="flex-1 overflow-y-auto p-2">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAgentId(a.id)}
              className={
                "flex w-full flex-col items-start rounded-md px-2.5 py-2 text-left " +
                (a.id === agentId
                  ? "bg-surface-raised text-text"
                  : "text-text-muted hover:bg-surface-raised/60 hover:text-text")
              }
            >
              <span className="text-sm font-medium">{a.name}</span>
              <span className="text-xs text-text-muted">{a.tagline}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAddAgent}
          className="flex items-center gap-1.5 border-t border-border px-2.5 py-2.5 text-sm text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <Plus size={14} />
          Add new agent
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MessageList
          messages={messages}
          agentName={activeAgent?.name ?? "Patronus"}
          onRetry={send}
        />
        <Composer onSend={send} disabled={sending} />
      </div>
    </div>
  );
}
