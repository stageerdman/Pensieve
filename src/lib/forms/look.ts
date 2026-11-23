// look.ts — how a form template looks in the feed. A form's chosen look IS its flask icon
// (shape + colour + vibrancy + shine, frontmatter `icon`, picked with the FlaskPicker like any
// memory's), so the owner adjusts it per form with no new storage. A form that hasn't chosen
// one renders FORM_DEFAULT_ICON instead of the plain gray vial, so forms stand apart.
//
// Pure (shared with the phone PWA).

import type { NoteIcon } from "../flasks/icon";
import { isFormTemplate, type Extra } from "./meta";

export const FORM_DEFAULT_ICON: NoteIcon = { shape: "round-bottom", color: "purple" };

export interface FormLook {
  isForm: boolean;
  /** The icon to render: the chosen one, else the form default (forms) / undefined (others). */
  icon: NoteIcon | undefined;
}

export function formLook(note: { extra?: Extra; icon?: NoteIcon }): FormLook {
  const isForm = isFormTemplate(note.extra);
  return { isForm, icon: note.icon ?? (isForm ? FORM_DEFAULT_ICON : undefined) };
}
