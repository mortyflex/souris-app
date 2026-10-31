// BeautIzzy — the contextual actions of ONE Sale (pure)
//
// THE selection shared by every entry point — the Sale detail « ••• » and the
// sales history swipe « Actions » — so both always offer exactly the same
// actions. It adds no business rule: it reads the domain position and
// eligibility (docs/domain/SALES.md §15) and names the flows that can
// actually run:
//
//   refund    « Rembourser »         money remains refundable (remainingCents > 0)
//   correct   « Corriger une erreur » money or units remain to correct
//   cancel    « Rembourser intégralement »  nothing was corrected yet (every
//                                    record VOIDED or none) and money was received —
//                                    the flow proposes every unit and the whole
//                                    amount; the restock stays a choice per line,
//                                    off by default (a refund is not a return)
//
// A Revente of an Appointment that has not received its money offers nothing
// (it is removed from the Appointment instead). A Sale with nothing left offers
// nothing. Choosing an action only OPENS its existing flow, never writes.

import {
  getSaleAdjustmentEligibility,
  getSaleAdjustmentPosition,
  getSaleAdjustments,
  type Sale,
  type SaleAdjustment,
} from '@/domain/sales';

import type { SaleAdjustmentIntent } from './presentation';

export type SaleActionKey = SaleAdjustmentIntent;

export function getSaleActions(input: {
  readonly sale: Sale;
  readonly adjustments: readonly SaleAdjustment[];
  readonly appointmentSettled: boolean;
}): readonly SaleActionKey[] {
  const { sale, adjustments, appointmentSettled } = input;
  if (!getSaleAdjustmentEligibility(sale, appointmentSettled).ok) return [];
  const position = getSaleAdjustmentPosition(sale, adjustments);
  const moneyLeft = position.remainingCents > 0;
  const unitsLeft = position.lines.some((line) => line.remainingQuantity > 0);
  if (!moneyLeft && !unitsLeft) return [];
  const untouched = getSaleAdjustments(adjustments, sale.id).every((adjustment) => adjustment.status === 'VOIDED');
  return [...(moneyLeft ? (['refund'] as const) : []), 'correct', ...(untouched && moneyLeft ? (['cancel'] as const) : [])];
}
