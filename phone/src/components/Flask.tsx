// Flask.tsx — the inline flask glyph, shared by the reel card + search row.
//
// The flask SVG is built by the pure lib/wand/flaskSvg.flaskSVG (a string) and mounted
// via dangerouslySetInnerHTML — the prototype dropped the same markup into a
// `<div class="flask">` (source ~699, 1376). `cat` is a `--cat-*` token key resolved
// through flaskSvg's CAT_HUE (so the palette is the one shared set).

import { CAT_HUE, flaskSVG, type FlaskShape } from "../lib/wand/flaskSvg";

const FALLBACK_HUE = CAT_HUE["--cat-blue"];

export function Flask({
  shape,
  cat,
  fill,
  className = "flask",
}: {
  shape: FlaskShape;
  cat: string;
  fill: number;
  className?: string;
}) {
  const hue = CAT_HUE[cat] ?? FALLBACK_HUE;
  return <div className={className} dangerouslySetInnerHTML={{ __html: flaskSVG(shape, hue, fill) }} />;
}
