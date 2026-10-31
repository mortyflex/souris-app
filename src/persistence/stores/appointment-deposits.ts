// BeautIzzy — Appointment deposit store (« Acomptes », schema v12)
//
// One row per deposit. A deposit is never deleted by a user action: a
// mistake is VOIDED (status + voided_at) and a new deposit recorded. Every
// write marks the APPOINTMENT_DEPOSIT aggregate in the sync outbox within the
// same transaction.
//
// The stored rows are the authority for the financial invariant
// (docs/domain/APPOINTMENTS.md §25d):
//
//   ACTIVE DEPOSITS <= CURRENT EXPECTED TOTAL   (financially open Appointment)
//
// * recording a deposit re-reads, INSIDE its transaction, the Appointment
//   status, its expected total (item snapshots, discount, linked Sale lines)
//   and its ACTIVE deposits, and asks the domain rule
//   (`validateAppointmentDepositAmount`) before inserting;
// * every Appointment or linked-Sale write that can LOWER the expected total
//   reads the position before its statements and calls
//   `assertAppointmentDepositsCovered` after them: the domain rule
//   (`findAppointmentTotalChangeDepositShortfall`) refuses the change and the
//   whole transaction rolls back.
//
// This module reads the tables it needs directly (no import of the
// Appointment or Sale stores, which import it), and every amount goes
// through the domain derivations — nothing is summed or compared here.

import {
  canCorrectAppointmentDeposits,
  createAppointmentDeposit,
  findAppointmentTotalChangeDepositShortfall,
  getActiveDepositTotalCents,
  getAppointmentServicesTotal,
  getDepositPositionFromTotals,
  getSaleTotalCents,
  isAppointmentSettled,
  validateAppointmentDepositAmount,
  type AppointmentDeposit,
  type AppointmentDepositPosition,
  type AppointmentDepositRefusal,
  type AppointmentDepositShortfall,
  type AppointmentDepositStatus,
  type AppointmentStatus,
  type PaymentMethod,
} from '@/domain/appointments';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateUpserted } from '../sync/outbox';
import {
  fromSqlDiscountColumns,
  fromSqlInstant,
  fromSqlPriceCents,
  toSqlInstant,
  type DiscountColumns,
} from '../values';

interface AppointmentDepositRow {
  readonly id: string;
  readonly business_id: string;
  readonly appointment_id: string;
  readonly amount_cents: number;
  readonly payment_method: PaymentMethod;
  readonly paid_at: string;
  readonly status: AppointmentDepositStatus;
  readonly voided_at: string | null;
  /** The domain `createdAt` (remotely `created_at` is sync metadata). */
  readonly recorded_at: string;
}

function toAppointmentDeposit(row: AppointmentDepositRow): AppointmentDeposit {
  return {
    id: row.id,
    businessId: row.business_id,
    appointmentId: row.appointment_id,
    amountCents: row.amount_cents,
    paymentMethod: row.payment_method,
    paidAt: fromSqlInstant(row.paid_at),
    status: row.status,
    ...(row.voided_at !== null ? { voidedAt: fromSqlInstant(row.voided_at) } : {}),
    createdAt: fromSqlInstant(row.recorded_at),
  };
}

const SELECT_DEPOSIT =
  'SELECT id, business_id, appointment_id, amount_cents, payment_method, paid_at, status, voided_at, recorded_at FROM appointment_deposits';

export function loadAppointmentDeposits(db: SourisDatabase): readonly AppointmentDeposit[] {
  return db.getAllSync<AppointmentDepositRow>(`${SELECT_DEPOSIT} ORDER BY rowid`).map(toAppointmentDeposit);
}

/** Every deposit of ONE Appointment, ACTIVE and VOIDED — the deletion guard input. */
export function countAppointmentDeposits(db: SourisDatabase, appointmentId: string): number {
  return (
    db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM appointment_deposits WHERE appointment_id = ?',
      [appointmentId],
    )?.count ?? 0
  );
}

/** The stored financial facts of ONE Appointment, as the domain derives them. */
export interface StoredAppointmentDepositPosition extends AppointmentDepositPosition {
  readonly status: AppointmentStatus;
}

/**
 * Reads the Appointment status, its expected total (THE canonical
 * derivation, from the stored item snapshots, discount and linked Sale lines)
 * and its ACTIVE deposits. Undefined when the Appointment does not exist.
 */
export function readAppointmentDepositPosition(
  db: SourisDatabase,
  appointmentId: string,
): StoredAppointmentDepositPosition | undefined {
  const row = db.getFirstSync<{ status: AppointmentStatus } & DiscountColumns>(
    'SELECT status, discount_percent, discount_amount_cents FROM appointments WHERE id = ?',
    [appointmentId],
  );
  if (!row) return undefined;
  const items = db
    .getAllSync<{ price_cents: number }>(
      'SELECT price_cents FROM appointment_items WHERE appointment_id = ?',
      [appointmentId],
    )
    .map((item) => ({ price: fromSqlPriceCents(item.price_cents) }));
  const services = getAppointmentServicesTotal({ items, discount: fromSqlDiscountColumns(row) });
  const productsCents = getSaleTotalCents({
    items: db
      .getAllSync<{ unit_price_cents: number; quantity: number }>(
        'SELECT si.unit_price_cents, si.quantity FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.appointment_id = ?',
        [appointmentId],
      )
      .map((item) => ({ unitPrice: fromSqlPriceCents(item.unit_price_cents), quantity: item.quantity })),
  });
  const activeDepositTotalCents = getActiveDepositTotalCents(
    db.getAllSync<{ status: AppointmentDepositStatus; amount_cents: number }>(
      'SELECT status, amount_cents FROM appointment_deposits WHERE appointment_id = ?',
      [appointmentId],
    ).map((deposit) => ({ status: deposit.status, amountCents: deposit.amount_cents })),
  );
  return {
    status: row.status,
    ...getDepositPositionFromTotals(services.netCents + productsCents, activeDepositTotalCents),
  };
}

/**
 * Whether the stored Appointment of a Revente received its money: a final
 * payment, or completed and fully covered by its deposits (THE domain rule,
 * `isAppointmentSettled`). False when the Appointment is not on this device.
 */
export function isStoredAppointmentSettled(db: SourisDatabase, appointmentId: string): boolean {
  const row = db.getFirstSync<{ status: AppointmentStatus; paid_at: string | null }>(
    'SELECT status, paid_at FROM appointments WHERE id = ?',
    [appointmentId],
  );
  const position = readAppointmentDepositPosition(db, appointmentId);
  if (!row || !position) return false;
  return isAppointmentSettled(
    {
      status: row.status,
      // Only the presence of a payment matters to the rule.
      payment: row.paid_at === null ? undefined : { paidAt: fromSqlInstant(row.paid_at), cardAmountCents: 0, cashAmountCents: 0 },
    },
    getDepositPositionFromTotals(position.expectedTotalCents, position.activeDepositTotalCents),
  );
}

/**
 * The change would take the expected total of a financially open Appointment
 * below what was already received as deposits. Nothing was written.
 */
export class AppointmentDepositShortfallError extends Error {
  constructor(
    readonly appointmentId: string,
    readonly shortfall: AppointmentDepositShortfall,
  ) {
    super(
      `Appointment "${appointmentId}" would be expected ${shortfall.expectedTotalCents} cents, below its ${shortfall.activeDepositTotalCents} cents of deposits`,
    );
    this.name = 'AppointmentDepositShortfallError';
  }
}

/**
 * Called at the END of a write that may lower the expected total, inside its
 * transaction, with the position read BEFORE the write. Throws
 * `AppointmentDepositShortfallError` — rolling everything back — when the
 * domain rule refuses the change.
 */
export function assertAppointmentDepositsCovered(
  db: SourisDatabase,
  appointmentId: string,
  before: StoredAppointmentDepositPosition | undefined,
): void {
  if (!before) return;
  const after = readAppointmentDepositPosition(db, appointmentId);
  if (!after) return;
  const shortfall = findAppointmentTotalChangeDepositShortfall({
    status: before.status,
    previousExpectedTotalCents: before.expectedTotalCents,
    nextExpectedTotalCents: after.expectedTotalCents,
    activeDepositTotalCents: after.activeDepositTotalCents,
  });
  if (shortfall) throw new AppointmentDepositShortfallError(appointmentId, shortfall);
}

export type AppointmentDepositStoreRefusal =
  | AppointmentDepositRefusal
  | 'APPOINTMENT_NOT_FOUND'
  | 'DEPOSIT_NOT_FOUND'
  | 'DEPOSIT_NOT_ACTIVE'
  | 'DUPLICATE_DEPOSIT';

/** The stored rows refuse this deposit write; nothing was written. */
export class AppointmentDepositConflictError extends Error {
  constructor(
    readonly depositId: string,
    readonly reason: AppointmentDepositStoreRefusal,
  ) {
    super(`Appointment deposit "${depositId}" refused (${reason})`);
    this.name = 'AppointmentDepositConflictError';
  }
}

/**
 * Records a NEW ACTIVE deposit in ONE transaction: the shape is validated by
 * the domain, then the stored Appointment must exist, be financially open,
 * and still have at least `amountCents` left to collect. A second write of
 * the same id (a double tap, a retried call) is refused, never duplicated.
 */
export function insertAppointmentDeposit(db: SourisDatabase, deposit: AppointmentDeposit): void {
  const valid = createAppointmentDeposit(deposit);
  const refuse = (reason: AppointmentDepositStoreRefusal) =>
    new AppointmentDepositConflictError(valid.id, reason);
  if (valid.status !== 'ACTIVE') throw refuse('DEPOSIT_NOT_ACTIVE');

  runInTransaction(db, () => {
    if (db.getFirstSync('SELECT 1 AS found FROM appointment_deposits WHERE id = ?', [valid.id])) {
      throw refuse('DUPLICATE_DEPOSIT');
    }
    const position = readAppointmentDepositPosition(db, valid.appointmentId);
    if (!position) throw refuse('APPOINTMENT_NOT_FOUND');
    const refusal = validateAppointmentDepositAmount({
      status: position.status,
      expectedTotalCents: position.expectedTotalCents,
      activeDepositTotalCents: position.activeDepositTotalCents,
      amountCents: valid.amountCents,
    });
    if (refusal) throw refuse(refusal);

    db.runSync(
      'INSERT INTO appointment_deposits (id, business_id, appointment_id, amount_cents, payment_method, paid_at, status, voided_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)',
      [
        valid.id,
        valid.businessId,
        valid.appointmentId,
        valid.amountCents,
        valid.paymentMethod,
        toSqlInstant(valid.paidAt),
        'ACTIVE',
        toSqlInstant(valid.createdAt),
      ],
    );
    markAggregateUpserted(db, 'APPOINTMENT_DEPOSIT', valid.id);
  });
}

/**
 * « Annuler l'acompte » in ONE transaction: the stored deposit must still be
 * ACTIVE and its Appointment must not be COMPLETED — a mistaken entry stays
 * correctable after a cancellation or a no-show (`canCorrectAppointmentDeposits`).
 * Only `status` and `voided_at` change; amount, method and `paid_at` stay as
 * recorded.
 */
export function voidAppointmentDeposit(db: SourisDatabase, depositId: string, voidedAt: Date): void {
  const refuse = (reason: AppointmentDepositStoreRefusal) =>
    new AppointmentDepositConflictError(depositId, reason);
  runInTransaction(db, () => {
    const row = db.getFirstSync<{ status: AppointmentDepositStatus; appointment_status: AppointmentStatus | null }>(
      'SELECT d.status, a.status AS appointment_status FROM appointment_deposits d LEFT JOIN appointments a ON a.id = d.appointment_id WHERE d.id = ?',
      [depositId],
    );
    if (!row) throw refuse('DEPOSIT_NOT_FOUND');
    if (row.status !== 'ACTIVE') throw refuse('DEPOSIT_NOT_ACTIVE');
    if (row.appointment_status === null) throw refuse('APPOINTMENT_NOT_FOUND');
    if (!canCorrectAppointmentDeposits({ status: row.appointment_status })) {
      throw refuse('APPOINTMENT_NOT_OPEN');
    }

    db.runSync("UPDATE appointment_deposits SET status = 'VOIDED', voided_at = ? WHERE id = ?", [
      toSqlInstant(voidedAt),
      depositId,
    ]);
    markAggregateUpserted(db, 'APPOINTMENT_DEPOSIT', depositId);
  });
}
