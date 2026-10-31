// BeautIzzy — the refund summary of ONE Sale, as a professional reads it
//
// Pure presentation over the existing domain (`getSaleAdjustmentPosition`):
// it never changes a record and invents no rule. It says what the Sale detail
// shows FIRST — the real money movements — and keeps the whole journal apart:
//
//   lines     every EFFECTIVE refund (not voided, not compensated), in the
//             order the money moved (`refundedAt`, else `recordedAt`): a refund, an additional refund (the exceptional outflow
//             recorded after a server refusal), a refund still to pay, or a
//             correction that moved no money. One record = one line.
//   history   EVERY record of the Sale, newest first — the immutable journal
//             with each status, date and link (« Historique des corrections »,
//             collapsed). Voided entries, compensated refunds and their
//             compensations appear ONLY there: kept, never merged, never counted.
//
// Totals come from the domain position only: « Total remboursé » is the money
// that really left (settled refunds + additional refunds); a VOIDED record is
// never an effective refund, so it can never be counted twice.

import {
  getSaleAdjustmentAmountCents,
  getSaleAdjustmentPosition,
  getSaleAdjustments,
  isEffectiveSaleRefund,
  isSaleRefundOutflow,
  type Sale,
  type SaleAdjustment,
} from '@/domain/sales';

export type SaleRefundSummaryLineKind =
  /** A settled refund within the Sale's ceiling. */
  | 'REFUND'
  /** Money really returned beyond a server refusal (the exceptional outflow). */
  | 'ADDITIONAL_REFUND'
  /** Recorded, not given back yet: never counted as refunded. */
  | 'TO_REFUND'
  /** A correction of quantities or stock that moved no money. */
  | 'CORRECTION';

export interface SaleRefundSummaryLine {
  readonly kind: SaleRefundSummaryLineKind;
  readonly adjustment: SaleAdjustment;
  readonly amountCents: number;
}

export type SaleRefundSummaryState =
  /** No money given back. */
  | 'NONE'
  | 'PARTIAL'
  /** Exactly what was received was given back. */
  | 'FULL'
  /** More was given back than was received. */
  | 'OVER';

export interface SaleRefundSummary {
  /** What the Sale received (its refundable base): « Vente initiale ». */
  readonly originalCents: number;
  readonly lines: readonly SaleRefundSummaryLine[];
  /** Money that really left: settled refunds + additional refunds. */
  readonly refundedCents: number;
  /** Recorded refunds not given back yet. */
  readonly pendingCents: number;
  /** `originalCents − refundedCents`: negative when more was given back. */
  readonly netCents: number;
  /** How much more than the Sale received was given back (0 otherwise). */
  readonly overRefundCents: number;
  readonly state: SaleRefundSummaryState;
  /** Every record of the Sale, newest first: the audit journal. */
  readonly history: readonly SaleAdjustment[];
}

function lineKind(adjustment: SaleAdjustment, amountCents: number): SaleRefundSummaryLineKind {
  if (amountCents === 0) return 'CORRECTION';
  if (isSaleRefundOutflow(adjustment)) return 'ADDITIONAL_REFUND';
  return adjustment.status === 'PENDING' ? 'TO_REFUND' : 'REFUND';
}

function moneyTime(adjustment: SaleAdjustment): number {
  return (adjustment.refundedAt ?? adjustment.recordedAt).getTime();
}

export function getSaleRefundSummary(sale: Sale, allAdjustments: readonly SaleAdjustment[]): SaleRefundSummary {
  const adjustments = getSaleAdjustments(allAdjustments, sale.id);
  const position = getSaleAdjustmentPosition(sale, allAdjustments);
  const lines: SaleRefundSummaryLine[] = [];
  for (const adjustment of adjustments) {
    if (!isEffectiveSaleRefund(adjustment, adjustments)) continue;
    const amountCents = getSaleAdjustmentAmountCents(adjustment);
    lines.push({ kind: lineKind(adjustment, amountCents), adjustment, amountCents });
  }
  // When the money moved, not when it was typed: an additional refund recorded later still reads in its place.
  lines.sort((a, b) => moneyTime(a.adjustment) - moneyTime(b.adjustment));
  const originalCents = position.baseCents;
  const refundedCents = position.settledCents + position.outflowCents;
  const netCents = originalCents - refundedCents;
  const overRefundCents = Math.max(refundedCents - originalCents, 0);
  const state: SaleRefundSummaryState =
    refundedCents === 0 ? 'NONE' : overRefundCents > 0 ? 'OVER' : netCents === 0 ? 'FULL' : 'PARTIAL';
  return {
    originalCents,
    lines,
    refundedCents,
    pendingCents: position.pendingCents,
    netCents,
    overRefundCents,
    state,
    history: [...adjustments].reverse(),
  };
}
