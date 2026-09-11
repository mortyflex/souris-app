// Souris — Sale store
//
// Sale completion is ONE transaction: every stock decrement is revalidated
// and applied against the stored quantity (active Product, enough stock),
// then the Sale and its item snapshots are inserted. Any failure rolls the
// whole operation back. `product_id` is historical metadata with no foreign
// key: deleting a Product never changes a Sale.

import type { StockDecrement } from '@/domain/products';
import type { Sale, SaleItem } from '@/domain/sales';

import { runInTransaction, type SourisDatabase } from '../database';
import { fromSqlInstant, fromSqlOptional, toSqlInstant, toSqlOptional } from '../values';

interface SaleRow {
  readonly id: string;
  readonly business_id: string;
  readonly client_id: string | null;
  readonly completed_at: string;
}

interface SaleItemRow {
  readonly sale_id: string;
  readonly id: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly unit_price: number;
  readonly quantity: number;
}

export class SaleStockConflictError extends Error {
  constructor(readonly productId: string) {
    super(`Stock of Product "${productId}" no longer allows this Sale`);
    this.name = 'SaleStockConflictError';
  }
}

export function loadSales(db: SourisDatabase): readonly Sale[] {
  const itemsBySale = new Map<string, SaleItem[]>();
  for (const row of db.getAllSync<SaleItemRow>(
    'SELECT sale_id, id, product_id, product_name, unit_price, quantity FROM sale_items ORDER BY sale_id, position',
  )) {
    const items = itemsBySale.get(row.sale_id) ?? [];
    items.push({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      unitPrice: row.unit_price,
      quantity: row.quantity,
    });
    itemsBySale.set(row.sale_id, items);
  }

  return db
    .getAllSync<SaleRow>('SELECT id, business_id, client_id, completed_at FROM sales ORDER BY rowid')
    .map((row) => {
      const clientId = fromSqlOptional(row.client_id);
      return {
        id: row.id,
        businessId: row.business_id,
        ...(clientId !== undefined ? { clientId } : {}),
        completedAt: fromSqlInstant(row.completed_at),
        items: itemsBySale.get(row.id) ?? [],
      };
    });
}

/**
 * Applies the stock decrements and records the Sale atomically. The UPDATE
 * only matches an ACTIVE Product with enough stock, so the stored quantity
 * is the final authority even if the in-memory validation was stale.
 */
export function completeSale(
  db: SourisDatabase,
  sale: Sale,
  stockDecrements: readonly StockDecrement[],
): void {
  runInTransaction(db, () => {
    for (const decrement of stockDecrements) {
      if (!Number.isInteger(decrement.quantity) || decrement.quantity < 1) {
        throw new RangeError(`completeSale: invalid quantity for "${decrement.productId}"`);
      }
      const result = db.runSync(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND active = 1 AND stock_quantity >= ?',
        [decrement.quantity, decrement.productId, decrement.quantity],
      );
      if (result.changes !== 1) {
        throw new SaleStockConflictError(decrement.productId);
      }
    }

    db.runSync('INSERT INTO sales (id, business_id, client_id, completed_at) VALUES (?, ?, ?, ?)', [
      sale.id,
      sale.businessId,
      toSqlOptional(sale.clientId),
      toSqlInstant(sale.completedAt),
    ]);
    sale.items.forEach((item, position) => {
      db.runSync(
        'INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sale.id, item.id, position, item.productId, item.productName, item.unitPrice, item.quantity],
      );
    });
  });
}
