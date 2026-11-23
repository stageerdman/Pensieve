# FORM-SHAPE-AND-PHONE-FORMS — v1

## Goal
1. The owner can pick a flask **shape** for a form (e.g. the round-bottom flask) and it is
   saved and drawn, on the Mac and on the phone.
2. On the phone, every form is always there: the "fill a form" list and `form:` never go
   empty, and any form opens and is usable.

## Root causes
1. **Shape can't be picked.** Not a bug in a handler — the picker was built without it:
   `FlaskPicker` hides the whole Shape row when `form` is set, and every renderer forces a
   form to the measuring flask (`FlaskFor`: `shape={form ? "form" : …}`; phone `Flask`:
   `form ? FORM_SHAPE : shape`). So a form's stored shape is ignored everywhere and there is
   no control to change it (design/form-look.md P3: "No shape choice for forms").
2. **Phone loses forms.** The phone keeps only a 14-day window. 4567db8 stopped it
   *forgetting* a form it has, but a form outside the window that the phone doesn't hold
   (already forgotten, or never pulled) is never *brought in*: the desktop's notes index has
   no form flag, so the phone can't tell a form from any old memory.

## Plan
- **P1 Shape for forms.** "form" (the measuring flask) becomes a storable shape, offered only
  on forms. A form's Shape row = Form flask + the six memory shapes. A form draws its chosen
  shape; with none chosen it draws the Form flask (purple). One shared rule
  (`lib/forms/look.ts` `drawShape`) used by the Mac and the phone; a non-form never draws the
  Form flask. Test the rule + the picker.
- **P2 Forms always on the phone.** Desktop publishes `f: 1` for forms in notes-index.json
  (built from the cache-backed store listing, which knows `extra.form`). The phone's window
  keeps and brings in every indexed form regardless of age. Test the window plan.
- **P3 Ship.** Tests + typecheck, rebuild the Mac app, deploy the phone.

## Status
- [x] P1 · [x] P2 · [ ] P3
