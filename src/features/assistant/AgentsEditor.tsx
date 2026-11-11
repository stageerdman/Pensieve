import { useEffect, useState } from "react";
import { Plus, Trash } from "../../components/icons";
import { useAssistantContext } from "./AssistantContext";
import { newDraftAgent } from "../../lib/ai/agentStore";
import type { Agent, KnowledgeFile } from "../../lib/ai/agents";
import { removeAgentKnowledge, removeKnowledgeFile } from "../../lib/ai/knowledgeFiles";
import { KnowledgeManager } from "./KnowledgeManager";

// The Agents editor — masters-wheel's Agents.tsx shape (a nav list of agents + a form
// for whichever is selected), adapted to Pensieve's filesystem-only backend:
// name/tagline/system-prompt persisted as one shared agents.json via
// AssistantContext.setRoster → lib/ai/agentStore.ts. Knowledge files (AGENT-RAG) persist
// immediately on add/remove instead of waiting on the explicit Save button below — see
// this update's wiki.md for why.
export function AgentsEditor({
  startWithNewDraft = false,
}: {
  startWithNewDraft?: boolean;
}) {
  const { agents, setRoster } = useAssistantContext();
  const [draftAgent, setDraftAgent] = useState<Agent | null>(
    startWithNewDraft ? newDraftAgent() : null,
  );
  const [selectedId, setSelectedId] = useState<string>(() =>
    startWithNewDraft ? "" : (agents[0]?.id ?? ""),
  );

  // If a new draft was requested, select it once it's created.
  useEffect(() => {
    if (draftAgent && selectedId === "") setSelectedId(draftAgent.id);
  }, [draftAgent, selectedId]);
  useEffect(() => {
    if (!startWithNewDraft && selectedId === "" && agents.length > 0)
      setSelectedId(agents[0].id);
  }, [startWithNewDraft, selectedId, agents]);

  const displayList = draftAgent ? [...agents, draftAgent] : agents;
  const selected = displayList.find((a) => a.id === selectedId) ?? null;
  const isNew = draftAgent !== null && selectedId === draftAgent.id;

  const addNewAgent = () => {
    const d = newDraftAgent();
    setDraftAgent(d);
    setSelectedId(d.id);
  };

  const save = async (agent: Agent) => {
    const next = agents.some((a) => a.id === agent.id)
      ? agents.map((a) => (a.id === agent.id ? agent : a))
      : [...agents, agent];
    await setRoster(next);
    if (draftAgent?.id === agent.id) setDraftAgent(null);
    setSelectedId(agent.id);
  };

  const remove = async (id: string) => {
    const next = agents.filter((a) => a.id !== id);
    await setRoster(next);
    setSelectedId(next[0]?.id ?? "");
    void removeAgentKnowledge(id);
  };

  const cancelDraft = () => {
    setDraftAgent(null);
    setSelectedId(agents[0]?.id ?? "");
  };

  // Knowledge files (AGENT-RAG) persist immediately, unlike name/tagline/instructions
  // below which wait on the explicit Save button — ingesting a file is a real,
  // expensive embed pass that's already happened on disk by the time this fires, so
  // losing track of it by requiring a separate Save click would be a silent data loss.
  // For an already-saved agent this writes straight into the roster; for a still-unsaved
  // draft it only updates the draft in place (Save still finalizes everything else).
  const onKnowledgeFilesChange = async (forAgentId: string, knowledgeFiles: KnowledgeFile[]) => {
    if (draftAgent?.id === forAgentId) {
      setDraftAgent({ ...draftAgent, knowledgeFiles });
      return;
    }
    const existing = agents.find((a) => a.id === forAgentId);
    if (!existing) return;
    await setRoster(agents.map((a) => (a.id === forAgentId ? { ...a, knowledgeFiles } : a)));
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-sunken">
        <div className="flex-1 overflow-y-auto p-2">
          {displayList.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId(a.id)}
              className={
                "flex w-full flex-col items-start rounded-md px-2.5 py-2 text-left " +
                (a.id === selectedId
                  ? "bg-surface-raised text-text"
                  : "text-text-muted hover:bg-surface-raised/60 hover:text-text")
              }
            >
              <span className="text-sm font-medium">
                {a.name || "Untitled agent"}
                {draftAgent?.id === a.id && (
                  <span className="ml-1 text-xs text-accent">•</span>
                )}
              </span>
              <span className="truncate text-xs text-text-muted">
                {a.tagline}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={addNewAgent}
          className="flex items-center gap-1.5 border-t border-border px-2.5 py-2.5 text-sm text-text-muted hover:bg-surface-raised hover:text-text"
        >
          <Plus size={14} />
          Add new agent
        </button>
      </div>

      {selected ? (
        <AgentEditorForm
          key={selected.id}
          agent={selected}
          isNew={isNew}
          onSave={save}
          onDelete={isNew ? undefined : () => remove(selected.id)}
          onCancelNew={isNew ? cancelDraft : undefined}
          onKnowledgeFilesChange={onKnowledgeFilesChange}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          No agent selected.
        </div>
      )}
    </div>
  );
}

function AgentEditorForm({
  agent,
  isNew,
  onSave,
  onDelete,
  onCancelNew,
  onKnowledgeFilesChange,
}: {
  agent: Agent;
  isNew: boolean;
  onSave: (agent: Agent) => void;
  onDelete?: () => void;
  onCancelNew?: () => void;
  onKnowledgeFilesChange: (agentId: string, knowledgeFiles: KnowledgeFile[]) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [tagline, setTagline] = useState(agent.tagline);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const dirty =
    name !== agent.name ||
    tagline !== agent.tagline ||
    systemPrompt !== agent.systemPrompt;

  const inputClass =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">
            {isNew ? "New agent" : "Edit agent"}
          </h2>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-danger hover:underline"
            >
              <Trash size={13} />
              Delete
            </button>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Tagline</span>
          <input
            className={inputClass}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="A short description shown in the picker"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">
            Instructions
          </span>
          <textarea
            className={inputClass + " min-h-[220px] flex-1 resize-none"}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="What this agent is for, and how it should behave."
          />
        </label>

        <KnowledgeManager
          agentId={agent.id}
          files={agent.knowledgeFiles}
          onAddFile={(file) =>
            onKnowledgeFilesChange(agent.id, [...agent.knowledgeFiles, file])
          }
          onRemoveFile={(id) => {
            const file = agent.knowledgeFiles.find((f) => f.id === id);
            onKnowledgeFilesChange(
              agent.id,
              agent.knowledgeFiles.filter((f) => f.id !== id),
            );
            if (file) void removeKnowledgeFile(agent.id, file);
          }}
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          {isNew && onCancelNew && (
            <button
              type="button"
              onClick={onCancelNew}
              className="rounded-md px-3 py-2 text-sm text-text-muted hover:bg-surface-raised"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!dirty && !isNew}
            onClick={() =>
              onSave({
                ...agent,
                name: name.trim() || "Untitled agent",
                tagline,
                systemPrompt,
              })
            }
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
