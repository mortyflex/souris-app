// BeautIzzy — Sale adjustment store (corrections and refunds, schema v18)
//
// A completed Sale is never rewritten. Every write here is ONE transaction
// that re-reads the stored facts and asks the domain rules again before it
// writes anything — the in-memory session may be stale (another write, a
// pull), the stored rows are the authority:
//
//   record    the stored Sale, its stored adjustments and, for a Sale sold
//             during an Appointment, whether that Appointment is settled;
//             the same id twice (a double tap, a retried call) is refused,
//             never duplicated; the restocked units go back to their Product
//             (a Product that no longer exists aborts everything)
//   settle    PENDING → SETTLED only
//   void      PENDING → VOIDED; SETTLED → VOIDED only for a record the remote
//             refused and never acknowledged; its restocked units leave the
//             stock again (refused when the stock no longer holds them)
//   reverse   ONE compensating record for a SETTLED refund — « saisie
//             erronée » (never paid) or « argent rendu » (paid, then returned);
//             its restocked units leave the stock again
//
// Sync outbox, within the same transactions: SALE_ADJUSTMENT (UPSERT) and
// every PRODUCT whose stock moved. Nothing here touches a Sale row, a Sale
// line, an Appointment or its payment. A record is never deleted.

import {
  createSaleAdjustment,
  prepareSaleAdjustmentReversal,
  settleSaleAdjustment,
  validateSaleAdjustmentDraft,
  voidSaleAdjustment,
  type Sale,
  type SaleAdjustment,
  type SaleAdjustmentDraft,
  type SaleAdjustmentIssue,
  type SaleAdjustmentItem,
  type SaleAdjustmentReason,
  type SaleAdjustmentReversalInput,
  type SaleAdjustmentStatus,
  type SaleAdjustmentStockChange,
  type SaleAdjustmentTransitionIssue,
} from '@/domain/sales';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateUpserted } from '../sync/outbox';
import { isSaleAdjustmentServerRefused } from '../sync/sale-adjustment-sync';
import { fromSqlInstant, fromSqlOptional, toSqlInstant, toSqlOptional } from '../values';
import { isStoredAppointmentSettled } from './appointment-deposits';
import { findSale } from './sales';

interface SaleAdjustmentRow {
  readonly id: string;
  readonly business_id: string;
  readonly sale_id: string;
  readonly kind: 'REFUND' | 'REVERSAL';
  readonly reverses_adjustment_id: string | null;
  readonly reason: SaleAdjustmentReason;
  readonly note: string | null;
  readonly staff_member_id: string;
  readonly refund_card_cents: number;
  readonly refund_cash_cents: number;
  readonly initial_status: 'PENDING' | 'SETTLED';
  readonly status: SaleAdjustmentStatus;
  readonly refunded_at: string | null;
  readonly settled_at: string | null;
  readonly voided_at: string | null;
  readonly recorded_at: string;
}

interface SaleAdjustmentItemRow {
  readonly adjustment_id: string;
  readonly id: string;
  readonly sale_item_id: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly unit_price_cents: number;
  readonly quantity: number;
  readonly restock: number;
}

const SELECT_ADJUSTMENT =
  'SELECT id, business_id, sale_id, kind, reverses_adjustment_id, reason, note, staff_member_id, refund_card_cents, refund_cash_cents, initial_status, status, refunded_at, settled_at, voided_at, recorded_at FROM sale_adjustments';
const SELECT_ITEM =
  'SELECT adjustment_id, id, sale_item_id, product_id, product_name, unit_price_cents, quantity, restock FROM sale_adjustment_items';

function toItem(row: SaleAdjustmentItemRow): SaleAdjustmentItem {
  return {
    id: row.id,
    saleItemId: row.sale_item_id,
    productId: row.product_id,
    productName: row.product_name,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    restock: row.restock === 1,
  };
}

function toAdjustment(row: SaleAdjustmentRow, items: readonly SaleAdjustmentItem[]): SaleAdjustment {
  const reversesAdjustmentId = fromSqlOptional(row.reverses_adjustment_id);
  const note = fromSqlOptional(row.note);
  return {
    id: row.id,
    businessId: row.business_id,
    saleId: row.sale_id,
    kind: row.kind,
    ...(reversesAdjustmentId !== undefined ? { reversesAdjustmentId } : {}),
    reason: row.reason,
    ...(note !== undefined ? { note } : {}),
    staffMemberId: row.staff_member_id,
    items,
    refundCardCents: row.refund_card_cents,
    refundCashCents: row.refund_cash_cents,
    initialStatus: row.initial_status,
    status: row.status,
    ...(row.refunded_at !== null ? { refundedAt: fromSqlInstant(row.refunded_at) } : {}),
    ...(row.settled_at !== null ? { settledAt: fromSqlInstant(row.settled_at) } : {}),
    ...(row.voided_at !== null ? { voidedAt: fromSqlInstant(row.voided_at) } : {}),
    recordedAt: fromSqlInstant(row.recorded_at),
  };
}

function itemsByAdjustment(rows: readonly SaleAdjustmentItemRow[]): Map<string, SaleAdjustmentItem[]> {
  const grouped = new Map<string, SaleAdjustmentItem[]>();
  for (const row of rows) {
    const items = grouped.get(row.adjustment_id) ?? [];
    items.push(toItem(row));
    grouped.set(row.adjustment_id, items);
  }
  return grouped;
}

export function loadSaleAdjustments(db: SourisDatabase): readonly SaleAdjustment[] {
  const items = itemsByAdjustment(db.getAllSync<SaleAdjustmentItemRow>(`${SELECT_ITEM} ORDER BY adjustment_id, position`));
  return db
    .getAllSync<SaleAdjustmentRow>(`${SELECT_ADJUSTMENT} ORDER BY rowid`)
    .map((row) => toAdjustment(row, items.get(row.id) ?? []));
}

/** The stored adjustments of ONE Sale, in recording order. */
export function loadSaleAdjustmentsOfSale(db: SourisDatabase, saleId: string): readonly SaleAdjustment[] {
  const rows = db.getAllSync<SaleAdjustmentRow>(`${SELECT_ADJUSTMENT} WHERE sale_id = ? ORDER BY rowid`, [saleId]);
  if (rows.length === 0) return [];
  const items = itemsByAdjustment(
    db.getAllSync<SaleAdjustmentItemRow>(
      `${SELECT_ITEM} WHERE adjustment_id IN (SELECT id FROM sale_adjustments WHERE sale_id = ?) ORDER BY adjustment_id, position`,
      [saleId],
    ),
  );
  return rows.map((row) => toAdjustment(row, items.get(row.id) ?? []));
}

/** Number of adjustments recorded for a Sale (VOIDED included) — the Sale removal guard input. */
export function countSaleAdjustments(db: SourisDatabase, saleId: string): number {
  return (
    db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sale_adjustments WHERE sale_id = ?', [saleId])
      ?.count ?? 0
  );
}

function findAdjustment(db: SourisDatabase, adjustmentId: string): SaleAdjustment | undefined {
  const row = db.getFirstSync<SaleAdjustmentRow>(`${SELECT_ADJUSTMENT} WHERE id = ?`, [adjustmentId]);
  if (!row) return undefined;
  const items = db
    .getAllSync<SaleAdjustmentItemRow>(`${SELECT_ITEM} WHERE adjustment_id = ? ORDER BY position`, [adjustmentId])
    .map(toItem);
  return toAdjustment(row, items);
}

export type SaleAdjustmentStoreRefusal =
  | 'SALE_NOT_FOUND'
  | 'DUPLICATE_ADJUSTMENT'
  | 'ADJUSTMENT_NOT_FOUND'
  | 'PRODUCT_MISSING'
  | 'STOCK_INSUFFICIENT'
  | SaleAdjustmentTransitionIssue;

/** The stored rows refuse this write; nothing was written. */
export class SaleAdjustmentConflictError extends Error {
  constructor(
    readonly adjustmentId: string,
    readonly reason: SaleAdjustmentStoreRefusal,
    readonly productId?: string,
  ) {
    super(`Sale adjustment "${adjustmentId}" refused (${reason})`);
    this.name = 'SaleAdjustmentConflictError';
  }
}

/** The stored Sale refuses the draft (ceilings, units, eligibility); nothing was written. */
export class SaleAdjustmentDraftError extends Error {
  constructor(
    readonly adjustmentId: string,
    readonly issues: readonly SaleAdjustmentIssue[],
  ) {
    super(`Sale adjustment "${adjustmentId}" refused: ${issues.map((issue) => issue.kind).join(', ')}`);
    this.name = 'SaleAdjustmentDraftError';
  }
}

function insertAdjustment(db: SourisDatabase, adjustment: SaleAdjustment): void {
  const optionalInstant = (value: Date | undefined) => (value ? toSqlInstant(value) : null);
  db.runSync(
    'INSERT INTO sale_adjustments (id, business_id, sale_id, kind, reverses_adjustment_id, reason, note, staff_member_id, refund_card_cents, refund_cash_cents, initial_status, status, refunded_at, settled_at, voided_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      adjustment.id,
      adjustment.businessId,
      adjustment.saleId,
      adjustment.kind,
      toSqlOptional(adjustment.reversesAdjustmentId),
      adjustment.reason,
      toSqlOptional(adjustment.note),
      adjustment.staffMemberId,
      adjustment.refundCardCents,
      adjustment.refundCashCents,
      adjustment.initialStatus,
      adjustment.status,
      optionalInstant(adjustment.refundedAt),
      optionalInstant(adjustment.settledAt),
      optionalInstant(adjustment.voidedAt),
      toSqlInstant(adjustment.recordedAt),
    ],
  );
  adjustment.items.forEach((item, position) => {
    db.runSync(
      'INSERT INTO sale_adjustment_items (adjustment_id, id, position, sale_item_id, product_id, product_name, unit_price_cents, quantity, restock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        adjustment.id,
        item.id,
        position,
        item.saleItemId,
        item.productId,
        item.productName,
        item.unitPriceCents,
        item.quantity,
        item.restock ? 1 : 0,
      ],
    );
  });
  markAggregateUpserted(db, 'SALE_ADJUSTMENT', adjustment.id);
}

function updateStatus(db: SourisDatabase, adjustment: SaleAdjustment, expected: SaleAdjustmentStatus): void {
  const optionalInstant = (value: Date | undefined) => (value ? toSqlInstant(value) : null);
  const result = db.runSync(
    'UPDATE sale_adjustments SET status = ?, refunded_at = ?, settled_at = ?, voided_at = ? WHERE id = ? AND status = ?',
    [
      adjustment.status,
      optionalInstant(adjustment.refundedAt),
      optionalInstant(adjustment.settledAt),
      optionalInstant(adjustment.voidedAt),
      adjustment.id,
      expected,
    ],
  );
  if (result.changes !== 1) throw new SaleAdjustmentConflictError(adjustment.id, 'NOT_PENDING');
  markAggregateUpserted(db, 'SALE_ADJUSTMENT', adjustment.id);
}

function restoreStock(db: SourisDatabase, adjustmentId: string, changes: readonly SaleAdjustmentStockChange[]): void {
  for (const change of changes) {
    const result = db.runSync('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [
      change.quantity,
      change.productId,
    ]);
    if (result.changes !== 1) throw new SaleAdjustmentConflictError(adjustmentId, 'PRODUCT_MISSING', change.productId);
    markAggregateUpserted(db, 'PRODUCT', change.productId);
  }
}

/**
 * Takes restocked units back. A Product that no longer exists has nothing to
 * give back (skipped); one whose stock no longer holds the units refuses the
 * whole write — stock never goes negative, nothing is clamped.
 */
function takeBackStock(db: SourisDatabase, adjustmentId: string, changes: readonly SaleAdjustmentStockChange[]): void {
  for (const change of changes) {
    const result = db.runSync(
      'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
      [change.quantity, change.productId, change.quantity],
    );
    if (result.changes === 1) {
      markAggregateUpserted(db, 'PRODUCT', change.productId);
      continue;
    }
    const exists = db.getFirstSync('SELECT 1 AS found FROM products WHERE id = ?', [change.productId]);
    if (exists) throw new SaleAdjustmentConflictError(adjustmentId, 'STOCK_INSUFFICIENT', change.productId);
  }
}

function productExists(db: SourisDatabase) {
  return (productId: string) =>
    db.getFirstSync('SELECT 1 AS found FROM products WHERE id = ?', [productId]) !== null;
}

export interface RecordedSaleAdjustment {
  readonly adjustment: SaleAdjustment;
  readonly restorations: readonly SaleAdjustmentStockChange[];
}

/**
 * Records a NEW refund / correction in ONE transaction. The draft is checked
 * again against the STORED Sale and adjustments (`validateSaleAdjustmentDraft`);
 * the record is the one the caller prepared, re-validated for its shape.
 */
export function recordSaleAdjustment(
  db: SourisDatabase,
  draft: SaleAdjustmentDraft,
  adjustment: SaleAdjustment,
  restorations: readonly SaleAdjustmentStockChange[],
  now: Date,
): RecordedSaleAdjustment {
  const valid = createSaleAdjustment(adjustment);
  if (valid.id !== draft.id || valid.kind !== 'REFUND') {
    throw new SaleAdjustmentConflictError(valid.id, 'NOT_A_REFUND');
  }
  runInTransaction(db, () => {
    if (db.getFirstSync('SELECT 1 AS found FROM sale_adjustments WHERE id = ?', [valid.id])) {
      throw new SaleAdjustmentConflictError(valid.id, 'DUPLICATE_ADJUSTMENT');
    }
    const sale = findSale(db, valid.saleId);
    if (!sale) throw new SaleAdjustmentConflictError(valid.id, 'SALE_NOT_FOUND');
    const issues = validateSaleAdjustmentDraft(storedContext(db, sale, now), draft);
    if (issues.length > 0) throw new SaleAdjustmentDraftError(valid.id, issues);
    restoreStock(db, valid.id, restorations);
    insertAdjustment(db, valid);
  });
  return { adjustment: valid, restorations };
}

function storedContext(db: SourisDatabase, sale: Sale, now: Date) {
  return {
    sale,
    adjustments: loadSaleAdjustmentsOfSale(db, sale.id),
    appointmentSettled: sale.appointmentId === undefined ? true : isStoredAppointmentSettled(db, sale.appointmentId),
    productExists: productExists(db),
    now,
  };
}

/** PENDING → SETTLED in ONE transaction, on the stored row. */
export function settleStoredSaleAdjustment(
  db: SourisDatabase,
  adjustmentId: string,
  refundedAt: Date,
  now: Date,
): SaleAdjustment {
  let settled: SaleAdjustment | undefined;
  runInTransaction(db, () => {
    const stored = findAdjustment(db, adjustmentId);
    if (!stored) throw new SaleAdjustmentConflictError(adjustmentId, 'ADJUSTMENT_NOT_FOUND');
    const sale = findSale(db, stored.saleId);
    if (!sale) throw new SaleAdjustmentConflictError(adjustmentId, 'SALE_NOT_FOUND');
    const result = settleSaleAdjustment(stored, sale, refundedAt, now);
    if (!result.ok) throw new SaleAdjustmentConflictError(adjustmentId, result.issue);
    updateStatus(db, result.adjustment, 'PENDING');
    settled = result.adjustment;
  });
  if (!settled) throw new Error('settleStoredSaleAdjustment: transaction produced no record');
  return settled;
}

export interface VoidedSaleAdjustment {
  readonly adjustment: SaleAdjustment;
  readonly stockDecrements: readonly SaleAdjustmentStockChange[];
}

/** « Annuler cette saisie » in ONE transaction (see the header for SETTLED). */
export function voidStoredSaleAdjustment(db: SourisDatabase, adjustmentId: string, now: Date): VoidedSaleAdjustment {
  let outcome: VoidedSaleAdjustment | undefined;
  runInTransaction(db, () => {
    const stored = findAdjustment(db, adjustmentId);
    if (!stored) throw new SaleAdjustmentConflictError(adjustmentId, 'ADJUSTMENT_NOT_FOUND');
    const result = voidSaleAdjustment(stored, now, {
      serverRefused: stored.status === 'SETTLED' && isSaleAdjustmentServerRefused(db, adjustmentId),
    });
    if (!result.ok) throw new SaleAdjustmentConflictError(adjustmentId, result.issue);
    takeBackStock(db, adjustmentId, result.stockDecrements);
    updateStatus(db, result.adjustment, stored.status);
    outcome = { adjustment: result.adjustment, stockDecrements: result.stockDecrements };
  });
  if (!outcome) throw new Error('voidStoredSaleAdjustment: transaction produced no record');
  return outcome;
}

/** The compensating record of a SETTLED refund, in ONE transaction. */
export function reverseStoredSaleAdjustment(
  db: SourisDatabase,
  targetId: string,
  input: SaleAdjustmentReversalInput,
): VoidedSaleAdjustment {
  let outcome: VoidedSaleAdjustment | undefined;
  runInTransaction(db, () => {
    if (db.getFirstSync('SELECT 1 AS found FROM sale_adjustments WHERE id = ?', [input.id])) {
      throw new SaleAdjustmentConflictError(input.id, 'DUPLICATE_ADJUSTMENT');
    }
    const target = findAdjustment(db, targetId);
    if (!target) throw new SaleAdjustmentConflictError(targetId, 'ADJUSTMENT_NOT_FOUND');
    const result = prepareSaleAdjustmentReversal(target, loadSaleAdjustmentsOfSale(db, target.saleId), input);
    if (!result.ok) throw new SaleAdjustmentConflictError(targetId, result.issue);
    takeBackStock(db, input.id, result.stockDecrements);
    insertAdjustment(db, result.adjustment);
    outcome = { adjustment: result.adjustment, stockDecrements: result.stockDecrements };
  });
  if (!outcome) throw new Error('reverseStoredSaleAdjustment: transaction produced no record');
  return outcome;
}
