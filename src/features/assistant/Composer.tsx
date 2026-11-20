import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AssistantTool } from "../../lib/ai/askAgent";
import { log } from "../../lib/logger";
import { isSlashNavKey, slashNav } from "../../components/editor/slashNav";
import {
  buildCommands,
  matchCommands,
  runCommand,
  type ComposerCommand,
} from "./composerCommands";
import { CommandMenu, COMMAND_MENU_ID, commandRowId } from "./CommandMenu";
import { WebIndicator } from "./WebIndicator";

// One full-width field (COMPACT-COMPOSER spec): Enter sends, Shift+Enter breaks the line,
// "/" at the start opens the command menu, and a globe sits inside the field while web
// search is on. The field stays editable mid-reply; only sending waits.

const MAX_HEIGHT_PX = 128;
const HINT_ID = "composer-hint";

export function Composer({
  onSend,
  sending,
  availableTools,
  webToolId,
  tools,
  onToolsChange,
}: {
  onSend: (text: string) => void;
  sending: boolean;
  availableTools: AssistantTool[];
  webToolId?: string;
  tools: string[];
  onToolsChange: (tools: string[]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // The text the owner pressed Escape on: the menu stays shut until the text changes.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const commands = buildCommands(availableTools, tools);
  const match = matchCommands(text, commands);
  const menuOpen = match.items.length > 0 && dismissedFor !== text;
  const active = Math.min(activeIndex, Math.max(0, match.items.length - 1));
  const webOn = !!webToolId && tools.includes(webToolId);

  // Focus on mount (the window just opened), so typing starts with no extra click.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Grow with the text up to ~6 lines, then scroll. Also resets the height on clear.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const changeText = (value: string) => {
    setText(value);
    setActiveIndex(0);
  };

  const submit = () => {
    if (!text.trim() || sending) return;
    onSend(text);
    changeText("");
  };

  const run = (command: ComposerCommand) => {
    const result = runCommand(command, tools, match.arg);
    log.info("assistant", "composer.command", {
      name: command.name,
      arg: match.arg,
      outcome: result.outcome,
    });
    onToolsChange(result.tools);
    setAnnouncement(result.announcement);
    changeText("");
    ref.current?.focus();
  };

  const turnWebOff = () => {
    onToolsChange(tools.filter((id) => id !== webToolId));
    setAnnouncement("Web search off");
    ref.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const nav = slashNav(active, e.key, e.shiftKey, match.items.length);
    if (nav.type === "none") return;
    e.preventDefault();
    // Escape must close only the menu, never the Patronus window listening above.
    e.stopPropagation();
    if (nav.type === "move") setActiveIndex(nav.index);
    else if (nav.type === "activate") run(match.items[nav.index]);
    else setDismissedFor(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter confirms an IME composition (accented / CJK input); it must not send.
    if (e.nativeEvent.isComposing) return;
    if (menuOpen && isSlashNavKey(e.key)) return onMenuKey(e);
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border p-3">
      <div className="relative">
        {menuOpen && (
          <CommandMenu
            items={match.items}
            arg={match.arg}
            activeIndex={active}
            onRun={run}
            onHover={setActiveIndex}
          />
        )}
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => changeText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={commands.length > 0 ? "Ask anything · / for commands" : "Ask anything…"}
          aria-label="Message"
          aria-describedby={HINT_ID}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={menuOpen}
          aria-controls={COMMAND_MENU_ID}
          aria-activedescendant={menuOpen ? commandRowId(match.items[active].name) : undefined}
          className={
            "block max-h-32 w-full resize-none overflow-y-auto rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" +
            (webOn ? " pr-9" : "")
          }
        />
        <WebIndicator on={webOn} onTurnOff={turnWebOff} />
      </div>
      <span id={HINT_ID} className="sr-only">
        Enter to send, Shift+Enter for a new line
      </span>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
