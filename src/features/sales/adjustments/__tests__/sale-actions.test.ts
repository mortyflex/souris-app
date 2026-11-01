import type { Sale, SaleAdjustment } from '@/domain/sales';

import { getSaleActions } from '../sale-actions';

const at = new Date(2026, 9, 12, 10, 0);
const direct: Sale = {
  id: 'sale-direct',
  businessId: 'b',
  completedAt: at,
  items: [{ id: 'line', productId: 'p', productName: 'Soin', unitPrice: 18, quantity: 2 }],
  payment: { paidAt: at, cardAmountCents: 3600, cashAmountCents: 0 },
};

function refund(overrides: Partial<SaleAdjustment>): SaleAdjustment {
  return {
    id: 'r',
    businessId: 'b',
    saleId: 'sale-direct',
    kind: 'REFUND',
    reason: 'RETURN',
    staffMemberId: 's',
    items: [],
    refundCardCents: 1800,
    refundCashCents: 0,
    initialStatus: 'SETTLED',
    status: 'SETTLED',
    refundedAt: at,
    settledAt: at,
    recordedAt: at,
    ...overrides,
  };
}

describe('the ONE selection of a Sale’s contextual actions', () => {
  it('an untouched paid Sale offers the three flows, in that order', () => {
    expect(getSaleActions({ sale: direct, adjustments: [], appointmentSettled: true })).toEqual(['refund', 'correct', 'cancel']);
  });

  it('once something was recorded, « Rembourser intégralement » is no longer offered; a voided entry does not count', () => {
    expect(getSaleActions({ sale: direct, adjustments: [refund({})], appointmentSettled: true })).toEqual(['refund', 'correct']);
    expect(
      getSaleActions({
        sale: direct,
        adjustments: [refund({ status: 'VOIDED', voidedAt: at, initialStatus: 'PENDING', refundedAt: undefined, settledAt: undefined })],
        appointmentSettled: true,
      }),
    ).toEqual(['refund', 'correct', 'cancel']);
  });

  it('no money left: no « Rembourser »; units left: still « Corriger une erreur »', () => {
    const fullMoney = refund({ refundCardCents: 3600 });
    expect(getSaleActions({ sale: direct, adjustments: [fullMoney], appointmentSettled: true })).toEqual(['correct']);
    // A historical Sale without payment: units only — nothing to refund, so no « Rembourser intégralement ».
    expect(getSaleActions({ sale: { ...direct, payment: undefined }, adjustments: [], appointmentSettled: true })).toEqual([
      'correct',
    ]);
  });

  it('nothing left at all, or a Revente of an unpaid Appointment: no action, so no « ••• » and no swipe', () => {
    const everything = refund({ refundCardCents: 3600, items: [{ id: 'i', saleItemId: 'line', productId: 'p', productName: 'Soin', unitPriceCents: 1800, quantity: 2, restock: true }] });
    expect(getSaleActions({ sale: direct, adjustments: [everything], appointmentSettled: true })).toEqual([]);
    const revente: Sale = { ...direct, id: 'revente', appointmentId: 'a', payment: undefined };
    expect(getSaleActions({ sale: revente, adjustments: [], appointmentSettled: false })).toEqual([]);
    expect(getSaleActions({ sale: revente, adjustments: [], appointmentSettled: true })).toEqual(['refund', 'correct', 'cancel']);
  });

  describe('money really given back beyond the ceiling (exceptional outflows) uses up « Rembourser »', () => {
    // 36 € received. A: 18 € refunded. B's refused 18 € really returned: voided + `-outflow`.
    const a = refund({ id: 'a' });
    const bVoided = refund({ id: 'b', status: 'VOIDED', voidedAt: at });
    const bOutflow = refund({ id: 'b-outflow' });

    it('36 € given back out of 36 €: neither « Rembourser » nor « Rembourser intégralement »; units can still be corrected', () => {
      expect(getSaleActions({ sale: direct, adjustments: [a, bVoided, bOutflow], appointmentSettled: true })).toEqual(['correct']);
    });

    it('beyond the sale amount (40 € out of 36 €): the same', () => {
      const bigOutflow = refund({ id: 'c-outflow', refundCardCents: 2200 });
      expect(
        getSaleActions({ sale: direct, adjustments: [a, refund({ id: 'c', status: 'VOIDED', voidedAt: at, refundCardCents: 2200 }), bigOutflow], appointmentSettled: true }),
      ).toEqual(['correct']);
    });

    it('an outflow below the sale amount leaves « Rembourser » for the real balance', () => {
      expect(getSaleActions({ sale: direct, adjustments: [bVoided, bOutflow], appointmentSettled: true })).toEqual(['refund', 'correct']);
    });

    it('a compensation that gives a payout back makes room again', () => {
      const back = refund({ id: 'back-a', kind: 'REVERSAL', reason: 'REFUND_RETURNED', reversesAdjustmentId: 'a' });
      expect(getSaleActions({ sale: direct, adjustments: [a, back, bVoided, bOutflow], appointmentSettled: true })).toEqual([
        'refund',
        'correct',
      ]);
    });
  });
});
