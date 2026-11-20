import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Composer } from "./Composer";

const WEB = { id: "web", label: "Web search", description: "Search the web." };

// jsdom has no layout; the menu scrolls its active row into view.
Element.prototype.scrollIntoView = () => {};

function Harness({
  onSend,
  sending = false,
  initialTools = [],
  available = [WEB],
}: {
  onSend: (t: string) => void;
  sending?: boolean;
  initialTools?: string[];
  available?: (typeof WEB)[];
}) {
  const [tools, setTools] = useState(initialTools);
  return (
    <div onKeyDown={(e) => e.key === "Escape" && windowEscape()}>
      <Composer
        onSend={onSend}
        sending={sending}
        availableTools={available}
        webToolId={available.length ? "web" : undefined}
        tools={tools}
        onToolsChange={(t) => {
          toolsSeen(t);
          setTools(t);
        }}
      />
    </div>
  );
}
const toolsSeen = vi.fn();
const windowEscape = vi.fn();

function mount(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onSend = vi.fn();
  const r = render(<Harness onSend={onSend} {...props} />);
  const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
  const type = (value: string) => fireEvent.change(box, { target: { value } });
  const key = (k: string, init: object = {}) => fireEvent.keyDown(box, { key: k, ...init });
  return { ...r, onSend, box, type, key };
}

afterEach(() => {
  cleanup();
  toolsSeen.mockClear();
  windowEscape.mockClear();
});

describe("Composer: sending", () => {
  it("has no Send button; Enter sends and clears the field", () => {
    const { onSend, box, type, key } = mount();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    type("hello");
    key("Enter");
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(box.value).toBe("");
  });

  it("does not send on Shift+Enter, during IME composition, or for whitespace", () => {
    const { onSend, type, key } = mount();
    type("hello");
    key("Enter", { shiftKey: true });
    key("Enter", { isComposing: true });
    type("   ");
    key("Enter");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps the text while a reply streams, then sends once it is done", () => {
    const onSend = vi.fn();
    const { rerender } = render(<Harness onSend={onSend} sending />);
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: "next" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe("next");
    rerender(<Harness onSend={onSend} />);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("next");
  });

  it("only hints at / when there are commands", () => {
    mount();
    expect(screen.getByPlaceholderText("Ask anything · / for commands")).toBeTruthy();
    cleanup();
    mount({ available: [] });
    expect(screen.getByPlaceholderText("Ask anything…")).toBeTruthy();
  });
});

describe("Composer: slash commands", () => {
  it("/ opens the menu; Enter runs the command, clears the field and announces it", () => {
    const { onSend, box, type, key } = mount();
    type("/w");
    expect(box.getAttribute("aria-expanded")).toBe("true");
    const row = screen.getByRole("option", { name: /Turn on web search/ });
    expect(box.getAttribute("aria-activedescendant")).toBe(row.id);
    key("Enter");
    expect(toolsSeen).toHaveBeenLastCalledWith(["web"]);
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("Web search on for this chat")).toBeTruthy();
  });

  it("/web off turns web off and /web toggles it off when on", () => {
    const { type, key } = mount({ initialTools: ["web"] });
    type("/web");
    expect(screen.getByRole("option", { name: /Turn off web search/ })).toBeTruthy();
    type("/web on");
    key("Enter");
    expect(toolsSeen).toHaveBeenLastCalledWith(["web"]);
    expect(screen.getByText("Web search is already on")).toBeTruthy();
    type("/web off");
    key("Enter");
    expect(toolsSeen).toHaveBeenLastCalledWith([]);
  });

  it("Escape closes only the menu; then Enter sends the text as a message", () => {
    const { onSend, type, key } = mount();
    type("/web");
    key("Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(windowEscape).not.toHaveBeenCalled();
    key("Enter");
    expect(onSend).toHaveBeenCalledWith("/web");
    expect(toolsSeen).not.toHaveBeenCalled();
  });

  it("reopens after Escape once the text changes, even back to the same text", () => {
    const { type, key } = mount();
    type("/");
    key("Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    type("");
    type("/");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("ignores the Enter that confirms an IME composition in WebKit (keyCode 229)", () => {
    const { onSend, type, key } = mount();
    type("café");
    key("Enter", { keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("arrow keys wrap through the rows", () => {
    const wiki = { id: "wiki", label: "Wiki", description: "Read the wiki." };
    const { box, type, key } = mount({ available: [WEB, wiki] });
    type("/");
    const active = () => box.getAttribute("aria-activedescendant");
    expect(active()).toBe("composer-command-web");
    key("ArrowDown");
    expect(active()).toBe("composer-command-wiki");
    key("ArrowDown");
    expect(active()).toBe("composer-command-web");
    key("ArrowUp");
    expect(active()).toBe("composer-command-wiki");
  });

  it("a click on a row runs it", () => {
    const { type } = mount();
    type("/");
    fireEvent.pointerDown(screen.getByRole("option", { name: /Turn on web search/ }));
    expect(toolsSeen).toHaveBeenLastCalledWith(["web"]);
  });

  it("sends a slash text that matches no command", () => {
    const { onSend, type, key } = mount();
    type("/shrug");
    expect(screen.queryByRole("listbox")).toBeNull();
    key("Enter");
    expect(onSend).toHaveBeenCalledWith("/shrug");
  });
});

describe("Composer: web indicator", () => {
  const globe = () => screen.queryByRole("button", { name: "Web search is on. Turn off" });

  it("shows no globe while web is off", () => {
    mount();
    expect(globe()).toBeNull();
  });

  it("clicking the globe turns web off and puts focus back in the field", () => {
    const { box } = mount({ initialTools: ["web"] });
    expect(box.className).toContain("pr-9");
    fireEvent.click(globe()!);
    expect(toolsSeen).toHaveBeenLastCalledWith([]);
    expect(globe()).toBeNull();
    expect(document.activeElement).toBe(box);
  });
});
