import type { Sale } from '@/domain/sales';

import {
  describeSaleCompletionIssue,
  formatSaleDate,
  formatSaleQuantity,
  getAppointmentSaleLines,
  getAppointmentSales,
  getAppointmentSalesTotal,
  getClientSales,
} from '../presentation';

function sale(id: string, completedAt: Date, clientId?: string): Sale {
  return { id, businessId: 'business', clientId, completedAt, items: [] };
}

describe('Sale presentation', () => {
  it('derives a Client purchase history newest first and ignores walk-in Sales', () => {
    const sales = [
      sale('sale-1', new Date(2026, 8, 1), 'client-a'),
      sale('sale-2', new Date(2026, 8, 3), 'client-a'),
      sale('sale-3', new Date(2026, 8, 2), 'client-b'),
      sale('sale-walk-in', new Date(2026, 8, 4)),
    ];

    expect(getClientSales(sales, 'client-a').map((entry) => entry.id)).toEqual(['sale-2', 'sale-1']);
    expect(getClientSales(sales, 'client-b').map((entry) => entry.id)).toEqual(['sale-3']);
    expect(getClientSales(sales, 'client-c')).toEqual([]);
    expect(sales.map((entry) => entry.id)).toEqual(['sale-1', 'sale-2', 'sale-3', 'sale-walk-in']);
  });

  it('formats dates and quantities in the compact French style', () => {
    expect(formatSaleDate(new Date(2026, 8, 11, 10))).toBe('11 sept. 2026');
    expect(formatSaleQuantity(2)).toBe('×2');
  });

  it('explains completion issues concisely', () => {
    expect(describeSaleCompletionIssue({ kind: 'EMPTY_SALE' })).toBe('Ajoutez au moins un produit.');
    expect(
      describeSaleCompletionIssue({
        kind: 'INSUFFICIENT_STOCK',
        productId: 'p',
        productName: 'Soin',
        requested: 2,
        available: 1,
      }),
    ).toBe('Stock insuffisant pour Soin : 1 en stock, 2 demandés.');
    expect(
      describeSaleCompletionIssue({ kind: 'PRODUCT_INACTIVE', productId: 'p', productName: 'Soin' }),
    ).toBe('Soin est inactif.');
    expect(describeSaleCompletionIssue({ kind: 'PRODUCT_MISSING', productId: 'p' })).toBe(
      'Un produit n’est plus disponible dans le catalogue.',
    );
    expect(
      describeSaleCompletionIssue({ kind: 'PRODUCT_MISSING', productId: 'p' }, () => 'Soin'),
    ).toBe('Soin n’est plus disponible dans le catalogue.');
    expect(
      describeSaleCompletionIssue({ kind: 'INVALID_QUANTITY', productId: 'p', quantity: 0 }, () => 'Soin'),
    ).toBe('Soin : quantité invalide.');
  });
});

describe('Appointment Product lines', () => {
  const saleA: Sale = {
    id: 'sale-a',
    businessId: 'business-a',
    clientId: 'client-a',
    appointmentId: 'appointment-1',
    completedAt: new Date(2026, 8, 11, 10),
    items: [
      { id: 'a-0', productId: 'shampoo', productName: 'Shampoo', unitPrice: 10, quantity: 2 },
    ],
  };
  const saleB: Sale = {
    ...saleA,
    id: 'sale-b',
    completedAt: new Date(2026, 8, 11, 11),
    items: [
      { id: 'b-0', productId: 'serum', productName: 'Serum', unitPrice: 15, quantity: 1 },
      { id: 'b-1', productId: 'shampoo', productName: 'Shampoo', unitPrice: 10, quantity: 1 },
    ],
  };
  const saleC: Sale = {
    ...saleA,
    id: 'sale-c',
    appointmentId: undefined,
    items: [{ id: 'c-0', productId: 'mask', productName: 'Mask', unitPrice: 50, quantity: 1 }],
  };

  it('keeps only the Sales sold during the Appointment, not other Sales of the same Client', () => {
    expect(getAppointmentSales([saleA, saleB, saleC], 'appointment-1').map((sale) => sale.id)).toEqual([
      'sale-a',
      'sale-b',
    ]);
    expect(getAppointmentSales([saleC], 'appointment-1')).toEqual([]);
  });

  it('merges identical snapshot lines across Sales and totals from snapshots only', () => {
    expect(getAppointmentSaleLines([saleA, saleB, saleC], 'appointment-1')).toEqual([
      expect.objectContaining({ productName: 'Shampoo', unitPrice: 10, quantity: 3, total: 30 }),
      expect.objectContaining({ productName: 'Serum', unitPrice: 15, quantity: 1, total: 15 }),
    ]);
    expect(getAppointmentSalesTotal([saleA, saleB, saleC], 'appointment-1')).toBe(45);
  });

  it('keeps a renamed or repriced later snapshot as its own line', () => {
    const repriced: Sale = {
      ...saleB,
      id: 'sale-d',
      items: [{ id: 'd-0', productId: 'shampoo', productName: 'Shampoo', unitPrice: 12, quantity: 1 }],
    };
    expect(getAppointmentSaleLines([saleA, repriced], 'appointment-1')).toEqual([
      expect.objectContaining({ productName: 'Shampoo', unitPrice: 10, quantity: 2 }),
      expect.objectContaining({ productName: 'Shampoo', unitPrice: 12, quantity: 1 }),
    ]);
  });
});
