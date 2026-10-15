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
// Media: a hidden <input type=file accept=image/* multiple> (NO capture attr → the native
// iOS sheet: Photo Library / Take Photo / Choose File) is the ONE picker both reach-points
// drive — the NoteToolbar photo button (keyboard-up) and the "Photo" spell (keyboard-down,
// via the gold spell-menu opener in the BOTTOM action bar — see the phone control standard).

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
  fileInputRef,
  micListening,
  onBack,
  onDateClick,
  onBodyInput,
  onBodyKeyDown,
  onBodyFocus,
  onBodyBlur,
  onFormat,
  onInsertImage,
  onPickFiles,
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
  fileInputRef: React.RefObject<HTMLInputElement>;
  micListening: boolean;
  onBack: () => void;
  onDateClick: () => void;
  onBodyInput: () => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBodyFocus: () => void;
  onBodyBlur: () => void;
  onFormat: (f: FmtKey) => void;
  onInsertImage: () => void;
  onPickFiles: (files: FileList | null) => void;
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
        onPointerDown={(e) => {
          // Notion-style: a tap in the empty area BELOW the content (the surface itself, or the
          // body's own padding — not a block) drops the caret into a trailing text row so you can
          // write under images.
          const body = bodyRef.current;
          if (!body) return;
          if (e.target === e.currentTarget || e.target === body) {
            e.preventDefault();
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
      {/* the ONE picker: native iOS sheet (no `capture` → Photo Library / Take Photo / Choose File) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = ""; // allow re-picking the same file
        }}
      />
    </div>
  );
}
