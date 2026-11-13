import { useLayoutEffect, useRef, type ReactNode, type SyntheticEvent } from "react";

// The one shell for a form's AI blocks — a charm (a named command you press) and the
// Patronus block (the sync spell that runs by itself). Sunken card, a glyph + header line,
// and a growing plain-words box. Callers own the header; the box is shared.

const stop = (e: SyntheticEvent) => e.stopPropagation();

interface Props {
  className: string;
  glyph: ReactNode;
  header: ReactNode;
  text: string;
  editable: boolean;
  placeholder: string;
  label: string;
  onText: (v: string) => void;
}

export function SpellCard({ className, glyph, header, text, editable, placeholder, label, onText }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  // Grow the box with its text (no inner scrollbar).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <div
      className={`${className} my-1 w-full rounded-lg border border-border bg-surface-sunken px-3 py-2`}
      contentEditable={false}
      onPointerDown={stop}
    >
      <div className="flex items-center gap-2">
        {glyph}
        {header}
      </div>
      <textarea
        ref={area}
        rows={1}
        value={text}
        readOnly={!editable}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={stop}
        className="mt-1 block w-full resize-none overflow-hidden bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
      />
    </div>
  );
}

export { stop as stopEditorEvent };
