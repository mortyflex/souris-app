// The refund summary of the Sale detail: real money movements first, the
// journal apart — and a voided record never counted twice.

import {
  prepareSaleAdjustment,
  prepareSaleAdjustmentReversal,
  prepareSaleRefundOutflow,
  type Sale,
  type SaleAdjustment,
  type SaleAdjustmentDraft,
} from '@/domain/sales';

import {
  describeSaleAdjustmentCashRegisterSync,
  formatSaleNetAmount,
  formatSaleOverRefund,
  formatSaleRefundAmount,
} from '../presentation';
import { getSaleRefundSummary } from '../summary';

const saleAt = new Date(2026, 9, 31, 14, 58);
const at = (minute: number) => new Date(2026, 9, 31, 15, minute);

/** 1 × Shampooing 18 €, paid 18 € by card. */
const sale: Sale = {
  id: 'sale-s3',
  businessId: 'business-a',
  clientId: 'client-a',
  completedAt: saleAt,
  items: [{ id: 'line-shampoo', productId: 'p-shampoo', productName: 'Shampooing', unitPrice: 18, quantity: 1 }],
  payment: { paidAt: saleAt, cardAmountCents: 1800, cashAmountCents: 0 },
};

function record(adjustments: readonly SaleAdjustment[], overrides: Partial<SaleAdjustmentDraft>, now: Date, target: Sale = sale) {
  const result = prepareSaleAdjustment(
    { sale: target, adjustments, appointmentSettled: true, productExists: () => true, now },
    {
      id: 'adj',
      businessId: 'business-a',
      staffMemberId: 'staff-amelie',
      reason: 'CUSTOMER_REFUND',
      lines: [],
      refundCardCents: 0,
      refundCashCents: 0,
      settlement: 'SETTLED',
      ...overrides,
    },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.adjustment;
}

const kinds = (summary: ReturnType<typeof getSaleRefundSummary>) =>
  summary.lines.map((line) => [line.kind, line.adjustment.id, line.amountCents]);

describe('getSaleRefundSummary', () => {
  it('a Sale without any record: nothing given back, nothing listed', () => {
    const summary = getSaleRefundSummary(sale, []);
    expect(summary).toMatchObject({ originalCents: 1800, refundedCents: 0, netCents: 1800, overRefundCents: 0, state: 'NONE' });
    expect(summary.lines).toEqual([]);
    expect(summary.history).toEqual([]);
  });

  it('a partial refund: original, refunded and the remaining net', () => {
    const refund = record([], { id: 'r1', refundCardCents: 1200, refundedAt: at(0) }, at(0));
    const summary = getSaleRefundSummary(sale, [refund]);
    expect(kinds(summary)).toEqual([['REFUND', 'r1', 1200]]);
    expect(summary).toMatchObject({ refundedCents: 1200, netCents: 600, state: 'PARTIAL' });
  });

  it('a full refund reads « FULL », net zero', () => {
    const refund = record([], { id: 'r1', refundCashCents: 1800, refundedAt: at(0) }, at(0));
    expect(getSaleRefundSummary(sale, [refund])).toMatchObject({ refundedCents: 1800, netCents: 0, state: 'FULL' });
  });

  it('the example: 12 € refund + 10 € additional refund after a refusal = 22 €, 4 € too much; the voided entry is journal only', () => {
    const refundA = record([], { id: 'refund-a', refundCardCents: 1200, refundedAt: at(1) }, at(1));
    const refundB = record([], { id: 'refund-b', refundCardCents: 1000, refundedAt: at(3) }, at(3));
    const resolution = prepareSaleRefundOutflow(refundB, [refundA, refundB], at(6));
    if (!resolution.ok) throw new Error(resolution.issue);
    const all = [refundA, resolution.voided, resolution.outflow];

    const summary = getSaleRefundSummary(sale, all);
    expect(kinds(summary)).toEqual([
      ['REFUND', 'refund-a', 1200],
      ['ADDITIONAL_REFUND', 'refund-b-outflow', 1000],
    ]);
    expect(summary).toMatchObject({ originalCents: 1800, refundedCents: 2200, netCents: -400, overRefundCents: 400, state: 'OVER' });
    // Never counted twice: the voided entry of the same 10 € is not a line.
    expect(summary.lines.some((line) => line.adjustment.id === 'refund-b')).toBe(false);
    // The journal keeps every record, newest first.
    expect(summary.history.map((adjustment) => adjustment.id)).toEqual(['refund-b-outflow', 'refund-b', 'refund-a']);
  });

  it('« money not returned »: the voided refusal adds nothing', () => {
    const refundA = record([], { id: 'refund-a', refundCardCents: 1200, refundedAt: at(1) }, at(1));
    const refundB = record([], { id: 'refund-b', refundCardCents: 1000, refundedAt: at(3) }, at(3));
    const voided: SaleAdjustment = { ...refundB, status: 'VOIDED', voidedAt: at(6) };
    const summary = getSaleRefundSummary(sale, [refundA, voided]);
    expect(kinds(summary)).toEqual([['REFUND', 'refund-a', 1200]]);
    expect(summary).toMatchObject({ refundedCents: 1200, netCents: 600, state: 'PARTIAL' });
    expect(summary.history).toHaveLength(2);
  });

  it('a refund still to pay is listed but never counted as refunded', () => {
    const pending = record([], { id: 'p1', refundCardCents: 500, settlement: 'PENDING' }, at(0));
    const summary = getSaleRefundSummary(sale, [pending]);
    expect(kinds(summary)).toEqual([['TO_REFUND', 'p1', 500]]);
    expect(summary).toMatchObject({ refundedCents: 0, pendingCents: 500, netCents: 1800, state: 'NONE' });
  });

  it('a compensated refund and its compensation leave the summary — they stay in the journal', () => {
    const refund = record([], { id: 'r1', refundCardCents: 1200, refundedAt: at(0) }, at(0));
    const reversal = prepareSaleAdjustmentReversal(refund, [refund], {
      id: 'rev-1',
      staffMemberId: 'staff-amelie',
      now: at(5),
      reason: 'RECORDED_IN_ERROR',
    });
    if (!reversal.ok) throw new Error(reversal.issue);
    const summary = getSaleRefundSummary(sale, [refund, reversal.adjustment]);
    expect(summary.lines).toEqual([]);
    expect(summary).toMatchObject({ refundedCents: 0, state: 'NONE' });
    expect(summary.history.map((adjustment) => adjustment.id)).toEqual(['rev-1', 'r1']);
  });

  it('a correction that moved no money is a line without an amount, never counted', () => {
    const correction = record(
      [],
      { id: 'c1', reason: 'WRONG_QUANTITY', lines: [{ saleItemId: 'line-shampoo', quantity: 1, restock: true }] },
      at(0),
    );
    const summary = getSaleRefundSummary(sale, [correction]);
    expect(kinds(summary)).toEqual([['CORRECTION', 'c1', 0]]);
    expect(summary).toMatchObject({ refundedCents: 0, state: 'NONE' });
  });

  it('ignores the records of another Sale', () => {
    const other: Sale = { ...sale, id: 'sale-other' };
    const refund = record([], { id: 'r-other', refundCardCents: 1800, refundedAt: at(0) }, at(0), other);
    expect(getSaleRefundSummary(sale, [refund]).lines).toEqual([]);
  });
});

describe('summary wording', () => {
  it('formats refunds as money going out, the balance signed, the excess plainly', () => {
    expect(formatSaleRefundAmount(1200)).toMatch(/^−12,00\s€$/);
    expect(formatSaleRefundAmount(0)).toMatch(/^0,00\s€$/);
    expect(formatSaleNetAmount(600)).toMatch(/^6,00\s€$/);
    expect(formatSaleNetAmount(-400)).toMatch(/^−4,00\s€$/);
    expect(formatSaleOverRefund(400)).toMatch(/^4,00\s€ remboursés en trop$/);
  });

  it('says synchronization only when it waits or needs a decision', () => {
    const adjustment = { id: 'r1', kind: 'REFUND' as const };
    expect(describeSaleAdjustmentCashRegisterSync(adjustment, 'SYNCED')).toBeUndefined();
    expect(describeSaleAdjustmentCashRegisterSync(adjustment, 'LOCAL_ONLY')).toBeUndefined();
    expect(describeSaleAdjustmentCashRegisterSync(adjustment, 'PENDING')).toEqual({ tone: 'neutral', text: 'Pas encore synchronisé' });
    expect(describeSaleAdjustmentCashRegisterSync(adjustment, 'REFUSED')).toEqual({
      tone: 'warning',
      text: 'Refusé par le serveur : à vérifier',
    });
    expect(describeSaleAdjustmentCashRegisterSync({ id: 'r1-outflow', kind: 'REFUND' }, 'REFUSED')).toEqual({
      tone: 'warning',
      text: 'En attente du serveur',
    });
  });
});
