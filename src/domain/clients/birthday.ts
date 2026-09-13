// Souris — Client birthday helpers
//
// A Client birthday is a DAY + MONTH only (docs/domain/CLIENTS.md §2). Souris
// needs it to recognize an upcoming birthday, offer a birthday promotion and
// show « 21 juillet »; it never needs the year or the age, and it never
// invents one. The canonical domain value is:
//
//     { month: 1..12, day: 1..monthLength }
//
// February always allows 29 days because no year qualifies the date. The
// persistence key is the civil `MM-DD` string; conversions live here only.

export interface ClientBirthday {
  /** Calendar month, 1 (janvier) to 12 (décembre). */
  readonly month: number;
  /** Day of that month, 1 to the month length (February: 29). */
  readonly day: number;
}

export const BIRTHDAY_MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const BIRTHDAY_KEY_PATTERN = /^(\d{2})-(\d{2})$/;
const CIVIL_DATE_PATTERN = /^\d{4}-(\d{2})-(\d{2})$/;

/** Number of selectable days for a month (1..12); February is 29. */
export function getBirthdayMonthLength(month: number): number {
  return MONTH_LENGTHS[month - 1] ?? 0;
}

/** True when the day exists in the month (no year involved). */
export function isValidClientBirthday(value: ClientBirthday): boolean {
  return (
    Number.isInteger(value.month) &&
    Number.isInteger(value.day) &&
    value.month >= 1 &&
    value.month <= 12 &&
    value.day >= 1 &&
    value.day <= getBirthdayMonthLength(value.month)
  );
}

/** `{ month: 7, day: 21 }` → `"07-21"` (the persistence key). */
export function formatBirthdayKey(value: ClientBirthday): string {
  return `${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

/** `"07-21"` → `{ month: 7, day: 21 }`; malformed or impossible input → undefined. */
export function parseBirthdayKey(value: string): ClientBirthday | undefined {
  const match = BIRTHDAY_KEY_PATTERN.exec(value.trim());
  if (!match) return undefined;
  const birthday = { month: Number(match[1]), day: Number(match[2]) };
  return isValidClientBirthday(birthday) ? birthday : undefined;
}

/**
 * Extracts the birthday of a historical civil `YYYY-MM-DD` date (legacy
 * import, schema ≤ v3 rows). The year is discarded, never validated: a
 * `02-29` birthday is preserved whatever year the old record carried.
 */
export function birthdayFromCivilDate(value: string): ClientBirthday | undefined {
  const match = CIVIL_DATE_PATTERN.exec(value.trim());
  if (!match) return undefined;
  const birthday = { month: Number(match[1]), day: Number(match[2]) };
  return isValidClientBirthday(birthday) ? birthday : undefined;
}

/** `{ month: 7, day: 21 }` → `"21 juillet"`; `1` becomes `"1er"`. */
export function formatClientBirthday(value: ClientBirthday): string {
  const monthName = BIRTHDAY_MONTH_NAMES[value.month - 1] ?? '';
  const day = value.day === 1 ? '1er' : String(value.day);
  return `${day} ${monthName}`.trim();
}
