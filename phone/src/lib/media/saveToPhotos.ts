// saveToPhotos.ts — the WhatsApp-style "also keep a copy in your phone's own gallery" ask,
// built on the ONE API a web PWA actually has on iOS: the Web Share API's share sheet.
//
// There is no silent, programmatic "write to Photos" for web content on iOS — a native app
// like WhatsApp holds a Photos-library permission and can write directly; a PWA has no such
// permission to request. The closest a PWA can get is auto-opening the native share sheet
// right after capture, which surfaces a prominent "Save Video" action for a local file — ONE
// tap, not silent, but as close to "automatic" as the platform allows. Stated plainly so this
// is never mistaken for a bug: the single required tap IS the ceiling, not a shortfall.
//
// Scoped to a fresh CAPTURE only (Film), never "Upload" — a file picked from Files/Photos is
// presumably already there, so re-offering to save it back would be a confusing extra step
// for no benefit.

export async function offerSaveToPhotos(file: File): Promise<void> {
  if (!navigator.share) return; // unsupported browser/context — skip silently, never block capture
  const data: ShareData = { files: [file] };
  if (navigator.canShare && !navigator.canShare(data)) return;
  try {
    await navigator.share(data);
  } catch {
    // AbortError (the user dismissed the sheet without saving) or any other failure — the
    // video is already safely in the note either way, so this is never surfaced as an error.
  }
}
