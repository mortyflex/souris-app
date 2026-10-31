import {
  canReverseSaleAdjustment,
  createSaleAdjustment,
  getSaleAdjustmentCashMovement,
  getSaleAdjustmentHistory,
  getSaleAdjustmentPosition,
  getSaleRefundableBaseCents,
  prepareSaleAdjustment,
  prepareSaleAdjustmentReversal,
  SaleAdjustmentInvalidError,
  settleSaleAdjustment,
  validateSaleAdjustmentDraft,
  voidSaleAdjustment,
  type Sale,
  type SaleAdjustment,
  type SaleAdjustmentContext,
  type SaleAdjustmentDraft,
} from '../index';

const saleAt = new Date(2026, 9, 12, 10, 0);
const now = new Date(2026, 9, 14, 15, 0);

/** Shampooing 2 × 0,29 € + Soin 1 × 18 € = 18,58 €, paid 10 € card + 8,58 € cash. */
const direct: Sale = {
  id: 'sale-direct',
  businessId: 'business-a',
  clientId: 'client-a',
  completedAt: saleAt,
  items: [
    { id: 'line-shampoo', productId: 'p-shampoo', productName: 'Shampooing', unitPrice: 0.29, quantity: 2 },
    { id: 'line-care', productId: 'p-care', productName: 'Soin', unitPrice: 18, quantity: 1 },
  ],
  payment: { paidAt: saleAt, cardAmountCents: 1000, cashAmountCents: 858 },
};

const revente: Sale = {
  id: 'sale-revente',
  businessId: 'business-a',
  clientId: 'client-a',
  appointmentId: 'appointment-a',
  completedAt: saleAt,
  items: [{ id: 'line-mask', productId: 'p-mask', productName: 'Masque', unitPrice: 25, quantity: 2 }],
};

const historical: Sale = { ...direct, id: 'sale-historical', payment: undefined };

function context(sale: Sale, adjustments: readonly SaleAdjustment[] = [], extra: Partial<SaleAdjustmentContext> = {}): SaleAdjustmentContext {
  return { sale, adjustments, appointmentSettled: true, productExists: () => true, now, ...extra };
}

function draft(overrides: Partial<SaleAdjustmentDraft> = {}): SaleAdjustmentDraft {
  return {
    id: 'adj-1',
    businessId: 'business-a',
    staffMemberId: 'staff-amelie',
    reason: 'WRONG_PRODUCT',
    lines: [{ saleItemId: 'line-care', quantity: 1, restock: true }],
    refundCardCents: 1800,
    refundCashCents: 0,
    settlement: 'SETTLED',
    refundedAt: new Date(2026, 9, 13, 9, 0),
    ...overrides,
  };
}

function prepared(sale: Sale, adjustments: readonly SaleAdjustment[], overrides: Partial<SaleAdjustmentDraft> = {}) {
  const result = prepareSaleAdjustment(context(sale, adjustments), draft(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

describe('Sale adjustments — refundable base', () => {
  it('is the money actually received for a direct Sale, the exact snapshot total for a Revente, zero without record', () => {
    expect(getSaleRefundableBaseCents(direct)).toBe(1858);
    expect(getSaleRefundableBaseCents(revente)).toBe(5000);
    expect(getSaleRefundableBaseCents(historical)).toBe(0);
  });
});

describe('Sale adjustments — preparation', () => {
  it('builds an immutable refund with copied snapshot lines and the stock it restores', () => {
    const result = prepared(direct, []);
    expect(result.adjustment).toMatchObject({
      saleId: 'sale-direct',
      kind: 'REFUND',
      initialStatus: 'SETTLED',
      status: 'SETTLED',
      refundCardCents: 1800,
      refundedAt: new Date(2026, 9, 13, 9, 0),
      settledAt: now,
      recordedAt: now,
    });
    expect(result.adjustment.items).toEqual([
      {
        id: 'adj-1-item-0',
        saleItemId: 'line-care',
        productId: 'p-care',
        productName: 'Soin',
        unitPriceCents: 1800,
        quantity: 1,
        restock: true,
      },
    ]);
    expect(result.restorations).toEqual([{ productId: 'p-care', quantity: 1 }]);
    // The Sale is never touched.
    expect(direct.items[1]?.quantity).toBe(1);
  });

  it('a money refund without physical return restores no stock', () => {
    const result = prepared(direct, [], { lines: [{ saleItemId: 'line-care', quantity: 1, restock: false }] });
    expect(result.restorations).toEqual([]);
  });

  it('refuses more money than remains, across PENDING and SETTLED refunds, to the cent', () => {
    const first = prepared(direct, [], { refundCardCents: 1000, refundCashCents: 0, lines: [] });
    const pending = prepared(direct, [first.adjustment], {
      id: 'adj-2',
      refundCardCents: 0,
      refundCashCents: 800,
      lines: [],
      settlement: 'PENDING',
      refundedAt: undefined,
    });
    expect(pending.adjustment.status).toBe('PENDING');
    const issues = validateSaleAdjustmentDraft(
      context(direct, [first.adjustment, pending.adjustment]),
      draft({ id: 'adj-3', lines: [], refundCardCents: 59, refundCashCents: 0 }),
    );
    expect(issues).toEqual([{ kind: 'AMOUNT_EXCEEDS_REMAINING', requested: 59, remaining: 58 }]);
    expect(getSaleAdjustmentPosition(direct, [first.adjustment, pending.adjustment])).toMatchObject({
      baseCents: 1858,
      settledCents: 1000,
      pendingCents: 800,
      remainingCents: 58,
    });
  });

  it('refuses more units than remain on a line, and never restocks twice', () => {
    const first = prepared(direct, [], {
      lines: [{ saleItemId: 'line-shampoo', quantity: 1, restock: true }],
      refundCardCents: 29,
    });
    const issues = validateSaleAdjustmentDraft(
      context(direct, [first.adjustment]),
      draft({ id: 'adj-2', lines: [{ saleItemId: 'line-shampoo', quantity: 2, restock: true }], refundCardCents: 0 }),
    );
    expect(issues).toEqual([
      { kind: 'QUANTITY_EXCEEDS_REMAINING', saleItemId: 'line-shampoo', requested: 2, remaining: 1 },
    ]);
    const line = getSaleAdjustmentPosition(direct, [first.adjustment]).lines[0];
    expect(line).toMatchObject({ adjustedQuantity: 1, restockedQuantity: 1, remainingQuantity: 1 });
  });

  it('refuses a historical Sale any money, but accepts a unit / stock correction settled at once', () => {
    expect(validateSaleAdjustmentDraft(context(historical), draft())).toEqual([
      { kind: 'AMOUNT_EXCEEDS_REMAINING', requested: 1800, remaining: 0 },
    ]);
    const correction = prepared(historical, [], { refundCardCents: 0, settlement: 'PENDING', refundedAt: undefined });
    expect(correction.adjustment).toMatchObject({ status: 'SETTLED', refundedAt: now });
    expect(getSaleAdjustmentCashMovement(correction.adjustment)).toBeUndefined();
  });

  it('refuses a Revente whose Appointment has not received its money', () => {
    expect(validateSaleAdjustmentDraft(context(revente, [], { appointmentSettled: false }), draft())).toEqual([
      { kind: 'NOT_ELIGIBLE', reason: 'APPOINTMENT_NOT_SETTLED' },
    ]);
    const refund = prepared(revente, [], {
      lines: [{ saleItemId: 'line-mask', quantity: 1, restock: false }],
      refundCardCents: 0,
      refundCashCents: 2500,
    });
    expect(refund.adjustment.status).toBe('SETTLED');
  });

  it('reports every issue at once: unknown line, invalid quantity, missing product, empty, bad date', () => {
    expect(
      validateSaleAdjustmentDraft(
        context(direct, [], { productExists: (id) => id !== 'p-care' }),
        draft({
          lines: [
            { saleItemId: 'line-gone', quantity: 1, restock: false },
            { saleItemId: 'line-shampoo', quantity: 0, restock: false },
            { saleItemId: 'line-care', quantity: 1, restock: true },
          ],
          refundedAt: new Date(2026, 9, 15),
        }),
      ),
    ).toEqual([
      { kind: 'UNKNOWN_LINE', saleItemId: 'line-gone' },
      { kind: 'INVALID_QUANTITY', saleItemId: 'line-shampoo' },
      { kind: 'RESTOCK_PRODUCT_MISSING', productId: 'p-care', productName: 'Soin' },
      { kind: 'INVALID_REFUND_DATE' },
    ]);
    expect(validateSaleAdjustmentDraft(context(direct), draft({ lines: [], refundCardCents: 0 }))).toEqual([
      { kind: 'EMPTY' },
    ]);
    expect(
      validateSaleAdjustmentDraft(context(direct), draft({ refundedAt: new Date(2026, 9, 11) })),
    ).toEqual([{ kind: 'INVALID_REFUND_DATE' }]);
    expect(validateSaleAdjustmentDraft(context(direct), draft({ refundCardCents: 10.5 }))).toEqual([
      { kind: 'INVALID_AMOUNT' },
    ]);
  });
});

describe('Sale adjustments — lifecycle and history', () => {
  const pending = prepared(direct, [], { settlement: 'PENDING', refundedAt: undefined }).adjustment;

  it('a PENDING refund settles once, keeping both the real refund date and the recording instant', () => {
    const later = new Date(2026, 9, 16, 11, 0);
    const settled = settleSaleAdjustment(pending, direct, new Date(2026, 9, 15, 18, 0), later);
    expect(settled.ok && settled.adjustment).toMatchObject({
      status: 'SETTLED',
      initialStatus: 'PENDING',
      refundedAt: new Date(2026, 9, 15, 18, 0),
      settledAt: later,
      recordedAt: now,
    });
    if (!settled.ok) throw new Error('not settled');
    expect(getSaleAdjustmentHistory(settled.adjustment)).toEqual([
      { kind: 'RECORDED_PENDING', at: now },
      { kind: 'SETTLED', at: later },
    ]);
    expect(settleSaleAdjustment(settled.adjustment, direct, later, later)).toEqual({ ok: false, issue: 'NOT_PENDING' });
    expect(settleSaleAdjustment(pending, direct, new Date(2026, 9, 17), later)).toEqual({
      ok: false,
      issue: 'INVALID_REFUND_DATE',
    });
  });

  it('a PENDING refund may be voided — its restocked units leave the stock again — a SETTLED one never', () => {
    const voided = voidSaleAdjustment(pending, new Date(2026, 9, 15));
    expect(voided.ok && voided.adjustment.status).toBe('VOIDED');
    expect(voided.ok && voided.stockDecrements).toEqual([{ productId: 'p-care', quantity: 1 }]);
    if (!voided.ok) throw new Error('not voided');
    expect(getSaleAdjustmentHistory(voided.adjustment).map((step) => step.kind)).toEqual([
      'RECORDED_PENDING',
      'VOIDED',
    ]);
    // A voided refund no longer counts: the whole amount is refundable again.
    expect(getSaleAdjustmentPosition(direct, [voided.adjustment]).remainingCents).toBe(1858);

    const settled = prepared(direct, []).adjustment;
    expect(voidSaleAdjustment(settled, now)).toEqual({ ok: false, issue: 'NOT_PENDING' });
    // Only a record the server refused (never authoritative) may be voided after settlement.
    expect(voidSaleAdjustment(settled, now, { serverRefused: true }).ok).toBe(true);
  });

  it('« saisie erronée »: the compensation mirrors the refund ON ITS OWN DAY, recorded today; the day nets to zero', () => {
    const refund = prepared(direct, []).adjustment;
    const today = new Date(2026, 9, 20, 9, 0);
    const reversal = prepareSaleAdjustmentReversal(refund, [refund], {
      id: 'rev-1',
      staffMemberId: 'staff-amelie',
      reason: 'RECORDED_IN_ERROR',
      now: today,
    });
    if (!reversal.ok) throw new Error('not reversed');
    expect(reversal.adjustment).toMatchObject({
      kind: 'REVERSAL',
      reason: 'RECORDED_IN_ERROR',
      reversesAdjustmentId: refund.id,
      refundCardCents: 1800,
      refundCashCents: 0,
      // Counted where the fictitious movement was counted…
      refundedAt: refund.refundedAt,
      // …and traced as recorded today.
      recordedAt: today,
      settledAt: today,
    });
    expect(reversal.stockDecrements).toEqual([{ productId: 'p-care', quantity: 1 }]);
    const refundMove = getSaleAdjustmentCashMovement(refund)!;
    const correctionMove = getSaleAdjustmentCashMovement(reversal.adjustment)!;
    expect(correctionMove.at).toEqual(refundMove.at);
    expect(refundMove.cardCents + correctionMove.cardCents).toBe(0);
    const all = [refund, reversal.adjustment];
    expect(canReverseSaleAdjustment(refund, all)).toBe(false);
    expect(prepareSaleAdjustmentReversal(refund, all, { id: 'rev-2', staffMemberId: 's', reason: 'RECORDED_IN_ERROR', now })).toEqual({
      ok: false,
      issue: 'ALREADY_REVERSED',
    });
    expect(getSaleAdjustmentPosition(direct, all)).toMatchObject({ remainingCents: 1858, committedCents: 0 });
  });

  it('« argent rendu »: a new receipt of the WHOLE refund, on the day it came back, by the method it came back with', () => {
    const refund = prepared(direct, []).adjustment; // 18 € by card on 13 October
    const input = {
      id: 'rev-1',
      staffMemberId: 'staff-amelie',
      reason: 'REFUND_RETURNED' as const,
      returnedAt: new Date(2026, 9, 14, 11, 0),
      cardCents: 0,
      cashCents: 1800,
      now,
    };
    const returned = prepareSaleAdjustmentReversal(refund, [refund], input);
    if (!returned.ok) throw new Error('not returned');
    expect(returned.adjustment).toMatchObject({ reason: 'REFUND_RETURNED', refundCardCents: 0, refundCashCents: 1800 });
    expect(getSaleAdjustmentCashMovement(returned.adjustment)).toEqual({ at: new Date(2026, 9, 14, 11, 0), cardCents: 0, cashCents: 1800 });
    // The refund that really happened stays a real movement on its own day.
    expect(getSaleAdjustmentCashMovement(refund)).toEqual({ at: new Date(2026, 9, 13, 9, 0), cardCents: -1800, cashCents: 0 });
    // Partial, excessive, before the refund, or in the future: refused.
    expect(prepareSaleAdjustmentReversal(refund, [refund], { ...input, cashCents: 900 })).toEqual({ ok: false, issue: 'INVALID_AMOUNT' });
    expect(prepareSaleAdjustmentReversal(refund, [refund], { ...input, cashCents: 1801 })).toEqual({ ok: false, issue: 'INVALID_AMOUNT' });
    expect(prepareSaleAdjustmentReversal(refund, [refund], { ...input, returnedAt: new Date(2026, 9, 12) })).toEqual({
      ok: false,
      issue: 'INVALID_REFUND_DATE',
    });
    expect(prepareSaleAdjustmentReversal(refund, [refund], { ...input, returnedAt: new Date(2026, 9, 15) })).toEqual({
      ok: false,
      issue: 'INVALID_REFUND_DATE',
    });
  });

  it('only a SETTLED refund can be compensated; a pending one is voided instead', () => {
    const pendingRefund = prepared(direct, [], { settlement: 'PENDING', refundedAt: undefined }).adjustment;
    expect(
      prepareSaleAdjustmentReversal(pendingRefund, [pendingRefund], { id: 'r', staffMemberId: 's', reason: 'RECORDED_IN_ERROR', now }),
    ).toEqual({ ok: false, issue: 'NOT_SETTLED' });
  });

  it('moves money only once SETTLED', () => {
    expect(getSaleAdjustmentCashMovement(pending)).toBeUndefined();
  });
});

describe('Sale adjustments — canonical shape', () => {
  const base = prepared(direct, []).adjustment;

  it('refuses incoherent records', () => {
    expect(() => createSaleAdjustment({ ...base, refundCardCents: -1 })).toThrow(SaleAdjustmentInvalidError);
    expect(() => createSaleAdjustment({ ...base, status: 'PENDING' })).toThrow(SaleAdjustmentInvalidError);
    expect(() => createSaleAdjustment({ ...base, status: 'VOIDED' })).toThrow(SaleAdjustmentInvalidError);
    expect(() => createSaleAdjustment({ ...base, kind: 'REVERSAL' })).toThrow(SaleAdjustmentInvalidError);
    expect(() => createSaleAdjustment({ ...base, items: [], refundCardCents: 0 })).toThrow(SaleAdjustmentInvalidError);
    expect(() =>
      createSaleAdjustment({ ...base, items: [{ ...base.items[0]!, quantity: 0 }] }),
    ).toThrow(SaleAdjustmentInvalidError);
    // A refund never carries a compensation's meaning, and a compensation always does.
    expect(() => createSaleAdjustment({ ...base, reason: 'REFUND_RETURNED' })).toThrow(SaleAdjustmentInvalidError);
    expect(() =>
      createSaleAdjustment({ ...base, kind: 'REVERSAL', reversesAdjustmentId: 'x', items: [], reason: 'RETURN' }),
    ).toThrow(SaleAdjustmentInvalidError);
  });
});
