// BeautIzzy — Service description (domain) — pure
//
// One optional, multiline, plain-text description per catalogue Service:
// what the prestation includes or excludes, how to prepare, the conditions of
// an external gel removal, the limits of a nail art… written by the
// professional, never generated and never overwritten by BeautIzzy. It is
// prepared for a future public booking page, where it would be shown as TEXT:
// nothing in it is ever interpreted as markup.
//
// The canonical value is meaningful text or absent — the Client notes rule:
// surrounding whitespace trimmed, blank = none, internal line breaks kept.
// Windows line endings are normalised so the same text never syncs as two
// different values.

/** Enforced by the form; generous enough for several short paragraphs. */
export const SERVICE_DESCRIPTION_MAX_LENGTH = 1000;

/** Trims; blank → undefined; `\r\n` → `\n`; internal line breaks kept. */
export function normalizeServiceDescription(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isValidServiceDescription(value: string | null | undefined): boolean {
  const normalized = normalizeServiceDescription(value);
  return normalized === undefined || normalized.length <= SERVICE_DESCRIPTION_MAX_LENGTH;
}
