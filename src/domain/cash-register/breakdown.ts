// BeautIzzy — What a period's Caisse total is made of (pure)
//
// The « Encaissements » block of « Résumé du jour » and « Résumé de la
// semaine »: the money ACTUALLY received in one `[start, end)` window, split
// by where it came from. It reads THE Cash Register selection
// (`getCashRegisterEntries`, register.ts) and nothing else, so its total IS
// the Caisse total of the same window (`getCashRegisterIntervalSummary`) and
// can never diverge from it:
//
//   appointmentCents   final Appointment checkouts + ACTIVE deposits received
//                      in the window. A checkout records services AND the
//                      products sold during the Appointment (« Revente ») as
//                      ONE amount: no product amount is ever split out of it
//   productSaleCents   payments of STANDALONE Sales received in the window —
//                      exactly the Caisse « Vente » entries. An unpaid
//                      (historical) Sale and a Revente never reach it
//   refundCents        the SETTLED Sale adjustments of the window, net, on their
//                      own refund day: positive when money left (refunds,
//                      exceptional outflows), lowered by the reversals that
//                      brought money back — exactly `getCashRegisterRefundSummary`.
//                      PENDING and VOIDED records move nothing
//   totalCents         appointmentCents + productSaleCents − refundCents
//
//   productUnitCount   the physical units of those same standalone Sales —
//                      Σ SaleItem quantities (« Shampooing ×3 + Masque ×2 +
//                      Huile ×1 » = 6), never the number of distinct products.
//                      Exactly the Sales whose money is in `productSaleCents`:
//                      an unpaid Sale or a Revente adds no unit. A refund is
//                      money and never removes a unit sold (as the Caisse
//                      « Produits vendus » card)
//   reventeUnitCount   units sold during an Appointment, completed in the
//                      window (`getCashRegisterProductSummary`): their money is
//                      inside `appointmentCents`
//
// A refund is counted on the day the money left, never on the Sale day: the
// Sale day keeps what was received. Nothing is stored.

import { getCashRegisterProductSummary } from './comparison';
import { getCashRegisterEntries, type CashRegisterInterval, type CashRegisterSources } from './register';

export interface CashRegisterPeriodBreakdown {
  /** Appointment checkouts + ACTIVE deposits received in the window. */
  readonly appointmentCents: number;
  /** Standalone Sale payments received in the window. */
  readonly productSaleCents: number;
  /** Net money given back in the window: positive when money left. */
  readonly refundCents: number;
  /** How many SETTLED adjustments moved money in the window. */
  readonly refundCount: number;
  /** THE Caisse total of the window: appointments + products − refunds. */
  readonly totalCents: number;
  /** Units sold by the standalone Sales counted in `productSaleCents`. */
  readonly productUnitCount: number;
  /** Units sold during an Appointment (their money is in `appointmentCents`). */
  readonly reventeUnitCount: number;
}

export function getCashRegisterPeriodBreakdown(
  sources: CashRegisterSources,
  interval: CashRegisterInterval,
): CashRegisterPeriodBreakdown {
  const start = interval.start.getTime();
  const end = interval.end.getTime();
  let appointmentCents = 0;
  let productSaleCents = 0;
  let refundCents = 0;
  let refundCount = 0;
  let productUnitCount = 0;

  for (const entry of getCashRegisterEntries(sources)) {
    const time = entry.payment.paidAt.getTime();
    if (time < start || time >= end) continue;
    const cents = entry.payment.cardAmountCents + entry.payment.cashAmountCents;
    switch (entry.kind) {
      case 'APPOINTMENT':
      case 'DEPOSIT':
        appointmentCents += cents;
        break;
      case 'SALE':
        productSaleCents += cents;
        for (const item of entry.sale.items) productUnitCount += item.quantity;
        break;
      case 'SALE_ADJUSTMENT':
        // A refund moves negative cents, a reversal positive ones.
        refundCents -= cents;
        refundCount += 1;
        break;
    }
  }

  return {
    appointmentCents,
    productSaleCents,
    refundCents,
    refundCount,
    totalCents: appointmentCents + productSaleCents - refundCents,
    productUnitCount,
    reventeUnitCount: getCashRegisterProductSummary(sources, interval).appointmentUnitCount,
  };
}
