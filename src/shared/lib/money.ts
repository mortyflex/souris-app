// Souris — money helpers
//
// The ONE place that formats euros for display and parses French decimal
// input into integer cents. Checkout and Cash Register amounts are exact
// integer cents; catalog and snapshot prices remain the existing euro
// numbers. No screen concatenates `amount + " €"` by hand.

const euroFormatter = new Intl.NumberFormat('fr-FR', {
  currency: 'EUR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

/** `1 240,00 €` from a euro number (catalog price, snapshot price, derived total). */
export function formatEuros(value: number): string {
  return euroFormatter.format(value);
}

/** `1 240,00 €` from integer cents — exact, no floating-point reporting. */
export function formatEuroCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`formatEuroCents: ${cents} is not an integer number of cents`);
  }
  // Integer cents divided by 100 always format exactly at two decimals.
  return euroFormatter.format(cents / 100);
}

/** Snapshot euro numbers → exact integer cents (domain-owned rule, re-exported for screens). */
export { eurosToCents } from '@/domain/appointments';

const AMOUNT_PATTERN = /^(\d+)(?:[.,](\d{0,2}))?$/;

/**
 * Parses a French euro entry into integer cents without floating-point
 * arithmetic. Accepts `95`, `95,5`, `95,50`, `95.50`, surrounding spaces,
 * and a trailing separator while typing (`95,` → 9500). An empty entry is
 * zero. Negative values, letters, several separators, or more than two
 * decimals are invalid (`undefined`).
 */
export function parseEuroInputToCents(input: string): number | undefined {
  const trimmed = input.replace(/\s| | /g, '');
  if (trimmed.length === 0) return 0;
  const match = AMOUNT_PATTERN.exec(trimmed);
  if (!match) return undefined;
  const euros = Number.parseInt(match[1]!, 10);
  const decimals = (match[2] ?? '').padEnd(2, '0');
  return euros * 100 + Number.parseInt(decimals, 10);
}

/** `7550` → `75,50`; the editable text form of an existing amount (no currency sign). */
export function formatCentsAsInput(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`formatCentsAsInput: ${cents} is not a non-negative integer number of cents`);
  }
  const euros = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${euros},${remainder.toString().padStart(2, '0')}`;
}

/** Signed difference for a restrained « Écart » line: `+5,00 €` / `-5,00 €`. */
export function formatSignedEuroCents(cents: number): string {
  if (cents > 0) return `+${formatEuroCents(cents)}`;
  return formatEuroCents(cents);
}
