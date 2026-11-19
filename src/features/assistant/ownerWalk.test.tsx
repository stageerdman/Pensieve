import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

// PATRONUS-WEB-TOOLS "Test it like a real user", picker side (items a–e in the update
// folder's wiki.md "Test run"). Walks the real popover and full-screen surfaces over the
// real AssistantProvider/useAssistant. Only the Rust bridge is faked.

type WebCb = (call: { kind: "search" | "fetch"; detail: string }) => void;
const webListeners = new Map<string, WebCb>();
const askAgent = vi.fn();
const openUrl = vi.fn(async (_url: string) => {});

vi.mock("../../lib/ai/askAgent", async (orig) => ({
  ...(await orig<typeof import("../../lib/ai/askAgent")>()),
  askAgent: (...a: unknown[]) => askAgent(...a),
  listAssistantTools: async () => [
    { id: "web", label: "Web search", description: "Search the web." },
  ],
  onAskAgentProgress: async () => () => {},
  onAssistantNotesFound: async (_job: string, cb: (n: unknown[]) => void) => {
    notesCb = cb;
    return () => {};
  },
  onAssistantWebCall: async (jobId: string, cb: WebCb) => {
    webListeners.set(jobId, cb);
    return () => webListeners.delete(jobId);
  },
}));
let notesCb: ((n: unknown[]) => void) | undefined;
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
vi.mock("../../lib/sync/native", async (orig) => ({
  ...(await orig<typeof import("../../lib/sync/native")>()),
  openUrl: (url: string) => openUrl(url),
}));

import { AssistantProvider, useAssistantContext } from "./AssistantContext";
import { AssistantWindow } from "./AssistantWindow";
import { AssistantFullscreen } from "./AssistantFullscreen";

const toolsOfCall = (n: number) => askAgent.mock.calls[n][5];

function Popover({ onClose }: { onClose: () => void }) {
  const { agents, agentId, setAgentId } = useAssistantContext();
  return (
    <AssistantWindow
      agents={agents}
      agentId={agentId}
      onAgentChange={setAgentId}
      onOpenNote={() => {}}
      onClose={onClose}
      onExpand={() => {}}
    />
  );
}

async function mount(surface: "popover" | "fullscreen") {
  const onClose = vi.fn();
  const r = render(
    <AssistantProvider>
      {surface === "popover" ? (
        <Popover onClose={onClose} />
      ) : (
        <AssistantFullscreen onAddAgent={() => {}} onOpenNote={() => {}} />
      )}
    </AssistantProvider>,
  );
  await screen.findByLabelText("Tools");
  return { ...r, onClose };
}

const sendRow = () => screen.getByRole("button", { name: "Send" }).parentElement!;

async function type(text: string) {
  const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
  box.value = text;
  await act(async () => {
    fireEvent.keyDown(box, { key: "Enter" });
  });
}

// jsdom has no layout; MessageList scrolls to the newest message.
Element.prototype.scrollIntoView = () => {};

beforeEach(() => {
  askAgent.mockReset();
  askAgent.mockResolvedValue({ text: "ok", sessionId: "s1", web: [] });
  webListeners.clear();
  openUrl.mockClear();
});
afterEach(cleanup);

describe.each(["popover", "fullscreen"] as const)("owner walk: %s", (surface) => {
  it("(a) the picker sits in the Send row, directly before Send", async () => {
    await mount(surface);
    const row = sendRow();
    const kids = Array.from(row.children);
    const send = screen.getByRole("button", { name: "Send" });
    const picker = within(row).getByLabelText("Tools");
    expect(kids.indexOf(send)).toBe(kids.length - 1);
    expect(kids[kids.length - 2].contains(picker)).toBe(true);
    expect(picker.className).toContain("h-9");
    expect(send.className).toContain("h-9");
  });

  it("(b) globe → accent Web × pill; one click on × turns it off and keeps focus", async () => {
    const { onClose } = await mount(surface);
    fireEvent.click(screen.getByLabelText("Tools"));
    fireEvent.click(screen.getByRole("switch", { name: /Web search/ }));
    const pill = screen.getByLabelText("Tools: Web search on");
    expect(pill.textContent).toBe("Web");
    expect(pill.parentElement!.className).toContain("bg-accent/10");
    expect(pill.parentElement!.className).toContain("text-accent");

    // Escape closes the list only, never the Patronus window behind it.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    const x = screen.getByLabelText("Turn off Web search");
    x.focus();
    fireEvent.click(x);
    const globe = screen.getByLabelText("Tools");
    expect(screen.queryByText("Web")).toBeNull();
    expect(document.activeElement).toBe(globe);
    await type("after off");
    expect(toolsOfCall(0)).toEqual([]);
  });

  it("(c) live search line, then collapsed sources that open in the browser and differ from note chips", async () => {
    await mount(surface);
    fireEvent.click(screen.getByLabelText("Tools"));
    fireEvent.click(screen.getByRole("switch", { name: /Web search/ }));
    let resolve!: (v: unknown) => void;
    askAgent.mockImplementationOnce(
      (jobId: string) =>
        new Promise((r) => {
          resolve = r;
          notesCb?.([{ id: "n1", title: "My trip notes" }]);
          webListeners.get(jobId)?.({ kind: "search", detail: "paris weather" });
        }),
    );
    await type("weather in paris?");
    const live = await screen.findByRole("status");
    expect(live.textContent).toBe("Searching the web: paris weather");

    await act(async () => {
      resolve({
        text: "Sunny",
        sessionId: "s2",
        web: [
          {
            kind: "search",
            detail: "paris weather",
            sources: [
              { title: "Météo Paris", url: "https://www.meteo.fr/paris" },
              { title: "", url: "https://weather.com/x" },
            ],
          },
        ],
      });
    });
    expect(screen.queryByRole("status")).toBeNull();
    const line = screen.getByRole("button", { name: /Searched the web · 2 sources/ });
    expect(line.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(line);
    expect(screen.getByText("paris weather").parentElement!.textContent).toBe(
      "Searched paris weather",
    );

    const source = screen.getByTitle("Open https://www.meteo.fr/paris in the browser");
    const note = screen.getByTitle('Open "My trip notes"');
    expect(source.className).toContain("rounded-full");
    expect(source.className).not.toContain("border");
    expect(note.className).toContain("rounded-md");
    expect(note.className).toContain("border");
    expect(source.textContent).toContain("· meteo.fr");
    // A source without a title shows its site.
    expect(screen.getByTitle("Open https://weather.com/x in the browser").textContent).toBe(
      "weather.com",
    );
    fireEvent.click(source);
    expect(openUrl).toHaveBeenCalledWith("https://www.meteo.fr/paris");
  });

  it("(d) 'Search the web' on the latest web-off reply is one-off; the chat stays off", async () => {
    await mount(surface);
    await type("first");
    await type("second");
    const links = screen.getAllByRole("button", { name: "Search the web" });
    expect(links).toHaveLength(1); // latest reply only
    expect(links[0].className).toContain("opacity-0");
    expect(links[0].className).toContain("group-hover:opacity-100");
    expect(links[0].className).toContain("focus-visible:opacity-100");

    await act(async () => {
      fireEvent.click(links[0]);
    });
    expect(askAgent.mock.calls[2][1]).toBe("second");
    expect(toolsOfCall(2)).toEqual(["web"]);
    // The chat's own setting never moved.
    expect(screen.getByLabelText("Tools")).toBeTruthy();
    expect(screen.queryByText("Web")).toBeNull();
    // The new latest reply was sent with web, so the link isn't offered again.
    expect(screen.queryByRole("button", { name: "Search the web" })).toBeNull();
    await type("third");
    expect(toolsOfCall(3)).toEqual([]);
  });

  it("(e) switching agents shows that agent's own tool state, off by default", async () => {
    await mount(surface);
    fireEvent.click(screen.getByLabelText("Tools"));
    fireEvent.click(screen.getByRole("switch", { name: /Web search/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Web")).toBeTruthy();

    const pick = async (name: string) => {
      if (surface === "popover") {
        fireEvent.click(screen.getAllByRole("button", { name: /Patronus|Curator/ })[0]);
        fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(name) }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
      }
      await waitFor(() => screen.getByLabelText("Message"));
    };

    await pick("Curator");
    expect(screen.getByLabelText("Tools")).toBeTruthy();
    expect(screen.queryByText("Web")).toBeNull();
    await type("hi curator");
    expect(toolsOfCall(0)).toEqual([]);

    await pick("Patronus");
    expect(screen.getByText("Web")).toBeTruthy();
  });
});
