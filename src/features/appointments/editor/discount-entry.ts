// BeautIzzy — « Autre montant » / « Autre pourcentage » entry rules (pure)
//
// The free entry of the discount editor, next to the presets: the raw text
// the professional types → the ONE domain value (`AppointmentDiscount`), or
// the sentence explaining why it is not one. Nothing here prices anything:
// the applied cents, the clamp to the services total and the net total stay
// the domain's (`getAppointmentDiscountCents`). No React, no persistence.
//
// Euros go through THE French money parser (`parseEuroInputToCents`): comma
// or dot, at most two decimals, exact integer cents, never floating point.
// A percentage is what the domain stores — a WHOLE number of percent within
// `[1, MAX_DISCOUNT_PERCENT]`, the one bound shared with the SQLite and
// Supabase CHECKs — so `7,5 %` or `60 %` are refused here, never clamped or
// rounded into another discount than the one typed.
//
// An empty entry is not an error: it is simply no entry.

import {
  MAX_DISCOUNT_PERCENT,
  isValidAppointmentDiscount,
  type AppointmentDiscount,
} from '@/domain/appointments';
import { formatCentsAsInput, parseEuroInputToCents } from '@/shared/lib/money';

import { getDiscountPresets, type AppointmentDiscountMode } from './discount-presets';

export interface DiscountEntryState {
  /** The discount the entry stands for; undefined while empty or unreadable. */
  readonly discount: AppointmentDiscount | undefined;
  /** Shown under the entry; undefined while nothing is wrong (an empty entry is not an error). */
  readonly error: string | undefined;
}

const NO_ENTRY: DiscountEntryState = { discount: undefined, error: undefined };

export const DISCOUNT_ENTRY_MESSAGES = {
  invalidAmount: 'Montant invalide',
  invalidPercent: 'Pourcentage invalide',
  zeroAmount: 'La réduction doit être supérieure à 0 €.',
  zeroPercent: 'La réduction doit être supérieure à 0 %.',
  fractionalPercent: 'Saisissez un pourcentage entier.',
  percentAboveMaximum: `Le pourcentage ne peut pas dépasser ${MAX_DISCOUNT_PERCENT} %.`,
} as const;

/** Longest sensible entries: `999999,99` and `100`. */
export const DISCOUNT_ENTRY_MAX_LENGTH: Readonly<Record<AppointmentDiscountMode, number>> = {
  FIXED: 9,
  PERCENT: 3,
};

/** `12`, `12,` (while typing), `12,0`, `12.00`: whole; `12,5`: fractional. */
const PERCENT_PATTERN = /^(\d+)(?:[.,](\d*))?$/;

export function deriveDiscountEntryState(
  mode: AppointmentDiscountMode,
  text: string,
): DiscountEntryState {
  const trimmed = text.replace(/\s| | /g, '');
  if (trimmed.length === 0) return NO_ENTRY;
  return mode === 'PERCENT' ? derivePercentEntry(trimmed) : deriveFixedEntry(trimmed);
}

function deriveFixedEntry(text: string): DiscountEntryState {
  const amountCents = parseEuroInputToCents(text);
  if (amountCents === undefined || !Number.isSafeInteger(amountCents)) {
    return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.invalidAmount };
  }
  if (amountCents === 0) return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.zeroAmount };
  const discount: AppointmentDiscount = { type: 'FIXED', amountCents };
  if (!isValidAppointmentDiscount(discount)) {
    return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.invalidAmount };
  }
  return { discount, error: undefined };
}

function derivePercentEntry(text: string): DiscountEntryState {
  const match = PERCENT_PATTERN.exec(text);
  if (!match) return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.invalidPercent };
  const decimals = match[2] ?? '';
  if (/[1-9]/.test(decimals)) {
    return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.fractionalPercent };
  }
  const percent = Number.parseInt(match[1]!, 10);
  if (!Number.isSafeInteger(percent)) {
    return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.invalidPercent };
  }
  if (percent === 0) return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.zeroPercent };
  if (percent > MAX_DISCOUNT_PERCENT) {
    return { discount: undefined, error: DISCOUNT_ENTRY_MESSAGES.percentAboveMaximum };
  }
  return { discount: { type: 'PERCENT', percent }, error: undefined };
}

/** Whether a discount is one of the quick presets of its own mode. */
export function isDiscountPreset(discount: AppointmentDiscount): boolean {
  return getDiscountPresets(discount.type).some((preset) =>
    preset.type === 'PERCENT'
      ? discount.type === 'PERCENT' && preset.percent === discount.percent
      : discount.type === 'FIXED' && preset.amountCents === discount.amountCents,
  );
}

/**
 * The editable text of a discount when it belongs to the free entry of
 * `mode`: a custom value of that mode (`7,50` for 750 c, `7` for 7 %).
 * Empty for a preset (its chip is selected instead), for no discount, and
 * for a discount of the other mode (the entry never shows a value it is
 * not in charge of).
 */
export function formatDiscountEntryText(
  discount: AppointmentDiscount | undefined,
  mode: AppointmentDiscountMode,
): string {
  if (discount === undefined || discount.type !== mode || isDiscountPreset(discount)) return '';
  return discount.type === 'PERCENT' ? `${discount.percent}` : formatCentsAsInput(discount.amountCents);
}
