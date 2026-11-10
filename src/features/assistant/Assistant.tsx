import { isTauri } from "../../lib/store";
import { PatronusTrigger } from "./PatronusTrigger";
import { AssistantWindow } from "./AssistantWindow";
import { useAssistant } from "./useAssistant";

// Mounted once in App.tsx as a sibling overlay, same as StatusWhisper/MediaBackupWhisper/
// ImageLightbox. Desktop-only per CLAUDE.md's AI rule — isTauri() gates it exactly like
// lib/raw/describePageTauri.ts's AI call does, no browser/phone fallback.
export function Assistant() {
  const { open, openAssistant, close, agents, agentId, setAgentId, messages, sending, send } = useAssistant();

  if (!isTauri()) return null;

  return open ? (
    <AssistantWindow
      agents={agents}
      agentId={agentId}
      onAgentChange={setAgentId}
      messages={messages}
      sending={sending}
      onSend={send}
      onClose={close}
    />
  ) : (
    <PatronusTrigger onOpen={openAssistant} />
  );
}
