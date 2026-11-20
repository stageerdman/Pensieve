import { useEffect, useRef } from "react";
import { Globe } from "../../components/icons";
import "../../components/editor/slashmenu.css";
import { commandTitle, type CommandArg, type ComposerCommand } from "./composerCommands";

// The composer's "/" menu (spec §5): a listbox above the field, at its full width. Purely
// presentational — the textarea owns the keys and the highlight (Composer.tsx), so focus
// never leaves the field.

export const COMMAND_MENU_ID = "composer-commands";
export const commandRowId = (name: string) => `composer-command-${name}`;

export function CommandMenu({
  items,
  arg,
  activeIndex,
  onRun,
  onHover,
}: {
  items: ComposerCommand[];
  arg?: CommandArg;
  activeIndex: number;
  onRun: (command: ComposerCommand) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      ref={listRef}
      id={COMMAND_MENU_ID}
      role="listbox"
      aria-label="Commands"
      className="pensieve-slashmenu is-fluid absolute bottom-full left-0 right-0 z-20 mb-1"
    >
      {items.map((command, i) => (
        <div
          key={command.name}
          id={commandRowId(command.name)}
          data-i={i}
          role="option"
          aria-selected={i === activeIndex}
          className={"pensieve-slashmenu-item" + (i === activeIndex ? " is-active" : "")}
          // pointerdown + preventDefault so the textarea keeps focus and caret.
          onPointerDown={(e) => {
            e.preventDefault();
            onRun(command);
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="pensieve-slashmenu-icon">
            <Globe size={16} />
          </span>
          <span className="pensieve-slashmenu-text min-w-0">
            <span className="pensieve-slashmenu-title">{commandTitle(command, arg)}</span>
            <span className="pensieve-slashmenu-sub truncate">{command.description}</span>
          </span>
          <span className="ml-auto shrink-0 font-mono text-2xs text-text-muted">
            /{command.name}
          </span>
        </div>
      ))}
    </div>
  );
}
