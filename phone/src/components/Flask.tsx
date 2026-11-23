// Flask.tsx — the inline flask glyph, shared by the reel card + search row.
//
// The flask SVG is built by the pure lib/wand/flaskSvg.flaskSVG (a string) and mounted
// via dangerouslySetInnerHTML — the prototype dropped the same markup into a
// `<div class="flask">` (source ~699, 1376). `cat` is a `--cat-*` token key resolved
// through flaskSvg's CAT_HUE (so the palette is the one shared set).
//
// `form` (a form template) may wear the form flask — a measuring flask no memory can
// have — or any memory shape the owner picked for it on the computer (drawShape).

import { CAT_HUE, drawShape, flaskSVG, type NoteShape } from "../lib/wand/flaskSvg";

const FALLBACK_HUE = CAT_HUE["--cat-blue"];

export function Flask({
  shape,
  cat,
  fill,
  form = false,
  className = "flask",
}: {
  shape: NoteShape;
  cat: string;
  fill: number;
  form?: boolean;
  className?: string;
}) {
  const hue = CAT_HUE[cat] ?? FALLBACK_HUE;
  const drawn = drawShape(shape, form);
  return <div className={className} data-shape={drawn} dangerouslySetInnerHTML={{ __html: flaskSVG(drawn, hue, fill) }} />;
}
