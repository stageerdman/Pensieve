import { createReactBlockSpec } from "@blocknote/react";
import { Journal } from "./journal/Journal";

// The BlockNote block SPEC for the journal page-run (`journal`). Deliberately thin, same
// shape as ImageGroupBlock: registers the block + its primitive propSchema and mounts
// <Journal>, the orchestrator. Markdown round-trips via lib/md/journal.
export const JournalBlock = createReactBlockSpec(
  {
    type: "journal",
    content: "none",
    propSchema: {
      // The ordered page list as a JSON string (BlockNote props must be primitives); each
      // entry is { url, caption?, saving? } — see lib/md/journal. SAVE rewrites each url →
      // its vault ref and emits the `pensieve:journal` fence (encodeJournalBlock), so this
      // block is never handed to BlockNote's own Markdown converter.
      pages: { default: "[]" },
    },
  },
  {
    render: (props) => <Journal block={props.block as never} editor={props.editor as never} />,
  },
)();
