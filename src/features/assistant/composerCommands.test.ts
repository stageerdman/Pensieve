import { describe, expect, it } from "vitest";
import {
  buildCommands,
  commandTitle,
  matchCommands,
  runCommand,
} from "./composerCommands";

const registry = [
  { id: "web", label: "Web search", description: "Search the web." },
  { id: "wiki", label: "Wiki", description: "Read the wiki." },
];
const off = buildCommands(registry, []);
const names = (text: string, cmds = off) => matchCommands(text, cmds).items.map((c) => c.name);

describe("matchCommands", () => {
  it("lists every command for a bare slash, in registry order", () => {
    expect(names("/")).toEqual(["web", "wiki"]);
  });

  it("filters by name prefix, case-insensitively", () => {
    expect(names("/we")).toEqual(["web"]);
    expect(names("/W")).toEqual(["web", "wiki"]);
    expect(names("/WEB")).toEqual(["web"]);
  });

  it("reads a trailing on/off as a forced action", () => {
    expect(matchCommands("/web on", off).arg).toBe("on");
    expect(matchCommands("/web OFF ", off).arg).toBe("off");
    expect(matchCommands("/web", off).arg).toBeUndefined();
  });

  it("stays open while an arg is half typed, so the menu never flickers", () => {
    expect(names("/web o")).toEqual(["web"]);
    expect(matchCommands("/web o", off).arg).toBeUndefined(); // still ambiguous: toggle
    expect(matchCommands("/web of", off).arg).toBe("off");
  });

  it("stays closed for anything that is not a command, so it sends as a message", () => {
    expect(names("/web foo")).toEqual([]);
    expect(names("/web onn")).toEqual([]);
    expect(names("/x")).toEqual([]);
    expect(names("hi /web")).toEqual([]);
    expect(names("/web\nmore")).toEqual([]);
    expect(names("/etc/hosts is missing")).toEqual([]);
    expect(names("/", [])).toEqual([]);
  });
});

describe("commandTitle and runCommand", () => {
  const [webOff] = off;
  const [webOn] = buildCommands(registry, ["web"]);

  it("titles the row with what Enter will do", () => {
    expect(commandTitle(webOff)).toBe("Turn on web search");
    expect(commandTitle(webOn)).toBe("Turn off web search");
    expect(commandTitle(webOn, "on")).toBe("Turn on web search");
  });

  it("toggles without an arg", () => {
    expect(runCommand(webOff, [])).toEqual({
      tools: ["web"],
      announcement: "Web search on for this chat",
      outcome: "on",
    });
    expect(runCommand(webOn, ["web"])).toEqual({
      tools: [],
      announcement: "Web search off",
      outcome: "off",
    });
  });

  it("leaves tools alone when forced into the state it is already in", () => {
    expect(runCommand(webOn, ["web"], "on")).toEqual({
      tools: ["web"],
      announcement: "Web search is already on",
      outcome: "already-on",
    });
  });
});
