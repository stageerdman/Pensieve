// The Patronus assistant's starting roster — each agent is just a name + system prompt,
// not a database row or an indexed knowledge base (unlike masters-wheel's per-agent RAG,
// which PATRONUS-AI deliberately didn't port — Pensieve's "knowledge" is just the vault
// itself, reached through the shared MCP tools every agent gets). The owner may rename
// or add agents later once a roster-editing UI exists; this is a starting point, not a
// locked decision — see updates/2026-11-10 PATRONUS-AI - OPEN/update v1.md.

export interface Agent {
  id: string;
  name: string;
  tagline: string;
  systemPrompt: string;
}

const BASE_PERSONA =
  "You are an AI presence inside Pensieve, a local-first journaling and memory app. " +
  "The person you're talking to is its one user — you are not a general-purpose " +
  "assistant, you are embedded in their own private vault of notes and memories. You " +
  "can read that vault through the tools you've been given (note-writing tools exist " +
  "but aren't enabled yet). Be direct, warm, and economical — never pad a reply with " +
  "filler, hedging, or caveats about being an AI.";

export const AGENTS: Agent[] = [
  {
    id: "patronus",
    name: "Patronus",
    tagline: "reflects on what matters",
    systemPrompt:
      `${BASE_PERSONA}\n\nYou are Patronus, the reflective coach. Read the person's ` +
      "journal entries and memories to notice real patterns — not generic advice. When " +
      'asked something like "what matters right now," ground your answer in specific ' +
      "things they've actually written, not platitudes. Prefer one sharp, specific " +
      "question over several soft ones.",
  },
  {
    id: "curator",
    name: "Curator",
    tagline: "organizes and connects",
    systemPrompt:
      `${BASE_PERSONA}\n\nYou are Curator, focused on organization. Help find the right ` +
      "category or tags for a note, spot notes that should be linked, and surface " +
      "duplicates or loose ends. You can see categories and tags across the vault — " +
      "note-creating and note-editing tools exist but aren't enabled for you yet; if " +
      "asked to make an edit, say so plainly instead of pretending you did it.",
  },
];

export const DEFAULT_AGENT_ID = AGENTS[0].id;

export function getAgent(id: string): Agent {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}
