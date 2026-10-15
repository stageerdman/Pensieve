import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { slashNav, isSlashNavKey } from "./slashNav";

// Our own slash-menu UI + keyboard. BlockNote renders this (via the "/" controller's
// `suggestionMenuComponent`) only while the menu is open, so the document-level keydown
// listener below is live exactly then. We OWN the keys — under the WKWebView shell
// BlockNote's built-in menu keyboard didn't drive selection (arrows moved the caret), so
// we intercept Arrow/Tab/Home/End/Enter/Escape in the capture phase (preventDefault +
// stopPropagation) and leave every other key to flow to the editor (updating the query).
// Selection is OUR state (slashNav), not BlockNote's `selectedIndex` — deterministic.

export interface SlashItem {
  title: string;
  subtext?: string;
  icon?: ReactNode;
  group?: string;
  onItemClick?: () => void;
}

interface MenuProps {
  items: SlashItem[];
  selectedIndex?: number; // BlockNote's — ignored; we own selection
  onItemClick?: (item: SlashItem) => void;
}

// Minimal editor surface we need to cancel the "/query" (closing the menu) on Escape.
interface SlashEditor {
  prosemirrorView?: {
    state: {
      selection: { $from: { parent: { textBetween: (a: number, b: number, c?: string, d?: string) => string }; parentOffset: number; start: () => number; pos: number } };
      tr: { delete: (from: number, to: number) => unknown };
    };
    dispatch: (tr: unknown) => void;
    focus: () => void;
  };
}

/** Delete the "/<query>" text in the current block → the suggestion plugin sees no trigger
 *  and closes the menu, and the stray command text is cleaned up. This is what stock
 *  BlockNote's SuggestionMenuController does itself before running an item; because we own
 *  the menu we must do it both on Escape (cancel cleanly) AND on activate (so the command
 *  text never survives, and the now-empty block gets REPLACED in place — see activate()). */
function clearSlashQuery(editor: SlashEditor): void {
  const view = editor.prosemirrorView;
  if (!view) return;
  const { state } = view;
  const $from = state.selection.$from;
  const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
  const slash = before.lastIndexOf("/");
  if (slash === -1) return view.focus();
  const from = $from.start() + slash;
  view.dispatch(state.tr.delete(from, $from.pos));
  view.focus();
}

export function makeSlashMenu(editor: SlashEditor): FC<MenuProps> {
  return function SlashMenu({ items, onItemClick }) {
    const [index, setIndex] = useState(0);
    const indexRef = useRef(0);
    indexRef.current = index;
    const listRef = useRef<HTMLDivElement>(null);

    // Activate an item by calling ITS OWN handler directly. We deliberately do NOT route
    // through BlockNote's `onItemClick` prop: under our custom component it did not actually
    // run the item (so /image and /gallery inserted nothing).
    //
    // First clear the typed "/<query>" text, exactly as the stock controller does before
    // running an item. This matters: insertOrUpdateBlockForSlashMenu only REPLACES the
    // current block in place when that block is empty (or holds just "/"). Leave "/ima"
    // behind and it instead INSERTS a new block AFTER the paragraph — so the "/ima" text
    // survives and the fresh block lands node-selected in an odd empty state (the "blue
    // dot"). Clearing first makes the block empty, so the image/gallery block replaces the
    // paragraph cleanly and renders its real placeholder.
    const activate = (it: SlashItem) => {
      clearSlashQuery(editor);
      it.onItemClick?.();
    };

    // A fresh items array = the query changed → reset the highlight to the top.
    useEffect(() => setIndex(0), [items]);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (!isSlashNavKey(e.key)) return; // let typing through to the editor
        const res = slashNav(indexRef.current, e.key, e.shiftKey, items.length);
        if (res.type === "none") return;
        e.preventDefault();
        e.stopPropagation();
        if (res.type === "move") setIndex(res.index);
        else if (res.type === "activate") {
          const it = items[res.index];
          if (it) activate(it);
        } else if (res.type === "close") clearSlashQuery(editor);
      };
      // Capture phase so we're authoritative over both the editor caret and BlockNote.
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, [items, onItemClick]);

    // Keep the highlighted row in view as you arrow through a long list.
    useEffect(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" });
    }, [index]);

    if (!items.length) return <div className="pensieve-slashmenu is-empty">No matches</div>;

    // Group headers (BlockNote items carry a `group`); render a label when it changes.
    let lastGroup: string | undefined;
    return (
      <div className="pensieve-slashmenu" ref={listRef} role="listbox">
        {items.map((it, i) => {
          const header = it.group && it.group !== lastGroup ? ((lastGroup = it.group), it.group) : null;
          return (
            <div key={i}>
              {header && <div className="pensieve-slashmenu-group">{header}</div>}
              <button
                type="button"
                data-i={i}
                role="option"
                aria-selected={i === index}
                className={"pensieve-slashmenu-item" + (i === index ? " is-active" : "")}
                // pointerdown (not click) + preventDefault so the editor keeps focus/selection
                onPointerDown={(e) => {
                  e.preventDefault();
                  activate(it);
                }}
                onMouseEnter={() => setIndex(i)}
              >
                {it.icon && <span className="pensieve-slashmenu-icon">{it.icon}</span>}
                <span className="pensieve-slashmenu-text">
                  <span className="pensieve-slashmenu-title">{it.title}</span>
                  {it.subtext && <span className="pensieve-slashmenu-sub">{it.subtext}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };
}
