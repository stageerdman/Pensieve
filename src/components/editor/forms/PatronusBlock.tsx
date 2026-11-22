import { createReactBlockSpec } from "@blocknote/react";
import { SpellCard, stopEditorEvent } from "./SpellCard";
import { PatronusOrb } from "../../../features/assistant/PatronusOrb";
import { SPELLS, type SpellTrigger } from "../../../lib/packages/patronus";

// The Patronus block in a FORM (`patronus` block ⇄ ```pensieve:patronus fence, lib/md/
// formBlocks): one Patronus (AI), one SPELL — what it's for:
//   - Process on sync: runs by itself when a phone walk-through made from this form reaches
//     the computer (copied to the end of each package).
//   - Compress: memories made from this form get a Compress button that summons it.
// The box is the spell's instruction in plain words; empty = the spell's default (shown as
// the placeholder). /patronus is only offered in a form (Editor).

interface Props {
  spell: SpellTrigger;
  instruction: string;
  headers?: string;
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
  const spell = SPELLS.find((s) => s.id === block.props.spell) ?? SPELLS[0];
  const update = (p: Partial<Props>) => editor.updateBlock(block.id, { props: p });
  return (
    <SpellCard
      className="pensieve-patronus"
      glyph={<PatronusOrb size={20} />}
      header={
        <>
          <span className="text-xs font-semibold text-text-muted">Patronus</span>
          <select
            value={spell.id}
            disabled={!editor.isEditable}
            aria-label="Spell"
            onChange={(e) => update({ spell: e.target.value as SpellTrigger })}
            onKeyDown={stopEditorEvent}
            className="rounded-sm bg-transparent text-xs font-semibold text-text outline-none hover:bg-surface-raised focus-visible:ring-1 focus-visible:ring-border"
          >
            {SPELLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      }
      text={block.props.instruction}
      editable={editor.isEditable}
      placeholder={spell.placeholder}
      label={`Patronus ${spell.label} spell`}
      onText={(v) => update({ instruction: v })}
    />
  );
}

export const PatronusBlock = createReactBlockSpec(
  {
    type: "patronus",
    content: "none",
    // `headers`: a note spell's header lines (lib/packages/patronus encodeHeaders), carried
    // verbatim so opening + saving a memory on the Mac never drops its state/receipt.
    propSchema: { spell: { default: "sync" as SpellTrigger, values: ["sync", "compress"] as SpellTrigger[] }, instruction: { default: "" }, headers: { default: "" } },
  },
  {
    render: (props) => <PatronusView block={props.block as never} editor={props.editor as never} />,
  },
)();
