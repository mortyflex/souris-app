// Souris — Client birth date helpers
//
// birthDate is a CIVIL calendar date, stored canonically as:
//
//     YYYY-MM-DD
//
// It is never a timestamp and never a JavaScript Date at local midnight.
// Conversions to/from Date happen only at the input boundary and always
// read/write LOCAL calendar components, so the stored value never shifts
// with timezone.

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a real YYYY-MM-DD civil date. */
export function isValidCivilDate(value: string): boolean {
  const match = CIVIL_DATE_PATTERN.exec(value.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;

  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

/** Parses a civil date into a local calendar Date (local midnight). */
export function parseCivilDate(value: string): Date | undefined {
  const match = CIVIL_DATE_PATTERN.exec(value.trim());
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }
  return parsed;
}

/** Formats a Date into the canonical civil YYYY-MM-DD using local components. */
export function formatCivilDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const frenchBirthDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "1994-10-12" → "12 octobre 1994". Invalid input is returned unchanged. */
export function formatClientBirthDate(birthDate: string): string {
  const parsed = parseCivilDate(birthDate);
  if (!parsed) return birthDate;
  return frenchBirthDateFormatter.format(parsed);
}
