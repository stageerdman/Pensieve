import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { WebActivity, siteOf, uniqueSources } from "./WebActivity";
import { ReplyActions } from "./ReplyActions";
import type { WebCall } from "../../lib/ai/askAgent";

const openUrl = vi.fn(async (_url: string) => {});
vi.mock("../../lib/sync/native", () => ({
  openUrl: (url: string) => openUrl(url),
}));

afterEach(cleanup);

const calls: WebCall[] = [
  {
    kind: "search",
    detail: "paris weather",
    sources: [
      { title: "Paris forecast", url: "https://www.meteo.fr/paris" },
      { title: null, url: "https://bbc.com/weather" },
    ],
  },
  {
    kind: "fetch",
    detail: "https://www.meteo.fr/paris",
    sources: [{ title: "Paris forecast", url: "https://www.meteo.fr/paris" }],
  },
];

describe("WebActivity", () => {
  it("while streaming, shows the real query being searched", () => {
    const r = render(<WebActivity calls={calls.slice(0, 1)} streaming />);
    expect(r.getByRole("status").textContent).toBe(
      "Searching the web: paris weather",
    );
  });

  it("after, one collapsed line with the unique source count", () => {
    const r = render(<WebActivity calls={calls} streaming={false} />);
    const toggle = r.getByRole("button", { name: /Searched the web · 2 sources/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(r.queryByText("Paris forecast")).toBeNull();
  });

  it("opened, it lists what was sent and opens a source in the browser", () => {
    const r = render(<WebActivity calls={calls} streaming={false} />);
    fireEvent.click(r.getByRole("button", { name: /Searched the web/ }));
    expect(r.getByText("paris weather")).toBeTruthy();
    fireEvent.click(r.getByText("Paris forecast"));
    expect(openUrl).toHaveBeenCalledWith("https://www.meteo.fr/paris");
    // A source with no title falls back to its site.
    expect(r.getByText("bbc.com")).toBeTruthy();
  });

  it("renders nothing without calls", () => {
    const { container } = render(<WebActivity calls={[]} streaming={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("helpers: site names and dedupe", () => {
    expect(siteOf("https://www.example.com/a")).toBe("example.com");
    expect(siteOf("not a url")).toBe("not a url");
    expect(uniqueSources(calls).map((s) => s.url)).toEqual([
      "https://www.meteo.fr/paris",
      "https://bbc.com/weather",
    ]);
  });
});

describe("ReplyActions", () => {
  const reply = {
    id: "r",
    role: "assistant" as const,
    text: "I can't look that up.",
    prompt: "weather?",
    tools: [] as string[],
  };

  it("latest reply sent without web offers a one-off web search", () => {
    const onRetry = vi.fn();
    const r = render(
      <ReplyActions message={reply} isLatest webToolId="web" onRetry={onRetry} />,
    );
    fireEvent.click(r.getByText("Search the web"));
    expect(onRetry).toHaveBeenCalledWith("weather?", { tools: ["web"] });
  });

  it("not offered on older replies, web replies, or without the tool", () => {
    const none = (el: ReturnType<typeof render>) =>
      expect(el.queryByText("Search the web")).toBeNull();
    none(render(<ReplyActions message={reply} isLatest={false} webToolId="web" onRetry={vi.fn()} />));
    cleanup();
    none(render(<ReplyActions message={{ ...reply, tools: ["web"] }} isLatest webToolId="web" onRetry={vi.fn()} />));
    cleanup();
    none(render(<ReplyActions message={reply} isLatest onRetry={vi.fn()} />));
  });

  it("a failed reply offers Retry and Retry with web search", () => {
    const onRetry = vi.fn();
    const r = render(
      <ReplyActions message={{ ...reply, error: true }} isLatest webToolId="web" onRetry={onRetry} />,
    );
    fireEvent.click(r.getByText("Retry"));
    expect(onRetry).toHaveBeenLastCalledWith("weather?");
    fireEvent.click(r.getByText("Retry with web search"));
    expect(onRetry).toHaveBeenLastCalledWith("weather?", { tools: ["web"] });
  });
});
