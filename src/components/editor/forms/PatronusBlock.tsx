import { createReactBlockSpec } from "@blocknote/react";
import { SpellCard } from "./SpellCard";
import { PatronusOrb } from "../../../features/assistant/PatronusOrb";
import { DEFAULT_SPELL } from "../../../lib/packages/kinds";

// The Patronus block in a FORM (`patronus` block ⇄ ```pensieve:patronus fence, lib/md/
// formBlocks): the sync spell for every walk-through made from this form on the phone —
// copied to the end of each package, which Patronus carries out when it reaches the
// computer. Empty = the default spell (shown as the placeholder). Unlike a charm it's never
// pressed: it runs by itself, so it has a fixed label, not a name.

interface Props {
  instruction: string;
}
interface BlockLike {
  id: string;
  props: Props;
}
interface EditorLike {
  isEditable: boolean;
  updateBlock: (id: string, update: { props: Partial<Props> }) => void;
}

export function PatronusView({ block, editor }: { block: BlockLike; editor: EditorLike }) {
  return (
    <SpellCard
      className="pensieve-patronus"
      glyph={<PatronusOrb size={20} />}
      header={<span className="text-xs font-semibold text-text-muted">Patronus · on sync</span>}
      text={block.props.instruction}
      editable={editor.isEditable}
      placeholder={DEFAULT_SPELL.form}
      label="Patronus sync spell"
      onText={(v) => editor.updateBlock(block.id, { props: { instruction: v } })}
    />
  );
}

export const PatronusBlock = createReactBlockSpec(
  {
    type: "patronus",
    content: "none",
    propSchema: { instruction: { default: "" } },
  },
  {
    render: (props) => <PatronusView block={props.block as never} editor={props.editor as never} />,
  },
)();
