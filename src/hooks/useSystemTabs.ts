import { useCallback, useState } from "react";

// The two non-note "system" tabs (full-screen Patronus, the Agents editor) — kept open
// in the tab bar independently of which one is actually showing, same as note tabs stay
// in useTabs' tabIds after you've navigated away from them to Home.
export type SystemTabId = "assistant" | "agents";

interface AgentsIntent {
  startWithNewDraft: boolean;
  /** Bumped on every openAgents() call so AgentsEditor remounts with a fresh draft even
   *  when "Add new agent" is clicked while the Agents tab is already open/active. */
  token: number;
}

export function useSystemTabs() {
  const [openIds, setOpenIds] = useState<SystemTabId[]>([]);
  const [active, setActive] = useState<SystemTabId | null>(null);
  const [agentsIntent, setAgentsIntent] = useState<AgentsIntent>({
    startWithNewDraft: false,
    token: 0,
  });

  const openAssistant = useCallback(() => {
    setOpenIds((ids) =>
      ids.includes("assistant") ? ids : [...ids, "assistant"],
    );
    setActive("assistant");
  }, []);

  const openAgents = useCallback((startWithNewDraft = false) => {
    setOpenIds((ids) => (ids.includes("agents") ? ids : [...ids, "agents"]));
    setAgentsIntent((prev) => ({ startWithNewDraft, token: prev.token + 1 }));
    setActive("agents");
  }, []);

  const select = useCallback((id: SystemTabId) => setActive(id), []);
  const deactivate = useCallback(() => setActive(null), []);
  const closeTab = useCallback((id: SystemTabId) => {
    setOpenIds((ids) => ids.filter((x) => x !== id));
    setActive((cur) => (cur === id ? null : cur));
  }, []);

  return {
    openIds,
    active,
    openAssistant,
    openAgents,
    select,
    deactivate,
    closeTab,
    agentsIntent,
  };
}
