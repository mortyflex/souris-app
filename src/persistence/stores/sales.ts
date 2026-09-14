// Souris — Sale store
//
// Sale completion is ONE transaction: every stock decrement is revalidated
// and applied against the stored quantity (active Product, enough stock),
// then the Sale and its item snapshots are inserted. Any failure rolls the
// whole operation back. `product_id` is historical metadata with no foreign
// key: deleting a Product never changes a Sale.
//
// Removing a Product sold during an Appointment is the inverse, also ONE
// transaction: every matching item snapshot of the Sales linked to that
// Appointment is located and re-verified (no Sale payment), the summed
// quantity is given back to the Product, the matching items are deleted,
// and a parent Sale is deleted only once it holds no item any more. A
// Product that no longer exists aborts the whole operation — no line is
// removed while its stock cannot be restored.
//
// Sync outbox (Cloud Sync V1B), within the same transactions: completion
// marks the SALE (UPSERT) and every decremented PRODUCT (UPSERT); removal
// marks the restored PRODUCT (UPSERT), each trimmed SALE (UPSERT — its
// item set changed) and each emptied SALE (DELETE). Sale lines never sync
// on their own.

import type { AppointmentProductIdentity } from '@/domain/appointments';
import type { StockDecrement, StockRestoration } from '@/domain/products';
import type { Sale, SaleItem, SalePayment } from '@/domain/sales';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import {
  fromSqlInstant,
  fromSqlOptional,
  fromSqlPaymentColumns,
  toSqlInstant,
  toSqlOptional,
  toSqlPaymentColumns,
} from '../values';

interface SaleRow {
  readonly id: string;
  readonly business_id: string;
  readonly client_id: string | null;
  readonly appointment_id: string | null;
  readonly completed_at: string;
  readonly paid_at: string | null;
  readonly card_amount_cents: number | null;
  readonly cash_amount_cents: number | null;
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

export type AppointmentProductDeleteRefusal =
  /** No Sale sold during the Appointment holds this Product snapshot. */
  | 'PRODUCT_NOT_SOLD'
  /** A matching Sale carries its own recorded payment; nothing of it is touched. */
  | 'SALE_HAS_PAYMENT'
  /** The Product no longer exists, so its stock cannot be restored; every line is kept. */
  | 'PRODUCT_MISSING';

/** The stored rows refuse this deletion; nothing was written. */
export class AppointmentProductDeleteConflictError extends Error {
  constructor(
    readonly appointmentId: string,
    readonly productId: string,
    readonly reason: AppointmentProductDeleteRefusal,
  ) {
    super(
      `Product "${productId}" sold during Appointment "${appointmentId}" cannot be removed (${reason})`,
    );
    this.name = 'AppointmentProductDeleteConflictError';
  }
}

/** What one Appointment-linked Product deletion committed. */
export interface AppointmentProductDeletionOutcome {
  readonly restoration: StockRestoration;
  /** Sales that held only the removed Product and were deleted. */
  readonly removedSaleIds: readonly string[];
  /** Sales that lost the Product but keep other lines. */
  readonly trimmedSaleIds: readonly string[];
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
    .getAllSync<SaleRow>(
      'SELECT id, business_id, client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents FROM sales ORDER BY rowid',
    )
    .map((row) => {
      const clientId = fromSqlOptional(row.client_id);
      const appointmentId = fromSqlOptional(row.appointment_id);
      const payment: SalePayment | undefined = fromSqlPaymentColumns(row);
      return {
        id: row.id,
        businessId: row.business_id,
        ...(clientId !== undefined ? { clientId } : {}),
        ...(appointmentId !== undefined ? { appointmentId } : {}),
        completedAt: fromSqlInstant(row.completed_at),
        items: itemsBySale.get(row.id) ?? [],
        ...(payment ? { payment } : {}),
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
      markAggregateUpserted(db, 'PRODUCT', decrement.productId);
    }

    db.runSync(
      'INSERT INTO sales (id, business_id, client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        sale.id,
        sale.businessId,
        toSqlOptional(sale.clientId),
        toSqlOptional(sale.appointmentId),
        toSqlInstant(sale.completedAt),
        ...toSqlPaymentColumns(sale.payment),
      ],
    );
    sale.items.forEach((item, position) => {
      db.runSync(
        'INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sale.id, item.id, position, item.productId, item.productName, item.unitPrice, item.quantity],
      );
    });
    markAggregateUpserted(db, 'SALE', sale.id);
  });
}

/**
 * Removes ONE displayed Product row of an Appointment — every matching item
 * snapshot across the Sales sold during it — and restores the summed
 * quantity, in ONE transaction:
 *
 *   SELECT the matching items (appointment_id + product_id + product_name + unit_price)
 *     → none ⇒ PRODUCT_NOT_SOLD; a paid parent Sale ⇒ SALE_HAS_PAYMENT
 *   UPDATE products SET stock_quantity = stock_quantity + Σ quantity
 *     → 0 rows changed ⇒ PRODUCT_MISSING
 *   DELETE the matching sale_items only
 *   DELETE each parent Sale left without any item; keep the others
 *
 * Any failure rolls everything back: no stock change, no line removed, no
 * Sale deleted. Returns what was committed so the caller can reflect it in
 * memory.
 */
export function deleteAppointmentProduct(
  db: SourisDatabase,
  appointmentId: string,
  identity: AppointmentProductIdentity,
): AppointmentProductDeletionOutcome {
  const { productId, productName, unitPrice } = identity;
  const refuse = (reason: AppointmentProductDeleteRefusal) =>
    new AppointmentProductDeleteConflictError(appointmentId, productId, reason);

  let outcome: AppointmentProductDeletionOutcome | undefined;
  runInTransaction(db, () => {
    const rows = db.getAllSync<{ sale_id: string; quantity: number; paid_at: string | null }>(
      'SELECT si.sale_id, si.quantity, s.paid_at FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.appointment_id = ? AND si.product_id = ? AND si.product_name = ? AND si.unit_price = ? ORDER BY s.rowid, si.position',
      [appointmentId, productId, productName, unitPrice],
    );
    if (rows.length === 0) throw refuse('PRODUCT_NOT_SOLD');
    if (rows.some((row) => row.paid_at !== null)) throw refuse('SALE_HAS_PAYMENT');

    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new RangeError(`deleteAppointmentProduct: invalid stored quantity for "${productId}"`);
    }
    const restored = db.runSync(
      'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
      [quantity, productId],
    );
    if (restored.changes !== 1) throw refuse('PRODUCT_MISSING');
    markAggregateUpserted(db, 'PRODUCT', productId);

    const saleIds = [...new Set(rows.map((row) => row.sale_id))];
    const removedSaleIds: string[] = [];
    const trimmedSaleIds: string[] = [];
    for (const saleId of saleIds) {
      db.runSync(
        'DELETE FROM sale_items WHERE sale_id = ? AND product_id = ? AND product_name = ? AND unit_price = ?',
        [saleId, productId, productName, unitPrice],
      );
      const remaining =
        db.getFirstSync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM sale_items WHERE sale_id = ?',
          [saleId],
        )?.count ?? 0;
      if (remaining === 0) {
        db.runSync('DELETE FROM sales WHERE id = ?', [saleId]);
        markAggregateDeleted(db, 'SALE', saleId);
        removedSaleIds.push(saleId);
      } else {
        markAggregateUpserted(db, 'SALE', saleId);
        trimmedSaleIds.push(saleId);
      }
    }

    outcome = { restoration: { productId, quantity }, removedSaleIds, trimmedSaleIds };
  });

  if (!outcome) throw new Error('deleteAppointmentProduct: transaction produced no outcome');
  return outcome;
}

/** Number of Sales sold during the Appointment (« Revente »). Deletion guard input. */
export function countAppointmentSales(db: SourisDatabase, appointmentId: string): number {
  return (
    db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sales WHERE appointment_id = ?', [
      appointmentId,
    ])?.count ?? 0
  );
}
