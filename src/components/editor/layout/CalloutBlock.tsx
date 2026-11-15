import { createExtension } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { log } from "../../../lib/logger";
import { enterInCallout } from "./calloutEnter";

// A callout (`callout` block ⇄ ```pensieve:callout fence, lib/md/callout + extended).
// A quiet tinted box: the optional emoji at left, the block's own line beside it, and the
// rest of the callout's body as its CHILDREN — real, editable blocks (paragraphs, lists,
// note links) drawn inside the same box by the skin (blocknote-skin.css "Callout").
// No icon picker, no colour options: the emoji comes from the import; `/callout` makes a
// plain one.

export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout",
    content: "inline",
    propSchema: {
      // The emoji shown at left ("" = none). Written as the fence's `icon=` line.
      icon: { default: "" },
    },
  },
  {
    render: ({ block, contentRef }) => {
      const icon = (block.props as { icon?: string }).icon;
      return (
        <div className="pensieve-callout">
          {icon ? (
            <span className="pensieve-callout-icon" contentEditable={false} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="pensieve-callout-text" ref={contentRef} />
        </div>
      );
    },
  },
  [
    createExtension({
      key: "callout-enter",
      keyboardShortcuts: {
        Enter: ({ editor }) => {
          const done = editor.transact((tr) => enterInCallout(tr));
          if (done) log.debug("editor", "callout.enter");
          return done;
        },
      },
    }),
  ],
)();
