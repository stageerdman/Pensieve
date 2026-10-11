// NoteBody.tsx — the ONE uncontrolled contenteditable editor (title = first H1, rest =
// body).
//
// HARD constraint #3: this is uncontrolled — React renders an empty <div> and NEVER
// re-renders its children; all content is set imperatively on the ref (openNote) and
// mutated by the user. The handlers (input/keydown/focus/blur) never call setState
// during typing, so the node is never reconciled while the user writes. The
// double-tap word selection + touchmove guard are wired via native addEventListener
// elsewhere (useWordSelection / the app's scroll-lock effect).

export function NoteBody({
  bodyRef,
  onInput,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  bodyRef: React.RefObject<HTMLDivElement>;
  onInput: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <div
      className="note-body"
      ref={bodyRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={onInput}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
