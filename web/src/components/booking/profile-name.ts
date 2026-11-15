/**
 * The display role of a professional's name in the profile hero.
 *
 * A name may be 120 characters long. One display size for every name would
 * either make a short name timid or turn a long one into a column of seven
 * lines on a phone; the name steps down instead, by length:
 *
 *   ≤ 24 characters  `type-name`         « Atelier Éléonore »
 *   ≤ 48 characters  `type-name-medium`  « Institut de beauté Cœur d’Ébène »
 *   longer           `type-name-long`
 *
 * Characters are counted after NFC normalization, so an accented letter
 * counts once however it was typed.
 * The roles live in src/styles/typography.css. The mobile preview of the
 * page sizes its name from its measured width instead
 * (src/features/online-booking/settings/preview-name-layout.ts).
 */
export type ProfileNameRole = "type-name" | "type-name-medium" | "type-name-long";

export const PROFILE_NAME_SHORT_MAX = 24;
export const PROFILE_NAME_MEDIUM_MAX = 48;

export function profileNameRole(name: string): ProfileNameRole {
  const length = Array.from(name.trim().normalize("NFC")).length;
  if (length <= PROFILE_NAME_SHORT_MAX) return "type-name";
  if (length <= PROFILE_NAME_MEDIUM_MAX) return "type-name-medium";
  return "type-name-long";
}
