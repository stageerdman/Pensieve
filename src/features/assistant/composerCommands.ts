import type { AssistantTool } from "../../lib/ai/askAgent";

// The composer's slash commands (COMPACT-COMPOSER spec §4). Pure: no React, no I/O.
// One command per registry tool, so a new Rust tool becomes a new command with no UI code.

export type CommandArg = "on" | "off";

export interface ComposerCommand {
  /** What you type after "/" — the tool id. */
  name: string;
  /** The tool's label, e.g. "Web search". */
  label: string;
  description: string;
  isOn: boolean;
}

export interface CommandMatch {
  /** Matching commands, registry order. Empty means the menu is closed. */
  items: ComposerCommand[];
  /** A forced action ("/web on"); absent means toggle. */
  arg?: CommandArg;
}

export interface CommandResult {
  tools: string[];
  announcement: string;
  outcome: "on" | "off" | "already-on" | "already-off";
}

const CLOSED: CommandMatch = { items: [] };

export function buildCommands(available: AssistantTool[], enabled: string[]): ComposerCommand[] {
  return available.map((t) => ({
    name: t.id,
    label: t.label,
    description: t.description,
    isOn: enabled.includes(t.id),
  }));
}

const ARGS: CommandArg[] = ["on", "off"];

/** Rules: the whole field starts with "/", one line, "/<name-prefix>[ on|off]".
 *  A partial arg ("o", "of") keeps the menu open, so typing "/web off" never flickers;
 *  "o" is still ambiguous, so it toggles. Anything else is closed, so
 *  "/etc/hosts is missing" just sends as a message. */
export function matchCommands(text: string, commands: ComposerCommand[]): CommandMatch {
  if (!text.startsWith("/") || text.includes("\n")) return CLOSED;
  const body = text.slice(1);
  const space = body.indexOf(" ");
  const query = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const rest = space === -1 ? "" : body.slice(space + 1).trim().toLowerCase();
  const args = ARGS.filter((a) => a.startsWith(rest));
  if (args.length === 0) return CLOSED;
  const items = commands.filter((c) => c.name.toLowerCase().startsWith(query));
  if (items.length === 0) return CLOSED;
  return args.length === 1 ? { items, arg: args[0] } : { items };
}

/** The state Enter will put the tool in. */
export function targetState(command: ComposerCommand, arg?: CommandArg): CommandArg {
  return arg ?? (command.isOn ? "off" : "on");
}

/** What the row says Enter will do: "Turn on web search". */
export function commandTitle(command: ComposerCommand, arg?: CommandArg): string {
  return `Turn ${targetState(command, arg)} ${command.label.toLowerCase()}`;
}

export function runCommand(
  command: ComposerCommand,
  enabled: string[],
  arg?: CommandArg,
): CommandResult {
  const target = targetState(command, arg);
  const wantOn = target === "on";
  if (wantOn === command.isOn) {
    return {
      tools: enabled,
      announcement: `${command.label} is already ${target}`,
      outcome: wantOn ? "already-on" : "already-off",
    };
  }
  return wantOn
    ? { tools: [...enabled, command.name], announcement: `${command.label} on for this chat`, outcome: "on" }
    : {
        tools: enabled.filter((id) => id !== command.name),
        announcement: `${command.label} off`,
        outcome: "off",
      };
}
