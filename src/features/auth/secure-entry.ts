// BeautIzzy — keeping a masked password when iOS clears it (pure)
//
// UIKit empties a secure text field on the first keystroke after it becomes
// secure again (the visibility toggle hides the password) or regains focus.
// Observed on iOS 26: typing « z » after hiding « motdepasse » reports TWO
// changes back to back — "" (the field emptied itself), then "z" — and
// Delete reports "" alone. BeautIzzy promises the visibility control never
// loses what was typed, so the changes that follow such a moment are read
// against the value the field held:
//
//   armed    "" from two characters or more   → the field emptied itself:
//                                               keep the value minus its last
//                                               character (what Delete means)
//                                               and watch the next change
//            one character, not a deletion    → emptied and typed in one change:
//                                               the value continues with it
//   cleared  one character                    → the keystroke that followed the
//                                               emptying: the value continues
//                                               with it (instead of the Delete
//                                               reading above)
//   always   anything else                    → a real edit (autofill, paste, a
//                                               deletion), taken as it arrives
//
// A one-character value deleted with one keystroke is a normal deletion.

export type SecureEntryWatch =
  | { readonly kind: 'idle' }
  /** The field may empty itself on the next keystroke (hidden again, or refocused while hidden). */
  | { readonly kind: 'armed' }
  /** It just did: `from` is the value it held. */
  | { readonly kind: 'cleared'; readonly from: string };

export const IDLE_SECURE_ENTRY_WATCH: SecureEntryWatch = { kind: 'idle' };
export const ARMED_SECURE_ENTRY_WATCH: SecureEntryWatch = { kind: 'armed' };

export interface SecureEntryReading {
  readonly value: string;
  readonly watch: SecureEntryWatch;
}

export function readSecureEntryChange(
  watch: SecureEntryWatch,
  previous: string,
  next: string,
): SecureEntryReading {
  const idle = (value: string): SecureEntryReading => ({ value, watch: IDLE_SECURE_ENTRY_WATCH });

  switch (watch.kind) {
    case 'idle':
      return idle(next);
    case 'armed':
      if (previous.length < 2) return idle(next);
      if (next.length === 0) return { value: previous.slice(0, -1), watch: { kind: 'cleared', from: previous } };
      if (next.length === 1 && next !== previous.slice(0, -1)) return idle(previous + next);
      return idle(next);
    case 'cleared':
      // A later Delete on the kept value (from minus one) leaves from minus two.
      if (next.length === 1 && next !== watch.from.slice(0, -2)) return idle(watch.from + next);
      return idle(next);
  }
}
