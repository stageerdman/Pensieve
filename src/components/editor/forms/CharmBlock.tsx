import { useLayoutEffect, useRef, type SyntheticEvent } from "react";
import { createReactBlockSpec } from "@blocknote/react";

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

const stop = (e: SyntheticEvent) => e.stopPropagation();

export function CharmView({ block, editor }: { block: BlockLike; editor: EditorLike }) {
  const { name, prompt } = block.props;
  const editable = editor.isEditable;
  const area = useRef<HTMLTextAreaElement>(null);
  const update = (p: Partial<Props>) => editor.updateBlock(block.id, { props: p });

  // Grow the prompt box with its text (no inner scrollbar).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  return (
    <div
      className="pensieve-charm my-1 w-full rounded-lg border border-border bg-surface-sunken px-3 py-2"
      contentEditable={false}
      onPointerDown={stop}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-gold">✦</span>
        <input
          value={name}
          readOnly={!editable}
          placeholder="Charm name, e.g. Compress"
          aria-label="Charm name"
          onChange={(e) => update({ name: e.target.value })}
          onKeyDown={stop}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-muted"
        />
      </div>
      <textarea
        ref={area}
        rows={1}
        value={prompt}
        readOnly={!editable}
        placeholder="What should AI do when you press it? Plain words — it picks the period and what to read."
        aria-label="Charm prompt"
        onChange={(e) => update({ prompt: e.target.value })}
        onKeyDown={stop}
        className="mt-1 block w-full resize-none overflow-hidden bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
      />
    </div>
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
