// One shared Patronus state for every surface that needs it — the bottom-left popover,
// the full-screen "assistant" tab, and the "agents" editor tab all read/write the same
// context instead of each holding their own disconnected copy, so switching between the
// popover and the full-screen tab never loses the running conversation.

import { createContext, useContext, type ReactNode } from "react";
import { useAssistant, type AssistantState } from "./useAssistant";

const AssistantCtx = createContext<AssistantState | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const state = useAssistant();
  return (
    <AssistantCtx.Provider value={state}>{children}</AssistantCtx.Provider>
  );
}

export function useAssistantContext(): AssistantState {
  const ctx = useContext(AssistantCtx);
  if (!ctx)
    throw new Error(
      "useAssistantContext must be used within an AssistantProvider",
    );
  return ctx;
}
