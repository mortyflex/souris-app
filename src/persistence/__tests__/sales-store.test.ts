import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import { deleteProduct, findProduct, setProductActive, updateProduct } from '../stores/products';
import { completeSale, loadSales, SaleStockConflictError } from '../stores/sales';
import { clientLea, createTestSeed, productMask, productSerum } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const saleForLea: Sale = {
  id: 'sale-1',
  businessId: 'business-test',
  clientId: clientLea.id,
  completedAt: new Date(2026, 8, 11, 11, 15),
  items: [
    { id: 'sale-1-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 2 },
  ],
};

describe('Sale store', () => {
  it('completes a Sale and decrements stock in one transaction that survives a restart', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    completeSale(db, saleForLea, [{ productId: productMask.id, quantity: 2 }]);

    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(3);
    const snapshot = loadSnapshot(db);
    expect(snapshot.products.find((product) => product.id === productMask.id)?.stockQuantity).toBe(3);
    expect(snapshot.sales).toEqual([saleForLea]);
    expect(snapshot.sales[0]?.completedAt.getTime()).toBe(saleForLea.completedAt.getTime());
  });

  it('lets the Client purchase history derive from persisted Sales', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const walkIn: Sale = { ...saleForLea, id: 'sale-walk-in', clientId: undefined, items: [
      { id: 'sale-walk-in-item-0', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
    ] };
    completeSale(db, saleForLea, [{ productId: productMask.id, quantity: 2 }]);
    completeSale(db, walkIn, [{ productId: productSerum.id, quantity: 1 }]);

    const sales = loadSales(db);
    expect(sales.filter((sale) => sale.clientId === clientLea.id).map((sale) => sale.id)).toEqual(['sale-1']);
    expect(Object.keys(sales[1] ?? {})).not.toContain('clientId');
  });

  it('keeps the Sale snapshot when the Product is renamed or deleted', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    completeSale(db, saleForLea, [{ productId: productMask.id, quantity: 2 }]);

    updateProduct(db, { ...productMask, name: 'Nouveau nom', price: 70, stockQuantity: 3 });
    expect(loadSales(db)[0]?.items[0]).toMatchObject({ productName: 'Masque réparateur', unitPrice: 50 });

    deleteProduct(db, productMask.id);
    expect(loadSales(db)).toEqual([saleForLea]);
  });

  it('rolls everything back when stock is insufficient for any line', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const twoProducts: Sale = {
      ...saleForLea,
      items: [
        ...saleForLea.items,
        { id: 'sale-1-item-1', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 2 },
      ],
    };

    expect(() =>
      completeSale(db, twoProducts, [
        { productId: productMask.id, quantity: 2 },
        { productId: productSerum.id, quantity: 2 },
      ]),
    ).toThrow(SaleStockConflictError);

    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(1);
    expect(loadSales(db)).toEqual([]);
    expect(db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sale_items')?.count).toBe(0);
  });

  it('refuses an inactive Product even when stock would allow it', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    setProductActive(db, productMask.id, false);

    expect(() => completeSale(db, saleForLea, [{ productId: productMask.id, quantity: 1 }])).toThrow(
      SaleStockConflictError,
    );
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);
    expect(loadSales(db)).toEqual([]);
  });
});

describe('Sale payment', () => {
  const paidAt = new Date(2026, 8, 12, 15, 5, 30, 250);

  it.each([
    ['card only', { cardAmountCents: 10000, cashAmountCents: 0 }],
    ['cash only', { cardAmountCents: 0, cashAmountCents: 10000 }],
    ['mixed', { cardAmountCents: 7500, cashAmountCents: 2500 }],
  ])('persists a standalone Sale payment (%s) with exact cents across a restart', (_label, amounts) => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    completeSale(db, { ...saleForLea, payment: { paidAt, ...amounts } }, [{ productId: productMask.id, quantity: 2 }]);

    const [reloaded] = loadSnapshot(db).sales;
    expect(reloaded?.payment).toEqual({ paidAt, ...amounts });
    expect(reloaded?.payment?.paidAt.getTime()).toBe(paidAt.getTime());
    expect(
      db.getFirstSync<{ paid_at: string; card_amount_cents: number; cash_amount_cents: number }>(
        "SELECT paid_at, card_amount_cents, cash_amount_cents FROM sales WHERE id = 'sale-1'",
      ),
    ).toEqual({ paid_at: paidAt.toISOString(), ...{ card_amount_cents: amounts.cardAmountCents, cash_amount_cents: amounts.cashAmountCents } });
  });

  it('keeps Sales without payment (historical, Appointment-linked) at NULL and hydrates no payment', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    completeSale(db, { ...saleForLea, appointmentId: 'appointment-lea' }, [{ productId: productMask.id, quantity: 2 }]);

    const [reloaded] = loadSales(db);
    expect('payment' in (reloaded ?? {})).toBe(false);
    expect(
      db.getFirstSync<{ paid_at: string | null }>("SELECT paid_at FROM sales WHERE id = 'sale-1'"),
    ).toEqual({ paid_at: null });
  });

  it('rejects invalid cents before writing anything', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);

    expect(() =>
      completeSale(db, { ...saleForLea, payment: { paidAt, cardAmountCents: -1, cashAmountCents: 0 } }, [
        { productId: productMask.id, quantity: 2 },
      ]),
    ).toThrow(RangeError);
    expect(loadSales(db)).toEqual([]);
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);
  });
});
