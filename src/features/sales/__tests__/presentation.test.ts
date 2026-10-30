import type { Sale } from '@/domain/sales';

import {
  SALE_PAID_WITH_APPOINTMENT_SHORT,
  SALE_PAYMENT_UNKNOWN_SHORT,
  describeSaleCompletionIssue,
  formatSaleCount,
  formatSaleDate,
  formatSaleDateTime,
  formatSaleHistoryEmptyTitle,
  formatSalePaymentMethods,
  formatSalePaymentRecordShort,
  formatSaleQuantity,
  formatSaleQuantitySummary,
  formatSaleSummary,
  formatSaleUnitCount,
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

  it('counts draft units with French pluralisation (0 and 1 are singular)', () => {
    expect(formatSaleUnitCount(0)).toBe('0 produit');
    expect(formatSaleUnitCount(1)).toBe('1 produit');
    expect(formatSaleUnitCount(3)).toBe('3 produits');
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

describe('Sale history summary', () => {
  function item(productName: string, quantity: number) {
    return { id: productName, productId: productName, productName, unitPrice: 10, quantity };
  }

  it('names the products of a Sale from its snapshots, compacting beyond two', () => {
    expect(formatSaleSummary({ items: [item('Shampooing', 1)] })).toBe('Shampooing');
    expect(formatSaleSummary({ items: [item('Shampooing', 1), item('Soin', 2)] })).toBe(
      'Shampooing + Soin',
    );
    expect(
      formatSaleSummary({ items: [item('A', 1), item('B', 1), item('C', 1), item('D', 1)] }),
    ).toBe('A + B + 2 autres');
    expect(formatSaleSummary({ items: [item('A', 1), item('B', 1), item('C', 1)] })).toBe(
      'A + B + 1 autre',
    );
  });

  it('shows the quantity of a single line, the unit count of several lines', () => {
    expect(formatSaleQuantitySummary({ items: [item('Soin', 2)] })).toBe('×2');
    expect(formatSaleQuantitySummary({ items: [item('Shampooing', 1), item('Soin', 2)] })).toBe(
      '3 produits',
    );
  });
});

describe('Sale history presentation', () => {
  const direct: Sale = {
    id: 'sale-direct',
    businessId: 'business',
    clientId: 'client-a',
    completedAt: new Date(2026, 9, 12, 14, 5),
    items: [],
    payment: { paidAt: new Date(2026, 9, 12, 14, 5), cardAmountCents: 1000, cashAmountCents: 1500 },
  };

  it('counts sales with French pluralisation', () => {
    expect(formatSaleCount(0)).toBe('Aucune vente');
    expect(formatSaleCount(1)).toBe('1 vente');
    expect(formatSaleCount(3)).toBe('3 ventes');
  });

  it('names how a recorded payment was received, and never invents one', () => {
    expect(formatSalePaymentMethods({ cardAmountCents: 1000, cashAmountCents: 1500 })).toBe('Carte + Espèces');
    expect(formatSalePaymentMethods({ cardAmountCents: 0, cashAmountCents: 1500 })).toBe('Espèces');
    expect(formatSalePaymentMethods({ cardAmountCents: 0, cashAmountCents: 0 })).toBe('');
    expect(formatSalePaymentRecordShort({ paymentRecord: 'SALE_PAYMENT', sale: direct })).toBe('Carte + Espèces');
    expect(
      formatSalePaymentRecordShort({
        paymentRecord: 'APPOINTMENT_CHECKOUT',
        sale: { ...direct, appointmentId: 'a', payment: undefined },
      }),
    ).toBe(SALE_PAID_WITH_APPOINTMENT_SHORT);
    expect(formatSalePaymentRecordShort({ paymentRecord: 'NONE', sale: { ...direct, payment: undefined } })).toBe(
      SALE_PAYMENT_UNKNOWN_SHORT,
    );
  });

  it('words the empty history for the selected period', () => {
    expect(formatSaleHistoryEmptyTitle('day', true)).toBe('Aucune vente aujourd’hui');
    expect(formatSaleHistoryEmptyTitle('day', false)).toBe('Aucune vente ce jour');
    expect(formatSaleHistoryEmptyTitle('month', true)).toBe('Aucune vente ce mois-ci');
    expect(formatSaleHistoryEmptyTitle('month', false)).toBe('Aucune vente ce mois');
  });

  it('writes the validation instant in full French, capitalised', () => {
    expect(formatSaleDateTime(new Date(2026, 9, 12, 14, 5))).toBe('Lundi 12 octobre 2026 à 14:05');
  });
});
