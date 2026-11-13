import { createReactBlockSpec } from "@blocknote/react";
import { SpellCard, stopEditorEvent } from "./SpellCard";

// A charm: a named AI command written into a form (`charm` block ⇄ ```pensieve:charm
// fence, lib/md/formBlocks). It lives only in the form itself — memories made from the
// form leave it out and show a button with its name instead (FORMS Phase 6). The prompt
// is plain words; AI decides the period and what to read when it runs.

interface Props {
  name: string;
  prompt: string;
}
interface BlockLike {
  id: string;
  props: Props;
}
interface EditorLike {
  isEditable: boolean;
  updateBlock: (id: string, update: { props: Partial<Props> }) => void;
}

export function CharmView({ block, editor }: { block: BlockLike; editor: EditorLike }) {
  const { name, prompt } = block.props;
  const editable = editor.isEditable;
  const update = (p: Partial<Props>) => editor.updateBlock(block.id, { props: p });
  return (
    <SpellCard
      className="pensieve-charm"
      glyph={<span aria-hidden className="text-gold">✦</span>}
      header={
        <input
          value={name}
          readOnly={!editable}
          placeholder="Charm name, e.g. Compress"
          aria-label="Charm name"
          onChange={(e) => update({ name: e.target.value })}
          onKeyDown={stopEditorEvent}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-muted"
        />
      }
      text={prompt}
      editable={editable}
      placeholder="What should AI do when you press it? Plain words — it picks the period and what to read."
      label="Charm prompt"
      onText={(v) => update({ prompt: v })}
    />
  );
}

export const CharmBlock = createReactBlockSpec(
  {
    type: "charm",
    content: "none",
    propSchema: {
      name: { default: "" },
      prompt: { default: "" },
    },
  },
  {
    render: (props) => <CharmView block={props.block as never} editor={props.editor as never} />,
  },
)();
