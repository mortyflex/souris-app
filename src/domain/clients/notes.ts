// Souris — Client notes
//
// One optional free-text note per Client, written in Souris by the
// professional: allergies, product sensitivities, preferences, practical
// context (docs/domain/CLIENTS.md §2). Plain text — no categories, no
// medical model, never imported from a legacy address book.
//
// The canonical value is either meaningful text or absent: surrounding
// whitespace is trimmed, a blank note is no note, and the line breaks
// inside the text are preserved exactly.

/**
 * Generous bound enforced by the form input only — several paragraphs fit —
 * so a note can never grow without limit in the synced payload.
 */
export const CLIENT_NOTES_MAX_LENGTH = 2000;

/** Trims the note; blank input → undefined. Internal line breaks are kept. */
export function normalizeClientNotes(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
