import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { deleteProduct, findProduct, setProductActive, updateProduct } from '../stores/products';
import {
  AppointmentProductDeleteConflictError,
  completeSale,
  countAppointmentSales,
  deleteAppointmentProduct,
  loadSales,
  SaleStockConflictError,
} from '../stores/sales';
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

describe('Appointment-linked Product deletion', () => {
  const maskIdentity = { productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50 };
  const serumIdentity = { productId: productSerum.id, productName: 'Sérum', unitPrice: 32 };

  /** Sale A: Mask ×1 + Serum ×1. Sale B: Mask ×1. Stock after both: Mask 3, Serum 0. */
  const saleA: Sale = {
    ...saleForLea,
    id: 'sale-a',
    appointmentId: 'appointment-lea',
    items: [
      { id: 'sale-a-item-0', ...maskIdentity, quantity: 1 },
      { id: 'sale-a-item-1', ...serumIdentity, quantity: 1 },
    ],
  };
  const saleB: Sale = {
    ...saleForLea,
    id: 'sale-b',
    appointmentId: 'appointment-lea',
    completedAt: new Date(2026, 8, 11, 11, 45),
    items: [{ id: 'sale-b-item-0', ...maskIdentity, quantity: 1 }],
  };

  function seedTwoReventes(db: SourisDatabase) {
    completeSale(db, saleA, [
      { productId: productMask.id, quantity: 1 },
      { productId: productSerum.id, quantity: 1 },
    ]);
    completeSale(db, saleB, [{ productId: productMask.id, quantity: 1 }]);
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(3);
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(0);
  }

  function itemCount(db: SourisDatabase, saleId?: string): number {
    return saleId
      ? (db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sale_items WHERE sale_id = ?', [saleId])
          ?.count ?? 0)
      : (db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sale_items')?.count ?? 0);
  }

  function refusal(task: () => void): string | undefined {
    try {
      task();
      return undefined;
    } catch (error) {
      return error instanceof AppointmentProductDeleteConflictError ? error.reason : 'unexpected';
    }
  }

  it('removes the aggregated Product across both Reventes, restores the summed stock, and cleans only the emptied Sale', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    seedTwoReventes(db);

    const outcome = deleteAppointmentProduct(db, 'appointment-lea', maskIdentity);

    expect(outcome).toEqual({
      restoration: { productId: productMask.id, quantity: 2 },
      removedSaleIds: ['sale-b'],
      trimmedSaleIds: ['sale-a'],
    });
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(0);
    // Sale A keeps its Serum line; Sale B is gone with its items; nothing else remains.
    const snapshot = loadSnapshot(db);
    expect(snapshot.sales).toEqual([{ ...saleA, items: [{ id: 'sale-a-item-1', ...serumIdentity, quantity: 1 }] }]);
    expect(itemCount(db)).toBe(1);
    expect(itemCount(db, 'sale-b')).toBe(0);
    expect(countAppointmentSales(db, 'appointment-lea')).toBe(1);
    expect(snapshot.products.find((product) => product.id === productMask.id)?.stockQuantity).toBe(5);
  });

  it('deletes the last Sale once its last Product is removed, so the Appointment no longer references it', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    seedTwoReventes(db);
    deleteAppointmentProduct(db, 'appointment-lea', maskIdentity);

    const outcome = deleteAppointmentProduct(db, 'appointment-lea', serumIdentity);

    expect(outcome).toEqual({
      restoration: { productId: productSerum.id, quantity: 1 },
      removedSaleIds: ['sale-a'],
      trimmedSaleIds: [],
    });
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(1);
    expect(loadSales(db)).toEqual([]);
    expect(itemCount(db)).toBe(0);
    expect(countAppointmentSales(db, 'appointment-lea')).toBe(0);
  });

  it('matches the snapshot identity: a different unit price of the same Product is untouched', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const repriced: Sale = {
      ...saleB,
      id: 'sale-repriced',
      items: [{ id: 'sale-repriced-item-0', ...maskIdentity, unitPrice: 55, quantity: 1 }],
    };
    completeSale(db, saleB, [{ productId: productMask.id, quantity: 1 }]);
    completeSale(db, repriced, [{ productId: productMask.id, quantity: 1 }]);
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(3);

    deleteAppointmentProduct(db, 'appointment-lea', maskIdentity);

    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(4);
    expect(loadSales(db)).toEqual([repriced]);
  });

  it('restores stock exactly, above any editor display limit', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ products: [{ ...productMask, stockQuantity: 40 }] }));
    completeSale(db, { ...saleB, items: [{ id: 'sale-b-item-0', ...maskIdentity, quantity: 35 }] }, [
      { productId: productMask.id, quantity: 35 },
    ]);
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(5);

    deleteAppointmentProduct(db, 'appointment-lea', maskIdentity);

    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(40);
  });

  it('refuses when nothing matches or when a matching Sale carries a payment — nothing changes', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const paidAt = new Date(2026, 8, 12, 15, 5);
    // A standalone paid Sale of the same Client and Product is never touched.
    completeSale(db, { ...saleForLea, payment: { paidAt, cardAmountCents: 10000, cashAmountCents: 0 } }, [
      { productId: productMask.id, quantity: 2 },
    ]);
    // A linked Sale that somehow carries a payment blocks the whole deletion.
    completeSale(
      db,
      { ...saleB, id: 'sale-paid-linked', payment: { paidAt, cardAmountCents: 5000, cashAmountCents: 0 } },
      [{ productId: productMask.id, quantity: 1 }],
    );
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(2);

    expect(refusal(() => deleteAppointmentProduct(db, 'appointment-lea', serumIdentity))).toBe('PRODUCT_NOT_SOLD');
    expect(refusal(() => deleteAppointmentProduct(db, 'appointment-unknown', maskIdentity))).toBe(
      'PRODUCT_NOT_SOLD',
    );
    expect(refusal(() => deleteAppointmentProduct(db, 'appointment-lea', maskIdentity))).toBe('SALE_HAS_PAYMENT');

    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(2);
    expect(loadSales(db).map((sale) => sale.id)).toEqual(['sale-1', 'sale-paid-linked']);
    expect(itemCount(db)).toBe(2);
  });

  it('aborts when the Product no longer exists: stock untouched, every line and Sale kept', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    seedTwoReventes(db);
    deleteProduct(db, productMask.id);

    expect(refusal(() => deleteAppointmentProduct(db, 'appointment-lea', maskIdentity))).toBe('PRODUCT_MISSING');

    expect(loadSales(db)).toEqual([saleA, saleB]);
    expect(itemCount(db)).toBe(3);
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(0);
  });

  it('rolls the stock restoration back when a later write of the transaction fails', () => {
    const native = openTestDatabase();
    const db: SourisDatabase = {
      ...native,
      runSync: (sql, params) => {
        if (sql.startsWith('DELETE FROM sales')) throw new Error('disk full');
        return native.runSync(sql, params);
      },
    };
    bootstrapPersistence(db, createTestSeed);
    seedTwoReventes(db);

    expect(() => deleteAppointmentProduct(db, 'appointment-lea', maskIdentity)).toThrow('disk full');

    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(3);
    expect(loadSales(db)).toEqual([saleA, saleB]);
    expect(itemCount(db)).toBe(3);
  });
});
