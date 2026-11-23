# Form look — a form is a measuring flask (FORMS-IN-SEARCH-AND-FEED, P3)

## User goal
"Which of these is a form?" — answered at a glance, in the feed, on Mac and phone. And
"find my forms" — type `form`, pick **Form**, see only forms.

## The problem with what existed
Every memory already picks one of six flask shapes. In the real vault the two forms are a
round-bottom and a teardrop, the same shapes 20+ memories use. A form's colour alone can't
tell it apart, because colours are shared too. So **shape is the signal**, and it has to be a
shape no memory can have.

## The design
- **The form flask.** A volumetric (measuring) flask: a slim neck with one fill mark, a pear
  body and a flat base, with three graduation ticks down its right side. Those ticks are
  the form's fields, the lines you fill in. Only forms have this shape; it is not one
  of the six memory shapes and can't be picked for a memory.
- **Automatic.** "Use as form" switches the silhouette and "Stop using as form" switches it
  back. Nothing is stored: the shape comes from `form: true` when the flask is drawn, so the
  memory keeps its old shape underneath.
- **Adjustable per form.** The flask picker on a form shows the form flask as its preview and
  drops the Shape row. Colour, Vibrancy and Shine stay, and they're saved in the form's own
  `icon` like any memory's. A form with no chosen icon is purple (`FORM_DEFAULT_ICON`).
- **Glow.** Kept as it is: every flask already glows in its liquid's colour, and a form's
  glow takes the form's colour. No extra halo, because the gold halo already means
  *starred* and a second ring would blur both meanings.
- **Everywhere a flask is drawn for a note:** gallery card, search row, tab, working-set
  strip, related list, page header (desktop); reel card and Accio row (phone).

## Search suggestion
- **Desktop (Summon).** Typing `fo`, `form` or `forms` offers a **Form** row (a small form
  flask + "Form", hinted "type"). Enter stacks a Form chip; its popover says "Only forms.
  Right-click the chip to remove it." The word stays in the free-text search until the row is
  picked (built by P2).
- **Phone (Accio).** The phone has no chip system; its query is plain text (dates like
  "today" are already words it understands). Typing a word that starts `fo…form(s)` shows one
  **Form** chip above the summon bar. Tapping it turns that word into `form:` at the
  front of the query (e.g. `morning fo` → `form: morning `), which shows only forms. `form:`
  can also be typed by hand, and it survives holds and recents for free because it's just
  text.

## Removed / not added
- No new "Form" badge or label on cards. The silhouette says it.
- No shape choice for forms. One form shape is what makes forms recognisable.
- No extra glow ring (see above).

## States
- Empty form (title only): empty, colourless glass like any empty flask. The ticks and
  silhouette still read as a form.
- Small sizes (< 20px: tabs, lists): the silhouette alone. Ticks are drawn only at detailed
  sizes.
- Stop using as form → the flask goes back to the memory's own shape at once.

## Accessibility
- The picker preview label reads "Form flask, <colour>…". The header button reads
  "Flask — Form flask, <colour>".
- The phone Form chip is a real button labelled "Show only forms": 36px tall, with its
  hit area grown to 44px by an invisible inset. It keeps the keyboard up (pointerdown
  preventDefault), and the result list lifts clear of it (`.app-root.suggesting`).
- Phone colour: the phone has no flask picker; a form's colour is set on the Mac and
  syncs over. A form with no chosen colour renders purple on the phone too.
