// look.ts — how a form template looks. A form always DRAWS as the reserved form flask
// (render shape "form", design/form-look.md); what the owner adjusts per form is its colour,
// vibrancy and shine, kept in the form's ordinary flask `icon` (frontmatter, edited with the
// FlaskPicker), so no new storage. A form with no chosen icon uses FORM_DEFAULT_ICON: only
// its colour (purple) is seen — its shape is never drawn, it is just what gets saved when the
// owner first tweaks the look.
//
// Pure (shared with the phone PWA).

import { DEFAULT_ICON, type NoteIcon } from "../flasks/icon";

export const FORM_DEFAULT_ICON: NoteIcon = { shape: "round-bottom", color: "purple" };

/** A form always draws as the form flask (its stored shape is kept but not shown). */
export const FORM_SHAPE_LABEL = "Form flask";

/** The icon to draw/edit: the chosen one, else the form default (forms) or DEFAULT_ICON. */
export function resolveIcon(icon: NoteIcon | undefined, form?: boolean): NoteIcon {
  return icon ?? (form ? FORM_DEFAULT_ICON : DEFAULT_ICON);
}
