import { useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { scaleFromProps, scaleProps } from "../../../lib/md/formBlocks";

// A form's rating (`scale` block ⇄ ```pensieve:scale fence, lib/md/formBlocks).
// One row of numbered points: click to rate, click the picked point again to clear.
// Hovering/focusing a point previews what it means; the picked point's meaning stays
// beside the row. "Edit points" opens the anchors inline (how a form is authored —
// there is no separate builder). Inputs stop propagation so the editor never sees them.

interface Props {
  anchors: string;
  value: number;
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

/** Pasted text → anchor list: one per non-empty line, minus a leading "1:"/"2." number
 *  and any Markdown emphasis around it. */
export function splitAnchors(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^[*_]+|[*_]+$/g, "")
        .replace(/^\d+\s*[:.)-]\s*/, "")
        .replace(/^[*_]+|[*_]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
}

export function ScaleView({ block, editor }: { block: BlockLike; editor: EditorLike }) {
  const scale = scaleFromProps(block.props as unknown as Record<string, unknown>);
  const [hover, setHover] = useState<number | null>(null);
  const [editing, setEditing] = useState(scale.anchors.every((a) => !a));
  const editable = editor.isEditable;
  // `value` is explicit (not a default param): passing undefined must CLEAR the rating,
  // while anchor edits keep whatever is picked (still in range).
  const save = (anchors: string[], value: number | undefined) =>
    editor.updateBlock(block.id, { props: scaleProps({ anchors, value: value && value <= anchors.length ? value : undefined }) });
  const saveAnchors = (anchors: string[]) => save(anchors, scale.value);

  const shown = hover ?? scale.value;
  const meaning = shown ? scale.anchors[shown - 1] : "";

  const onPointKey = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    e.stopPropagation();
    const last = scale.anchors.length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = e.key === "ArrowRight" ? Math.min(last, n + 1) : Math.max(1, n - 1);
      (e.currentTarget.parentElement?.children[next - 1] as HTMLElement | undefined)?.focus();
    }
  };

  return (
    <div className="pensieve-scale my-1 w-full" contentEditable={false} onPointerDown={stop}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="radiogroup" aria-label="Rating" className="flex gap-1.5">
          {scale.anchors.map((a, i) => {
            const n = i + 1;
            const on = scale.value === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a ? `${n}: ${a}` : String(n)}
                disabled={!editable}
                onClick={() => save(scale.anchors, on ? undefined : n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(null)}
                onKeyDown={(e) => onPointKey(e, n)}
                className={
                  "h-8 w-8 rounded-full border text-sm tabular-nums transition-colors " +
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
                  (on
                    ? "border-accent bg-accent text-surface"
                    : "border-border text-text-muted hover:border-accent hover:text-text")
                }
              >
                {n}
              </button>
            );
          })}
        </div>
        <span className={"min-w-0 flex-1 text-sm " + (hover ? "text-text-muted" : "text-text")}>{meaning}</span>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="pensieve-scale-edit rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-raised hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Edit points
          </button>
        )}
      </div>

      {editable && editing && (
        <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border p-2">
          {scale.anchors.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs tabular-nums text-text-muted">{i + 1}</span>
              <input
                value={a}
                placeholder="What this point means (optional)"
                aria-label={`Meaning of ${i + 1}`}
                onChange={(e) => saveAnchors(scale.anchors.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={stop}
                onPaste={(e) => {
                  // Pasting several lines (e.g. the anchors from an old Notion form,
                  // "1: I could delete it…") fills every point at once.
                  const pasted = splitAnchors(e.clipboardData.getData("text/plain"));
                  if (pasted.length < 2) return;
                  e.preventDefault();
                  e.stopPropagation();
                  saveAnchors(pasted.slice(0, 10));
                }}
                className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm text-text outline-none hover:bg-surface-raised focus:bg-surface-raised"
              />
              <button
                type="button"
                aria-label={`Remove point ${i + 1}`}
                onClick={() => saveAnchors(scale.anchors.filter((_, j) => j !== i))}
                className="rounded-md px-1.5 text-text-muted hover:bg-surface-raised hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => saveAnchors([...scale.anchors, ""])}
              disabled={scale.anchors.length >= 10}
              className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-raised hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
            >
              + Point
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={scale.anchors.length < 2}
              className="rounded-md px-2 py-1 text-xs text-text hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const ScaleBlock = createReactBlockSpec(
  {
    type: "scale",
    content: "none",
    propSchema: {
      // Anchor texts as a JSON string array (BlockNote props are primitives); value 0 = unrated.
      anchors: { default: "[]" },
      value: { default: 0 },
    },
  },
  {
    render: (props) => <ScaleView block={props.block as never} editor={props.editor as never} />,
  },
)();
