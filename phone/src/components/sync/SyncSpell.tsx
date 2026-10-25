// SyncSpell.tsx — the cast overlay (ripple ring + spinning lemniscate rune only).
//
// Source markup ~503-507, behaviour ~1491-1508. The ring/rune are keyed on `castId`
// so each cast remounts them and replays the .go animation from the start (the
// prototype forced a reflow for the same effect). NO text here — the owner doesn't
// want anything overlapping the main screen; the header's SyncRune (see PhoneApp's
// header) already carries the "needs attention / in progress" signal, and any wording
// (what's syncing, success/fail) belongs in the Sync window, not floating center-screen.

export function SyncSpell({ show, castId }: { show: boolean; castId: number }) {
  return (
    <div className={show ? "spell show" : "spell"}>
      <div key={"ring" + castId} className="ring go" />
      <svg key={"rune" + castId} className="rune go" viewBox="0 0 24 24" fill="none">
        <path className="lemniscate" pathLength="1" d="M12 12 C16 9.5 16 4.5 12 4 C8 4.5 8 9.5 12 12 C16 14.5 16 19.5 12 20 C8 19.5 8 14.5 12 12 Z" />
      </svg>
    </div>
  );
}
