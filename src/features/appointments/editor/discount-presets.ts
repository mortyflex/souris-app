// BeautIzzy — Appointment discount presets (editor UI)
//
// The quick choices the editor offers. They are a UI convenience only: an
// Appointment stores the discount that was chosen, so changing these lists
// later never alters an existing Appointment. Pricing lives in the domain.

import type { AppointmentDiscount } from '@/domain/appointments';

export type AppointmentDiscountMode = AppointmentDiscount['type'];

const PRESET_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

/** 5 % → 50 %. */
export const PERCENT_DISCOUNT_PRESETS: readonly AppointmentDiscount[] = PRESET_STEPS.map(
  (percent) => ({ type: 'PERCENT', percent }),
);

/** 5 € → 50 €, in integer cents. */
export const FIXED_DISCOUNT_PRESETS: readonly AppointmentDiscount[] = PRESET_STEPS.map(
  (euros) => ({ type: 'FIXED', amountCents: euros * 100 }),
);

export function getDiscountPresets(mode: AppointmentDiscountMode): readonly AppointmentDiscount[] {
  return mode === 'PERCENT' ? PERCENT_DISCOUNT_PRESETS : FIXED_DISCOUNT_PRESETS;
}

/** Stable key of a preset, also used in testIDs: `PERCENT-20`, `FIXED-1500`. */
export function getDiscountPresetKey(discount: AppointmentDiscount): string {
  return discount.type === 'PERCENT'
    ? `PERCENT-${discount.percent}`
    : `FIXED-${discount.amountCents}`;
}

/** Chip label: `20` in % mode (the mode switch carries the unit), `15 €` in € mode. */
export function formatDiscountPresetLabel(discount: AppointmentDiscount): string {
  return discount.type === 'PERCENT' ? `${discount.percent}` : `${discount.amountCents / 100} €`;
}
