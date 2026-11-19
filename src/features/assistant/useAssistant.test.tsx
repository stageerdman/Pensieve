import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Locks in PATRONUS-WEB-TOOLS Phase 3: which tools each message is granted.
// The Rust bridge is mocked; web-call events are captured so a test can fire them.

type WebCb = (call: { kind: "search" | "fetch"; detail: string }) => void;
const webListeners = new Map<string, WebCb>();

const askAgent = vi.fn();
vi.mock("../../lib/ai/askAgent", async (orig) => ({
  ...(await orig<typeof import("../../lib/ai/askAgent")>()),
  askAgent: (...a: unknown[]) => askAgent(...a),
  listAssistantTools: async () => [
    { id: "web", label: "Web search", description: "Search the web." },
  ],
  onAskAgentProgress: async () => () => {},
  onAssistantNotesFound: async () => () => {},
  onAssistantWebCall: async (jobId: string, cb: WebCb) => {
    webListeners.set(jobId, cb);
    return () => webListeners.delete(jobId);
  },
}));
vi.mock("../../lib/ai/agentStore", () => ({
  listAgents: async () => [
    { id: "patronus", name: "Patronus", tagline: "", systemPrompt: "p" },
    { id: "curator", name: "Curator", tagline: "", systemPrompt: "c" },
  ],
  saveAgents: async () => {},
}));
vi.mock("../../lib/store", async (orig) => ({
  ...(await orig<typeof import("../../lib/store")>()),
  isTauri: () => true,
}));

import { useAssistant } from "./useAssistant";

const toolsOfCall = (n: number) => askAgent.mock.calls[n][5];

beforeEach(() => {
  askAgent.mockReset();
  askAgent.mockResolvedValue({ text: "ok", sessionId: "s1", web: [] });
  webListeners.clear();
});
afterEach(() => vi.clearAllMocks());

async function mount() {
  const hook = renderHook(() => useAssistant());
  await waitFor(() => expect(hook.result.current.availableTools).toHaveLength(1));
  await waitFor(() => expect(hook.result.current.agents).toHaveLength(2));
  return hook;
}

describe("useAssistant tools", () => {
  it("a new chat starts with no tools and sends []", async () => {
    const { result } = await mount();
    expect(result.current.tools).toEqual([]);
    await act(() => result.current.send("hello"));
    expect(toolsOfCall(0)).toEqual([]);
  });

  it("web sticks for the chat once on, and is stamped on the message", async () => {
    const { result } = await mount();
    act(() => result.current.setTools(["web"]));
    await act(() => result.current.send("first"));
    await act(() => result.current.send("second"));
    expect(toolsOfCall(0)).toEqual(["web"]);
    expect(toolsOfCall(1)).toEqual(["web"]);
    expect(result.current.messages[0].tools).toEqual(["web"]);

    act(() => result.current.setTools([]));
    await act(() => result.current.send("third"));
    expect(toolsOfCall(2)).toEqual([]);
  });

  it("tools are scoped per agent", async () => {
    const { result } = await mount();
    act(() => result.current.setTools(["web"]));
    act(() => result.current.setAgentId("curator"));
    expect(result.current.tools).toEqual([]);
    await act(() => result.current.send("hi curator"));
    expect(toolsOfCall(0)).toEqual([]);
    act(() => result.current.setAgentId("patronus"));
    expect(result.current.tools).toEqual(["web"]);
  });

  it("a one-off web send grants web to that message only", async () => {
    const { result } = await mount();
    await act(() => result.current.send("again", { tools: ["web"] }));
    expect(toolsOfCall(0)).toEqual(["web"]);
    expect(result.current.tools).toEqual([]);
  });

  it("live web calls land on the right reply, then the final list replaces them", async () => {
    const { result } = await mount();
    let resolve!: (v: unknown) => void;
    askAgent.mockImplementationOnce(
      (jobId: string) =>
        new Promise((r) => {
          resolve = r;
          webListeners.get(jobId)?.({ kind: "search", detail: "paris weather" });
        }),
    );
    act(() => result.current.setTools(["web"]));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.send("weather?");
    });
    await waitFor(() =>
      expect(result.current.messages[1].web).toEqual([
        { kind: "search", detail: "paris weather", sources: [] },
      ]),
    );
    const final = [
      {
        kind: "search",
        detail: "paris weather",
        sources: [{ title: "Météo", url: "https://meteo.fr/paris" }],
      },
    ];
    await act(async () => {
      resolve({ text: "Sunny", sessionId: "s2", web: final });
      await pending;
    });
    expect(result.current.messages[1].web).toEqual(final);
    expect(result.current.messages[1].prompt).toBe("weather?");
  });
});
