// MemoryPage.tsx — THE MEMORY PAGE: the full-screen read/write surface for one memory
// (Apple-Notes-smooth, autosave).
//
// Source markup ~520-542. It is its OWN page — mounted only while open/closing (never
// parked in the home/Memory-Bank DOM) — and slides up via the .open class (React state)
// + transform transition. The date + "Saved" indicator are set imperatively on their
// refs (openNote / useAutosave). The top chrome fades out on .editing-note (CSS).
// (Internal class names + refs still use the legacy `note*` prefix — a cosmetic rename
// deferred to keep this change surgical.)
//
// Media: the hidden file-picker input now lives at the PhoneApp root (not here) — the "Snap"
// spell must reach it from the HOME screen too, before any memory is open, so it can't be
// scoped to this page's own DOM.

import { NoteBody } from "./NoteBody";
import { NoteToolbar, type FmtKey } from "./NoteToolbar";
import { NoteActions } from "./NoteActions";
import { caretToTrailingRow } from "./mediaDom";

export function MemoryPage({
  open,
  noteRef,
  surfaceRef,
  bodyRef,
  dateRef,
  savedRef,
  voiceRef,
  micListening,
  onBack,
  onDateClick,
  onBodyInput,
  onBodyKeyDown,
  onBodyFocus,
  onBodyBlur,
  onFormat,
  onInsertImage,
  onOpenSpellMenu,
  onVoice,
  onDone,
}: {
  open: boolean;
  noteRef: React.RefObject<HTMLDivElement>;
  surfaceRef: React.RefObject<HTMLDivElement>;
  bodyRef: React.RefObject<HTMLDivElement>;
  dateRef: React.RefObject<HTMLDivElement>;
  savedRef: React.RefObject<HTMLDivElement>;
  voiceRef: React.RefObject<HTMLButtonElement>;
  micListening: boolean;
  onBack: () => void;
  onDateClick: () => void;
  onBodyInput: () => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBodyFocus: () => void;
  onBodyBlur: () => void;
  onFormat: (f: FmtKey) => void;
  onInsertImage: () => void;
  onOpenSpellMenu: () => void;
  onVoice: () => void;
  onDone: () => void;
}) {
  return (
    <div className={open ? "note open" : "note"} ref={noteRef}>
      {/* Top chrome = INFO only (date + Saved). Controls live in the bottom action bar, per the
          phone control standard. */}
      <div className="note-top">
        <div className="note-date" ref={dateRef} onClick={onDateClick} />
        <div className="note-saved" ref={savedRef}>
          <i /> Saved
        </div>
      </div>
      <div
        className="note-surface"
        ref={surfaceRef}
        onClick={(e) => {
          // Notion-style: a tap in the empty area BELOW the content (the surface itself, or the
          // body's own padding — not a block) drops the caret into a trailing text row so you can
          // write under images. Fire on `click`, NOT pointerdown: a scroll gesture never produces a
          // click, so the keyboard only appears on a real tap-and-release — never while scrolling.
          const body = bodyRef.current;
          if (!body) return;
          if (e.target === e.currentTarget || e.target === body) {
            caretToTrailingRow(body);
          }
        }}
      >
        <NoteBody bodyRef={bodyRef} onInput={onBodyInput} onKeyDown={onBodyKeyDown} onFocus={onBodyFocus} onBlur={onBodyBlur} />
      </div>
      <NoteToolbar micListening={micListening} voiceRef={voiceRef} onFormat={onFormat} onInsertImage={onInsertImage} onVoice={onVoice} onDone={onDone} />
      {/* Bottom control bar = the 4-cell Dock (phone standard): Back beside the Spell Menu opener
          (Conditional "Photo"), bottom-right. Hides while editing — the keyboard toolbar takes over. */}
      <NoteActions onBack={onBack} onOpenMenu={onOpenSpellMenu} />
    </div>
  );
}
