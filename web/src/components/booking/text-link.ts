/**
 * The text links — and link-like buttons — of the public booking pages (a
 * professional's page and the booking flow): NEVER underlined, in any state.
 * The Nacre lavender, their weight, where they stand (a contact list, an
 * action beside a summary) and the icons beside them already say they act; a
 * decorative line under them added nothing but noise.
 *
 * What stays: a mouse hover and a press answer with the accent violet (on a
 * touch screen, `hover:` never sticks — Tailwind keeps it to devices that can
 * hover), and the keyboard focus keeps the site's ring (`:focus-visible`,
 * globals.css) — nothing here removes an outline. Buttons, inputs, borders and
 * separators are not concerned.
 */

/** The answer of a text link to a hover or a press: a colour, never a line. */
export const LINK_FEEDBACK = "transition-colors duration-[var(--bz-duration-state)] hover:text-accent active:text-accent";

/** A quiet text link: the contact details, « Itinéraire » inside a summary, « Modifier ». */
export const TEXT_LINK = `font-medium text-lavender-700 ${LINK_FEEDBACK}`;
