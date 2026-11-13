/**
 * Shape of a public profile slug: /r/<slug>.
 *
 * Lowercase letters, digits and single hyphens, 3 to 60 characters. This is a
 * URL-shape rule only — whether a professional owns a slug is a server
 * question that does not exist yet.
 */
const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 60;

export function isValidProfileSlug(slug: string): boolean {
  return slug.length >= MIN_LENGTH && slug.length <= MAX_LENGTH && PROFILE_SLUG_PATTERN.test(slug);
}

export function profilePath(slug: string): `/r/${string}` {
  return `/r/${slug}`;
}

export function bookingPath(slug: string): `/r/${string}/reserver` {
  return `/r/${slug}/reserver`;
}
