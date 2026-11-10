import { isTauri } from "../../lib/store";
import { PatronusTrigger } from "./PatronusTrigger";
import { AssistantWindow } from "./AssistantWindow";
import { useAssistantContext } from "./AssistantContext";

// Mounted once in App.tsx as a sibling overlay, same as StatusWhisper/MediaBackupWhisper/
// ImageLightbox. Desktop-only per CLAUDE.md's AI rule — isTauri() gates it exactly like
// lib/raw/describePageTauri.ts's AI call does, no browser/phone fallback. Hidden while a
// full-screen "assistant"/"agents" tab is active (App.tsx) so the popover and the
// full-screen view never compete for the same corner at once.
export function Assistant({
  hidden,
  onExpand,
}: {
  hidden: boolean;
  onExpand: () => void;
}) {
  const {
    open,
    openAssistant,
    close,
    agents,
    agentId,
    setAgentId,
    messages,
    sending,
    send,
  } = useAssistantContext();

  if (!isTauri() || hidden) return null;

  if (!open) return <PatronusTrigger onOpen={openAssistant} />;

  return (
    <AssistantWindow
      agents={agents}
      agentId={agentId}
      onAgentChange={setAgentId}
      messages={messages}
      sending={sending}
      onSend={send}
      onRetry={send}
      onClose={close}
      onExpand={() => {
        close();
        onExpand();
      }}
    />
  );
}
