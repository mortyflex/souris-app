import type { Sale } from '@/domain/sales';
import { getSaleAdjustmentPosition } from '@/domain/sales';

import {
  createAdjustmentForm,
  getAdjustmentAmounts,
  getOriginalPaymentMethods,
  getPreselectedRefundMethod,
  getRefundInstant,
  toSaleAdjustmentDraft,
  updateLineQuantity,
} from '../form';

const saleAt = new Date(2026, 9, 12, 10, 0);
const now = new Date(2026, 9, 14, 15, 30);

const sale: Sale = {
  id: 'sale-1',
  businessId: 'b',
  completedAt: saleAt,
  items: [
    { id: 'line-a', productId: 'p-a', productName: 'Shampooing', unitPrice: 0.29, quantity: 3 },
    { id: 'line-b', productId: 'p-b', productName: 'Soin', unitPrice: 18, quantity: 1 },
  ],
  payment: { paidAt: saleAt, cardAmountCents: 1000, cashAmountCents: 887 },
};
const revente: Sale = { ...sale, id: 'revente', appointmentId: 'a', payment: undefined };

describe('correction form — amount', () => {
  it('suggests units × snapshot price in exact cents until a total is typed', () => {
    const position = getSaleAdjustmentPosition(sale, []);
    let form = createAdjustmentForm('correct', sale, [], now, ['CARD']);
    form = updateLineQuantity(form, 'line-a', 3, true);
    form = updateLineQuantity(form, 'line-b', 1, true);
    expect(getAdjustmentAmounts(form, sale, position)).toMatchObject({ totalCents: 1887, cardCents: 1887, cashCents: 0, suggested: true });
    expect(getAdjustmentAmounts({ ...form, amountText: '5,5' }, sale, position)).toMatchObject({ totalCents: 550, suggested: false });
    // Correcting a wrong product never puts it back on the shelf by itself.
    expect(form.lines['line-a']).toEqual({ quantity: 3, restock: false });
  });

  it('a full refund preselects every remaining unit but restocks NONE: a refund is not a return', () => {
    const form = createAdjustmentForm('cancel', sale, [], now);
    expect(form.lines).toEqual({ 'line-a': { quantity: 3, restock: false }, 'line-b': { quantity: 1, restock: false } });
    expect(form.reason).toBe('SALE_CANCELLED');
  });

  it('starts every intent with no restock, whatever its first reason (a return, a product never handed over…)', () => {
    for (const intent of ['refund', 'correct', 'cancel'] as const) {
      let form = createAdjustmentForm(intent, sale, [], now);
      form = updateLineQuantity(form, 'line-a', 1, true);
      expect(form.lines['line-a']).toEqual({ quantity: 1, restock: false });
      for (const reason of ['RETURN', 'NOT_DELIVERED', 'WRONG_PRODUCT'] as const) {
        expect(updateLineQuantity({ ...form, reason, lines: {} }, 'line-a', 2, true).lines['line-a']!.restock).toBe(false);
      }
    }
  });

  it('keeps an explicit « Remis en stock » through quantity changes, drops it at zero or for a missing product', () => {
    let form = createAdjustmentForm('refund', sale, [], now);
    form = updateLineQuantity(form, 'line-a', 1, true);
    form = { ...form, lines: { ...form.lines, 'line-a': { quantity: 1, restock: true } } };
    expect(updateLineQuantity(form, 'line-a', 2, true).lines['line-a']).toEqual({ quantity: 2, restock: true });
    expect(updateLineQuantity(form, 'line-a', 0, true).lines['line-a']).toEqual({ quantity: 0, restock: false });
    expect(updateLineQuantity(form, 'line-a', 2, false).lines['line-a']).toEqual({ quantity: 2, restock: false });
  });

  it('dates the refund: now for today, midday otherwise, never before the Sale nor after now', () => {
    expect(getRefundInstant(new Date(2026, 9, 14), saleAt, now)).toEqual(now);
    expect(getRefundInstant(new Date(2026, 9, 13), saleAt, now)).toEqual(new Date(2026, 9, 13, 12, 0));
    expect(getRefundInstant(new Date(2026, 9, 12), new Date(2026, 9, 12, 13, 0), now)).toEqual(new Date(2026, 9, 12, 13, 0));
  });
});

describe('correction form — the refund method is never deduced in silence', () => {
  it('reads the reliable original methods: the Sale payment, or the Appointment payment and its deposits', () => {
    expect(getOriginalPaymentMethods(sale)).toEqual(['CARD', 'CASH']);
    expect(getOriginalPaymentMethods({ ...sale, payment: undefined })).toBeUndefined();
    // A Revente never reads a Sale payment: its money is the Appointment's.
    expect(getOriginalPaymentMethods(revente)).toBeUndefined();
    expect(getOriginalPaymentMethods(revente, { payment: { cardAmountCents: 0, cashAmountCents: 5500 }, activeDepositMethods: [] })).toEqual(['CASH']);
    expect(
      getOriginalPaymentMethods(revente, { payment: { cardAmountCents: 0, cashAmountCents: 5500 }, activeDepositMethods: ['CARD'] }),
    ).toEqual(['CARD', 'CASH']);
    // Fully prepaid: the deposits are the only money.
    expect(getOriginalPaymentMethods(revente, { payment: undefined, activeDepositMethods: ['CASH', 'CASH'] })).toEqual(['CASH']);
  });

  it('preselects ONLY a single reliable method; mixed or unknown must be chosen', () => {
    expect(getPreselectedRefundMethod(['CASH'])).toBe('CASH');
    expect(getPreselectedRefundMethod(['CARD', 'CASH'])).toBeUndefined();
    expect(getPreselectedRefundMethod(undefined)).toBeUndefined();
    expect(createAdjustmentForm('refund', revente, [], now).method).toBeUndefined();
    expect(createAdjustmentForm('refund', revente, [], now, ['CASH']).method).toBe('CASH');
  });

  it('money without a chosen method cannot become a valid draft', () => {
    const position = getSaleAdjustmentPosition(revente, []);
    const form = updateLineQuantity(createAdjustmentForm('refund', revente, [], now), 'line-b', 1, true);
    const amounts = getAdjustmentAmounts(form, revente, position);
    expect(amounts).toMatchObject({ totalCents: 1800, cardCents: undefined, cashCents: undefined, methodMissing: true });
    const draft = toSaleAdjustmentDraft(form, amounts, 'id', revente, now);
    expect(Number.isNaN(draft.refundCardCents)).toBe(true);
    // Without money there is no method to ask.
    expect(getAdjustmentAmounts({ ...form, amountText: '0' }, revente, position)).toMatchObject({ methodMissing: false, totalCents: 0 });
  });

  it('a mixed refund is typed explicitly, both parts', () => {
    const position = getSaleAdjustmentPosition(sale, []);
    const form = { ...createAdjustmentForm('refund', sale, [], now), method: 'MIXED' as const, cardText: '10', cashText: '' };
    expect(getAdjustmentAmounts(form, sale, position)).toMatchObject({ splitInvalid: true });
    expect(getAdjustmentAmounts({ ...form, cashText: '8,87' }, sale, position)).toMatchObject({
      totalCents: 1887,
      cardCents: 1000,
      cashCents: 887,
      splitInvalid: false,
    });
  });
});
