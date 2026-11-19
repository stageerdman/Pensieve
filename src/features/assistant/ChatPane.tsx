import { useAssistantContext } from "./AssistantContext";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

// The conversation itself — messages + composer (with its tool picker) — shared by the
// popover (AssistantWindow) and the full-screen tab (AssistantFullscreen), so both read
// the same chat state and can never wire it differently.
export function ChatPane({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const {
    agents,
    agentId,
    messages,
    sending,
    send,
    availableTools,
    webToolId,
    tools,
    setTools,
  } = useAssistantContext();
  const activeAgent = agents.find((a) => a.id === agentId) ?? agents[0];

  return (
    <>
      <MessageList
        messages={messages}
        agentName={activeAgent?.name ?? "Patronus"}
        onRetry={send}
        onOpenNote={onOpenNote}
        webToolId={webToolId}
      />
      <Composer
        onSend={send}
        disabled={sending}
        availableTools={availableTools}
        tools={tools}
        onToolsChange={setTools}
      />
    </>
  );
}
