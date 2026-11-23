// look.ts — how a form template looks. A form's look is its ordinary flask `icon`
// (frontmatter, edited with the FlaskPicker), so no new storage. A form may wear any memory
// shape or the form flask (a measuring flask, shape "form") — the form flask is offered on
// forms only (design/form-look.md). A form with no chosen icon uses FORM_DEFAULT_ICON: the
// form flask in purple.
//
// Pure (shared with the phone PWA).

import { DEFAULT_ICON, FLASK_SHAPES, type FlaskShape, type NoteIcon } from "../flasks/icon";

export const FORM_DEFAULT_ICON: NoteIcon = { shape: "form", color: "purple" };

/** The shapes a form's picker offers: the form flask first, then every memory shape. */
export const FORM_SHAPES: FlaskShape[] = ["form", ...FLASK_SHAPES];

/** The icon to draw/edit: the chosen one, else the form default (forms) or DEFAULT_ICON. */
export function resolveIcon(icon: NoteIcon | undefined, form?: boolean): NoteIcon {
  return icon ?? (form ? FORM_DEFAULT_ICON : DEFAULT_ICON);
}

/** The silhouette to draw. A form draws its chosen shape; a memory never draws the form
 *  flask (e.g. a form stopped being a form, or a hand-edited file) — it falls back to the
 *  default memory shape. */
export function drawShape(icon: NoteIcon | undefined, form?: boolean): FlaskShape {
  const shape = resolveIcon(icon, form).shape;
  return shape === "form" && !form ? DEFAULT_ICON.shape : shape;
}
