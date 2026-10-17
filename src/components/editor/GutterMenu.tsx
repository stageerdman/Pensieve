import { useState } from "react";
import { useDismiss } from "../../hooks/useDismiss";
import { Trash, ChevronRight, ChevronLeft } from "../icons";
import { log } from "../../lib/logger";

// The little menu that blooms when you CLICK (not drag) the gutter 6-dots handle. It acts
// on the row(s) the handle covers — Delete removes them; Change type converts text blocks
// to another block type. Media rows (image/gallery/audio) can't change type, so for them
// only Delete is offered. A click already selected the row(s) (GutterHandle), so the menu
// just reads/acts on those ids.

/** The slice of the editor the menu drives. */
export interface GutterMenuEditor {
  getBlock: (id: string) => { id: string; type?: string } | undefined;
  updateBlock: (id: string, update: unknown) => void;
  removeBlocks: (ids: string[]) => void;
}

// Block types the "Change type" list offers (label → the BlockNote update payload). Only
// text-like blocks are convertible; media/code/table are left out.
const TYPE_OPTIONS: Array<{ label: string; update: { type: string; props?: Record<string, unknown> } }> = [
  { label: "Text", update: { type: "paragraph" } },
  { label: "Heading 1", update: { type: "heading", props: { level: 1 } } },
  { label: "Heading 2", update: { type: "heading", props: { level: 2 } } },
  { label: "Heading 3", update: { type: "heading", props: { level: 3 } } },
  { label: "Bullet List", update: { type: "bulletListItem" } },
  { label: "Numbered List", update: { type: "numberedListItem" } },
  { label: "Check List", update: { type: "checkListItem" } },
  { label: "Quote", update: { type: "quote" } },
];

// Which block types can be re-typed (everything the TYPE_OPTIONS target, plus codeBlock,
// which can convert OUT to text even though it isn't an option itself).
const CONVERTIBLE = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "quote", "codeBlock", "toggleListItem"]);

interface Props {
  x: number;
  y: number;
  ids: string[];
  editor: GutterMenuEditor;
  onClose: () => void;
}

export function GutterMenu({ x, y, ids, editor, onClose }: Props) {
  const [view, setView] = useState<"root" | "type">("root");
  const ref = useDismiss<HTMLDivElement>(onClose);

  // Change type is offered only when EVERY selected row is a convertible text block.
  const convertible = ids.length > 0 && ids.every((id) => CONVERTIBLE.has(editor.getBlock(id)?.type ?? ""));

  const del = () => {
    editor.removeBlocks(ids);
    log.info("editor", "gutter.delete", { count: ids.length });
    onClose();
  };

  const changeType = (opt: (typeof TYPE_OPTIONS)[number]) => {
    ids.forEach((id) => editor.updateBlock(id, opt.update));
    log.info("editor", "gutter.changeType", { count: ids.length, to: opt.update.type });
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-40 min-w-[172px] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {view === "root" ? (
        <>
          {convertible && (
            <button
              type="button"
              role="menuitem"
              onClick={() => setView("type")}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-text hover:bg-surface"
            >
              <span className="flex-1">Change type</span>
              <ChevronRight size={14} className="text-text-muted" />
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={del}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-danger hover:bg-surface"
          >
            <Trash size={16} />
            <span className="flex-1">Delete</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setView("root")}
            className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text-muted hover:bg-surface"
          >
            <ChevronLeft size={13} />
            <span>Change type</span>
          </button>
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="menuitem"
              onClick={() => changeType(opt)}
              className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-text hover:bg-surface"
            >
              {opt.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
