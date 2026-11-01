// BeautIzzy — a refund the SERVER refused, resolved by what really happened
// (docs/domain/SALES.md §15.1): money not returned → the refused record is
// voided; money returned → it is voided AND an exceptional outflow records the
// real money movement, outside the Sale's ceiling, linked by its identity.

import { getCashRegisterDaySummary } from '../../cash-register';
import { getClientTotalSpentCents } from '../../clients/spending';
import {
  canReverseSaleAdjustment,
  createSaleAdjustment,
  findSaleRefundOutflow,
  getSaleAdjustmentCashMovement,
  getSaleAdjustmentPosition,
  getSaleRefundOutflowId,
  getSaleRefundOutflowSourceId,
  isSaleRefundOutflow,
  prepareSaleAdjustment,
  prepareSaleAdjustmentReversal,
  prepareSaleRefundOutflow,
  SaleAdjustmentInvalidError,
  validateSaleAdjustmentDraft,
  voidSaleAdjustment,
  type Sale,
  type SaleAdjustment,
  type SaleAdjustmentDraft,
} from '../index';

const saleAt = new Date(2026, 9, 31, 14, 58);
const refundedA = new Date(2026, 9, 31, 15, 1);
const refundedB = new Date(2026, 9, 31, 15, 3);
const resolvedAt = new Date(2026, 9, 31, 15, 6);

/** 1 × Shampooing 18 €, paid 18 € by card (the Staging 2B Sale). */
const sale: Sale = {
  id: 'sale-s3',
  businessId: 'business-a',
  clientId: 'client-a',
  completedAt: saleAt,
  items: [{ id: 'line-shampoo', productId: 'p-shampoo', productName: 'Shampooing', unitPrice: 18, quantity: 1 }],
  payment: { paidAt: saleAt, cardAmountCents: 1800, cashAmountCents: 0 },
};

function draft(overrides: Partial<SaleAdjustmentDraft>): SaleAdjustmentDraft {
  return {
    id: 'adj',
    businessId: 'business-a',
    staffMemberId: 'staff-amelie',
    reason: 'CUSTOMER_REFUND',
    lines: [],
    refundCardCents: 0,
    refundCashCents: 0,
    settlement: 'SETTLED',
    ...overrides,
  };
}

function record(adjustments: readonly SaleAdjustment[], overrides: Partial<SaleAdjustmentDraft>, now: Date): SaleAdjustment {
  const result = prepareSaleAdjustment(
    { sale, adjustments, appointmentSettled: true, productExists: () => true, now },
    draft(overrides),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.adjustment;
}

/** Device A: 12 € by card, synchronized. Device B, offline: 10 € by card — refused by the server. */
const refundA = record([], { id: 'refund-a', refundCardCents: 1200, refundedAt: refundedA }, refundedA);
const refundB = record(
  [],
  { id: 'refund-b', refundCardCents: 1000, refundedAt: refundedB, note: 'Client mécontente' },
  refundedB,
);

function resolveReturned(all: readonly SaleAdjustment[] = [refundA, refundB]) {
  const result = prepareSaleRefundOutflow(refundB, all, resolvedAt);
  if (!result.ok) throw new Error(result.issue);
  return result;
}

describe('exceptional outflow — identity and link', () => {
  it('derives ONE identity from the refused record, and reads the link back', () => {
    expect(getSaleRefundOutflowId('refund-b')).toBe('refund-b-outflow');
    expect(getSaleRefundOutflowSourceId({ id: 'refund-b-outflow', kind: 'REFUND' })).toBe('refund-b');
    expect(isSaleRefundOutflow({ id: 'refund-b-outflow', kind: 'REFUND' })).toBe(true);
  });

  it('never mistakes an ordinary record for an outflow', () => {
    expect(isSaleRefundOutflow({ id: '9ae9e62e-3436-487a-a413-61eee1913630', kind: 'REFUND' })).toBe(false);
    expect(isSaleRefundOutflow({ id: 'refund-b-outflow', kind: 'REVERSAL' })).toBe(false);
    expect(isSaleRefundOutflow({ id: '-outflow', kind: 'REFUND' })).toBe(false);
  });
});

describe('« L’argent a bien été rendu » — the refused refund is carried forward, never erased', () => {
  it('voids the refused record and records the SAME money as an exceptional outflow', () => {
    const { voided, outflow } = resolveReturned();
    expect(voided).toMatchObject({ id: 'refund-b', status: 'VOIDED', voidedAt: resolvedAt, initialStatus: 'SETTLED' });
    // The refused record keeps everything it said: nothing is rewritten but its status.
    expect(voided).toMatchObject({ refundCardCents: 1000, refundedAt: refundedB, settledAt: refundB.settledAt });
    expect(outflow).toEqual({
      id: 'refund-b-outflow',
      businessId: 'business-a',
      saleId: 'sale-s3',
      kind: 'REFUND',
      reason: 'CUSTOMER_REFUND',
      note: 'Client mécontente',
      staffMemberId: 'staff-amelie',
      items: [],
      refundCardCents: 1000,
      refundCashCents: 0,
      initialStatus: 'SETTLED',
      status: 'SETTLED',
      // The day the money ACTUALLY left — not the day of the resolution.
      refundedAt: refundedB,
      settledAt: resolvedAt,
      recordedAt: resolvedAt,
    });
    expect(findSaleRefundOutflow([refundA, voided, outflow], 'refund-b')).toBe(outflow);
  });

  it('moves the real money on its real day, by its real method — the Caisse and client spending read it', () => {
    const { voided, outflow } = resolveReturned();
    expect(getSaleAdjustmentCashMovement(outflow)).toEqual({ at: refundedB, cardCents: -1000, cashCents: 0 });
    expect(getSaleAdjustmentCashMovement(voided)).toBeUndefined();

    const sources = { appointments: [], sales: [sale], saleAdjustments: [refundA, voided, outflow] };
    // 18 € received − 12 € (A) − 10 € (B, really returned) = −4 € that day: what really happened.
    expect(getCashRegisterDaySummary(sources, saleAt)).toMatchObject({ totalCents: -400, cardCents: -400, cashCents: 0 });
    expect(getClientTotalSpentCents(sources, 'client-a')).toBe(-400);
  });

  it('a refused record whose money was NOT returned moves nothing once voided', () => {
    const result = voidSaleAdjustment(refundB, resolvedAt, { serverRefused: true });
    if (!result.ok) throw new Error(result.issue);
    const sources = { appointments: [], sales: [sale], saleAdjustments: [refundA, result.adjustment] };
    expect(getCashRegisterDaySummary(sources, saleAt)).toMatchObject({ totalCents: 600, cardCents: 600 });
  });

  // Product rule changed (November 2026, « Financial Safety »): money really given back beyond the
  // ceiling still uses up what a NEW refund may give back — it was 600 cents before.
  it('stands outside `committedCents`, but uses up what a NEW refund may give back: 22 € out of 18 € leaves nothing', () => {
    const { voided, outflow } = resolveReturned();
    const all = [refundA, voided, outflow];
    const position = getSaleAdjustmentPosition(sale, all);
    expect(position).toMatchObject({ baseCents: 1800, committedCents: 1200, settledCents: 1200, remainingCents: 0, outflowCents: 1000 });
    const context = { sale, adjustments: all, appointmentSettled: true, productExists: () => true, now: resolvedAt };
    expect(validateSaleAdjustmentDraft(context, draft({ id: 'refund-c', refundCardCents: 1, refundedAt: resolvedAt }))).toEqual([
      { kind: 'AMOUNT_EXCEEDS_REMAINING', requested: 1, remaining: 0 },
    ]);
    // A correction of units only moves no money: still possible.
    expect(
      validateSaleAdjustmentDraft(context, draft({ id: 'fix-c', reason: 'WRONG_QUANTITY', lines: [{ saleItemId: 'line-shampoo', quantity: 1, restock: true }] })),
    ).toEqual([]);
  });

  it('below the sale amount, a new refund is limited to the REAL balance: 18 € − 10 € really returned = 8 €', () => {
    const { voided, outflow } = resolveReturned([refundB]);
    const all = [voided, outflow];
    expect(getSaleAdjustmentPosition(sale, all)).toMatchObject({ committedCents: 0, outflowCents: 1000, remainingCents: 800 });
    const context = { sale, adjustments: all, appointmentSettled: true, productExists: () => true, now: resolvedAt };
    expect(validateSaleAdjustmentDraft(context, draft({ id: 'r8', refundCardCents: 800, refundedAt: resolvedAt }))).toEqual([]);
    expect(validateSaleAdjustmentDraft(context, draft({ id: 'r9', refundCardCents: 900, refundedAt: resolvedAt }))).toEqual([
      { kind: 'AMOUNT_EXCEEDS_REMAINING', requested: 900, remaining: 800 },
    ]);
  });

  it('a compensation that really reverses a payout frees its amount again', () => {
    const { voided, outflow } = resolveReturned();
    // The client gives back A's 12 €: only the 10 € really returned remain committed → 8 € refundable.
    const backA = prepareSaleAdjustmentReversal(refundA, [refundA, voided, outflow], {
      id: 'back-a',
      staffMemberId: 'staff-amelie',
      now: resolvedAt,
      reason: 'REFUND_RETURNED',
      returnedAt: resolvedAt,
      cardCents: 1200,
      cashCents: 0,
    });
    if (!backA.ok) throw new Error(backA.issue);
    expect(getSaleAdjustmentPosition(sale, [refundA, voided, outflow, backA.adjustment]).remainingCents).toBe(800);
    // The client gives back the 10 € of the outflow instead: 18 − 12 = 6 €.
    const backOutflow = prepareSaleAdjustmentReversal(outflow, [refundA, voided, outflow], {
      id: 'back-outflow',
      staffMemberId: 'staff-amelie',
      now: resolvedAt,
      reason: 'REFUND_RETURNED',
      returnedAt: resolvedAt,
      cardCents: 1000,
      cashCents: 0,
    });
    if (!backOutflow.ok) throw new Error(backOutflow.issue);
    expect(getSaleAdjustmentPosition(sale, [refundA, voided, outflow, backOutflow.adjustment]).remainingCents).toBe(600);
  });

  it('a voided entry and a pending refund: the voided one frees nothing it never used, the pending one holds its room', () => {
    const pending = record([], { id: 'p', refundCardCents: 500, settlement: 'PENDING' }, refundedA);
    const voidedPending: SaleAdjustment = { ...pending, status: 'VOIDED', voidedAt: resolvedAt };
    expect(getSaleAdjustmentPosition(sale, [pending]).remainingCents).toBe(1300);
    expect(getSaleAdjustmentPosition(sale, [voidedPending]).remainingCents).toBe(1800);
  });

  it('takes back the units the refused record restocked; the outflow itself never moves stock', () => {
    const restocked = record(
      [],
      { id: 'refund-r', lines: [{ saleItemId: 'line-shampoo', quantity: 1, restock: true }], refundCardCents: 1000, refundedAt: refundedB },
      refundedB,
    );
    const result = prepareSaleRefundOutflow(restocked, [refundA, restocked], resolvedAt);
    if (!result.ok) throw new Error(result.issue);
    expect(result.stockDecrements).toEqual([{ productId: 'p-shampoo', quantity: 1 }]);
    expect(result.outflow.items).toEqual([]);
  });

  it('is recorded ONCE: a second resolution of the same refusal is refused', () => {
    const { voided, outflow } = resolveReturned();
    expect(prepareSaleRefundOutflow(refundB, [refundA, refundB, outflow], resolvedAt)).toEqual({ ok: false, issue: 'ALREADY_RESOLVED' });
    expect(prepareSaleRefundOutflow(voided, [refundA, voided, outflow], resolvedAt)).toEqual({ ok: false, issue: 'ALREADY_RESOLVED' });
  });

  it('only a SETTLED money refund can be carried forward', () => {
    const pending = record([], { id: 'refund-p', refundCardCents: 500, settlement: 'PENDING' }, refundedB);
    expect(prepareSaleRefundOutflow(pending, [pending], resolvedAt)).toEqual({ ok: false, issue: 'NOT_SETTLED' });
    const unitsOnly = record([], { id: 'refund-u', lines: [{ saleItemId: 'line-shampoo', quantity: 1, restock: false }] }, refundedB);
    expect(prepareSaleRefundOutflow(unitsOnly, [unitsOnly], resolvedAt)).toEqual({ ok: false, issue: 'INVALID_AMOUNT' });
    const { outflow } = resolveReturned();
    expect(prepareSaleRefundOutflow(outflow, [outflow], resolvedAt)).toEqual({ ok: false, issue: 'ALREADY_OUTFLOW' });
    const reversal = prepareSaleAdjustmentReversal(refundA, [refundA], {
      id: 'rev-a',
      staffMemberId: 'staff-amelie',
      now: resolvedAt,
      reason: 'RECORDED_IN_ERROR',
    });
    if (!reversal.ok) throw new Error(reversal.issue);
    expect(prepareSaleRefundOutflow(reversal.adjustment, [refundA, reversal.adjustment], resolvedAt)).toEqual({
      ok: false,
      issue: 'NOT_A_REFUND',
    });
  });
});

describe('exceptional outflow — a record of money that left', () => {
  it('is never voided, not even while the server has not accepted it yet', () => {
    const { outflow } = resolveReturned();
    expect(voidSaleAdjustment(outflow, resolvedAt, { serverRefused: true })).toEqual({ ok: false, issue: 'NOT_PENDING' });
  });

  it('may still be compensated if the money comes back later (« argent rendu »)', () => {
    const { voided, outflow } = resolveReturned();
    const all = [refundA, voided, outflow];
    expect(canReverseSaleAdjustment(outflow, all)).toBe(true);
    const reversal = prepareSaleAdjustmentReversal(outflow, all, {
      id: 'rev-outflow',
      staffMemberId: 'staff-amelie',
      now: resolvedAt,
      reason: 'REFUND_RETURNED',
      returnedAt: resolvedAt,
      cardCents: 0,
      cashCents: 1000,
    });
    expect(reversal.ok).toBe(true);
  });

  it('has the canonical shape of money only, settled at once', () => {
    const { outflow } = resolveReturned();
    expect(() =>
      createSaleAdjustment({
        ...outflow,
        items: [
          { id: 'x', saleItemId: 'line-shampoo', productId: 'p-shampoo', productName: 'Shampooing', unitPriceCents: 1800, quantity: 1, restock: false },
        ],
      }),
    ).toThrow(SaleAdjustmentInvalidError);
    expect(() =>
      createSaleAdjustment({ ...outflow, initialStatus: 'PENDING', status: 'PENDING', refundedAt: undefined, settledAt: undefined }),
    ).toThrow(SaleAdjustmentInvalidError);
    expect(() => createSaleAdjustment({ ...outflow, refundCardCents: 0 })).toThrow(SaleAdjustmentInvalidError);
  });
});
