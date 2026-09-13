import type { Sale } from '../types';
import { isAppointmentLinkedSale, removeAppointmentProduct } from '../deletion';

const shampoo = { productId: 'shampoo', productName: 'Shampoo', unitPrice: 10 };
const mask = { productId: 'mask', productName: 'Mask', unitPrice: 20 };

/** Sale A: Shampoo ×1 + Mask ×1. */
const saleA: Sale = {
  id: 'sale-a',
  businessId: 'business-a',
  clientId: 'client-a',
  appointmentId: 'appointment-1',
  completedAt: new Date(2026, 8, 12, 15, 0),
  items: [
    { id: 'a0', ...shampoo, quantity: 1 },
    { id: 'a1', ...mask, quantity: 1 },
  ],
};

/** Sale B: Shampoo ×1 only. */
const saleB: Sale = {
  ...saleA,
  id: 'sale-b',
  completedAt: new Date(2026, 8, 12, 15, 30),
  items: [{ id: 'b0', ...shampoo, quantity: 1 }],
};

/** Same Client, standalone (not sold during the Appointment), same Product. */
const standalone: Sale = {
  ...saleA,
  id: 'sale-standalone',
  appointmentId: undefined,
  items: [{ id: 's0', ...shampoo, quantity: 4 }],
  payment: { paidAt: new Date(), cardAmountCents: 4000, cashAmountCents: 0 },
};

/** Another Appointment, same Product. */
const otherAppointment: Sale = {
  ...saleB,
  id: 'sale-other',
  appointmentId: 'appointment-2',
};

const sales = [saleA, standalone, saleB, otherAppointment];

describe('isAppointmentLinkedSale', () => {
  it('is true only for a Sale sold during an Appointment without a payment of its own', () => {
    expect(isAppointmentLinkedSale(saleA)).toBe(true);
    expect(isAppointmentLinkedSale(standalone)).toBe(false);
    expect(isAppointmentLinkedSale({ ...saleA, appointmentId: undefined })).toBe(false);
    expect(isAppointmentLinkedSale({ ...saleA, payment: standalone.payment })).toBe(false);
  });
});

describe('removeAppointmentProduct', () => {
  it('removes every matching line across the Reventes, sums the restoration, keeps other Products', () => {
    const result = removeAppointmentProduct(sales, 'appointment-1', shampoo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removal.restoration).toEqual({ productId: 'shampoo', quantity: 2 });
    expect(result.removal.removedSaleIds).toEqual(['sale-b']);
    expect(result.removal.trimmedSaleIds).toEqual(['sale-a']);
    expect(result.removal.sales).toEqual([
      { ...saleA, items: [{ id: 'a1', ...mask, quantity: 1 }] },
      standalone,
      otherAppointment,
    ]);
  });

  it('never mutates the input Sales or their items', () => {
    const before = JSON.stringify(sales);
    removeAppointmentProduct(sales, 'appointment-1', shampoo);
    expect(JSON.stringify(sales)).toBe(before);
    expect(saleA.items).toHaveLength(2);
  });

  it('removes a Product present in only one Sale and keeps that Sale when other lines remain', () => {
    const result = removeAppointmentProduct(sales, 'appointment-1', mask);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removal.restoration).toEqual({ productId: 'mask', quantity: 1 });
    expect(result.removal.removedSaleIds).toEqual([]);
    expect(result.removal.trimmedSaleIds).toEqual(['sale-a']);
    expect(result.removal.sales.map((sale) => sale.id)).toEqual([
      'sale-a',
      'sale-standalone',
      'sale-b',
      'sale-other',
    ]);
  });

  it('matches the snapshot identity, not the name alone: a different unit price stays', () => {
    const repriced: Sale = {
      ...saleB,
      id: 'sale-repriced',
      items: [{ id: 'r0', productId: 'shampoo', productName: 'Shampoo', unitPrice: 12, quantity: 1 }],
    };
    const result = removeAppointmentProduct([saleA, saleB, repriced], 'appointment-1', shampoo);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removal.restoration.quantity).toBe(2);
    expect(result.removal.sales.map((sale) => sale.id)).toEqual(['sale-a', 'sale-repriced']);
  });

  it('refuses when nothing was sold during the Appointment for that Product', () => {
    expect(removeAppointmentProduct(sales, 'appointment-1', { ...shampoo, productId: 'serum' })).toEqual({
      ok: false,
      issue: { kind: 'PRODUCT_NOT_SOLD' },
    });
    expect(removeAppointmentProduct(sales, 'appointment-3', shampoo)).toEqual({
      ok: false,
      issue: { kind: 'PRODUCT_NOT_SOLD' },
    });
  });

  it('refuses when a matching Sale carries its own payment', () => {
    const paidLinked: Sale = { ...saleB, id: 'sale-paid', payment: standalone.payment };
    expect(removeAppointmentProduct([saleA, paidLinked], 'appointment-1', shampoo)).toEqual({
      ok: false,
      issue: { kind: 'SALE_HAS_PAYMENT', saleId: 'sale-paid' },
    });
  });
});
