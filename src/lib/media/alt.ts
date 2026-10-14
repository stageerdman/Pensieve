// Accessible alt / aria-label for an image surface. The caption doubles as the alt text on
// every surface (single image, gallery tile, lightbox); when a caption is absent we fall
// back to a plain, human "Image" rather than leaving an empty alt="" (which marks a content
// image as decorative to a screen reader) or — worse — leaking an opaque blob:/asset: URL.
// A non-blob fallback by construction.

export function mediaAlt(caption?: string | null): string {
  const c = caption?.trim();
  return c ? c : "Image";
}
