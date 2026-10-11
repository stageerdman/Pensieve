// The phone app root — The Wand. Built up subsystem by subsystem (reel + loupe, the
// thumb-wheel, the note editor, Accio, sync) from the ported prototype. This shell
// proves the scaffold (shared tokens, dark Basin, Tailwind) before the port lands.
export function PhoneApp() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-surface text-text">
      <h1 className="text-2xl font-semibold text-accent">Pensieve</h1>
      <p className="mt-2 text-sm text-text-muted">The Wand — phone PWA</p>
    </div>
  );
}
