// BeautIzzy — the address of a public booking page (/r/<slug>)
//
// Lowercase letters, digits and single hyphens, 3 to 60 characters. The
// server is authoritative (online_booking_is_valid_slug, and uniqueness);
// the website applies the same shape rule (web/src/features/public-profile).
// This module only keeps the professional from typing an address the server
// would refuse.

export const BOOKING_SLUG_MIN_LENGTH = 3;
export const BOOKING_SLUG_MAX_LENGTH = 60;

const BOOKING_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidBookingSlug(slug: string): boolean {
  return (
    slug.length >= BOOKING_SLUG_MIN_LENGTH &&
    slug.length <= BOOKING_SLUG_MAX_LENGTH &&
    BOOKING_SLUG_PATTERN.test(slug)
  );
}

/**
 * What the address field shows while the professional types: accents
 * removed, lowercase, anything else turned into a single hyphen. A trailing
 * hyphen is kept — she may be about to type the next word.
 */
export function normalizeBookingSlugInput(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, BOOKING_SLUG_MAX_LENGTH);
}

/** A complete address proposed from a name (« Chez Amélie » → `chez-amelie`); may be too short to be valid. */
export function suggestBookingSlug(name: string): string {
  return normalizeBookingSlugInput(name).replace(/-+$/, '');
}
