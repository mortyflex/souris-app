import type { Sale } from '@/domain/sales';

import {
  describeSaleCompletionIssue,
  formatSaleDate,
  formatSaleQuantity,
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
