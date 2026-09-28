// Souris — Appointment store
//
// The parent row, its ordered item snapshots, and each item's ordered phases
// are written in ONE transaction. Items keep their authoritative `order`;
// phases are stored by position. `service_id` is historical metadata with
// no foreign key: deleting a catalog Service never changes an Appointment,
// and no Appointment write (create, edit, timing) ever touches Service rows.
//
// Items and phases never sync on their own: every write — metadata, timing,
// reorder, item removal, checkout, payment correction, lifecycle outcome —
// marks the APPOINTMENT aggregate in the sync outbox within the same
// transaction (Cloud Sync V1B); permanent deletion leaves an APPOINTMENT
// DELETE entry that outlives the rows.
//
// Deposits (schema v12): every write that can LOWER the expected total — a
// full update, an item removal, a discount — reads the deposit position
// before its statements and re-verifies it after them
// (`assertAppointmentDepositsCovered`), so a financially open Appointment is
// never left expected below the deposits already received.

import {
  canDeleteAppointmentPermanently,
  canSettleCompletedAppointmentWithDeposits,
  canRemoveAppointmentItem,
  findCheckoutDiscountDepositShortfall,
  isEditableAppointmentStatus,
  isValidPhaseDurationMinutes,
  type Appointment,
  type AppointmentCancellation,
  type AppointmentCancellationActor,
  type AppointmentCheckoutRefusal,
  type AppointmentDiscount,
  type AppointmentItem,
  type AppointmentPayment,
  type AppointmentPaymentAmounts,
  type AppointmentPhase,
  type AppointmentPhaseDurationUpdate,
  type AppointmentReferences,
  type AppointmentStatus,
  type ServiceType,
  validateCheckoutAmounts,
  validatePaymentCorrectionAmounts,
} from '@/domain/appointments';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import {
  AppointmentDepositShortfallError,
  assertAppointmentDepositsCovered,
  countAppointmentDeposits,
  readAppointmentDepositPosition,
} from './appointment-deposits';
import { countAppointmentSales } from './sales';
import {
  assertAmountCents,
  fromSqlBoolean,
  fromSqlDiscountColumns,
  fromSqlInstant,
  fromSqlOptional,
  fromSqlOptionalBoolean,
  fromSqlPaymentColumns,
  fromSqlPriceCents,
  toSqlBoolean,
  toSqlDiscountColumns,
  toSqlInstant,
  toSqlOptional,
  toSqlOptionalBoolean,
  toSqlPaymentColumns,
  toSqlPriceCents,
} from '../values';

interface AppointmentRow {
  readonly id: string;
  readonly business_id: string;
  readonly client_id: string;
  readonly staff_member_id: string;
  readonly start_at: string;
  readonly status: AppointmentStatus;
  readonly notes: string | null;
  readonly cancelled_at: string | null;
  readonly cancelled_by: AppointmentCancellationActor | null;
  readonly cancellation_reason: string | null;
  readonly no_show_recorded_at: string | null;
  readonly paid_at: string | null;
  readonly card_amount_cents: number | null;
  readonly cash_amount_cents: number | null;
  readonly discount_percent: number | null;
  readonly discount_amount_cents: number | null;
  readonly client_reminder_enabled: number | null;
}

interface AppointmentItemRow {
  readonly appointment_id: string;
  readonly id: string;
  readonly item_order: number;
  readonly service_id: string;
  readonly service_option_id: string | null;
  readonly service_name: string;
  readonly service_type: ServiceType;
  readonly price_cents: number;
}

interface AppointmentPhaseRow {
  readonly appointment_id: string;
  readonly appointment_item_id: string;
  readonly id: string;
  readonly name: string;
  readonly duration_minutes: number;
  readonly requires_staff: number;
}

function toCancellation(row: AppointmentRow): AppointmentCancellation | undefined {
  if (row.cancelled_at === null || row.cancelled_by === null) return undefined;
  const reason = fromSqlOptional(row.cancellation_reason);
  return {
    cancelledAt: fromSqlInstant(row.cancelled_at),
    cancelledBy: row.cancelled_by,
    ...(reason !== undefined ? { reason } : {}),
  };
}

function toAppointment(row: AppointmentRow, items: readonly AppointmentItem[]): Appointment {
  const notes = fromSqlOptional(row.notes);
  const discount = fromSqlDiscountColumns(row);
  const cancellation = toCancellation(row);
  const noShow =
    row.no_show_recorded_at !== null
      ? { recordedAt: fromSqlInstant(row.no_show_recorded_at) }
      : undefined;
  const payment: AppointmentPayment | undefined = fromSqlPaymentColumns(row);
  // NULL = never explicitly set: the domain default (enabled) as an absent property.
  const clientReminderEnabled = fromSqlOptionalBoolean(row.client_reminder_enabled);

  return {
    id: row.id,
    businessId: row.business_id,
    clientId: row.client_id,
    staffMemberId: row.staff_member_id,
    startAt: fromSqlInstant(row.start_at),
    status: row.status,
    items,
    ...(notes !== undefined ? { notes } : {}),
    ...(discount ? { discount } : {}),
    ...(clientReminderEnabled !== undefined ? { clientReminderEnabled } : {}),
    ...(cancellation ? { cancellation } : {}),
    ...(noShow ? { noShow } : {}),
    ...(payment ? { payment } : {}),
  };
}

function toPhase(row: AppointmentPhaseRow): AppointmentPhase {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    requiresStaff: fromSqlBoolean(row.requires_staff),
  };
}

function itemKey(appointmentId: string, itemId: string): string {
  return `${appointmentId}\0${itemId}`;
}

export function loadAppointments(db: SourisDatabase): readonly Appointment[] {
  const phasesByItem = new Map<string, AppointmentPhase[]>();
  for (const row of db.getAllSync<AppointmentPhaseRow>(
    'SELECT appointment_id, appointment_item_id, id, name, duration_minutes, requires_staff FROM appointment_phases ORDER BY appointment_id, appointment_item_id, position',
  )) {
    const key = itemKey(row.appointment_id, row.appointment_item_id);
    const phases = phasesByItem.get(key) ?? [];
    phases.push(toPhase(row));
    phasesByItem.set(key, phases);
  }

  const itemsByAppointment = new Map<string, AppointmentItem[]>();
  for (const row of db.getAllSync<AppointmentItemRow>(
    'SELECT appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents FROM appointment_items ORDER BY appointment_id, item_order',
  )) {
    const serviceOptionId = fromSqlOptional(row.service_option_id);
    const item: AppointmentItem = {
      id: row.id,
      serviceId: row.service_id,
      ...(serviceOptionId !== undefined ? { serviceOptionId } : {}),
      order: row.item_order,
      serviceName: row.service_name,
      serviceType: row.service_type,
      price: fromSqlPriceCents(row.price_cents),
      phases: phasesByItem.get(itemKey(row.appointment_id, row.id)) ?? [],
    };
    const items = itemsByAppointment.get(row.appointment_id) ?? [];
    items.push(item);
    itemsByAppointment.set(row.appointment_id, items);
  }

  return db
    .getAllSync<AppointmentRow>(
      'SELECT id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents, discount_percent, discount_amount_cents, client_reminder_enabled FROM appointments ORDER BY rowid',
    )
    .map((row) => toAppointment(row, itemsByAppointment.get(row.id) ?? []));
}

function writeItems(db: SourisDatabase, appointment: Appointment): void {
  for (const item of appointment.items) {
    db.runSync(
      'INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        appointment.id,
        item.id,
        item.order,
        item.serviceId,
        toSqlOptional(item.serviceOptionId),
        item.serviceName,
        item.serviceType,
        toSqlPriceCents(item.price, 'appointment_items.price_cents'),
      ],
    );
    item.phases.forEach((phase, position) => {
      db.runSync(
        'INSERT INTO appointment_phases (appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          appointment.id,
          item.id,
          position,
          phase.id,
          phase.name,
          phase.durationMinutes,
          toSqlBoolean(phase.requiresStaff),
        ],
      );
    });
  }
}

function metadataParams(appointment: Appointment) {
  return [
    appointment.clientId,
    appointment.staffMemberId,
    toSqlInstant(appointment.startAt),
    appointment.status,
    toSqlOptional(appointment.notes),
    appointment.cancellation ? toSqlInstant(appointment.cancellation.cancelledAt) : null,
    appointment.cancellation?.cancelledBy ?? null,
    toSqlOptional(appointment.cancellation?.reason),
    appointment.noShow ? toSqlInstant(appointment.noShow.recordedAt) : null,
    ...toSqlPaymentColumns(appointment.payment),
    ...toSqlDiscountColumns(appointment.discount),
    toSqlOptionalBoolean(appointment.clientReminderEnabled),
  ] as const;
}

export function insertAppointment(db: SourisDatabase, appointment: Appointment): void {
  runInTransaction(db, () => {
    db.runSync(
      'INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents, discount_percent, discount_amount_cents, client_reminder_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [appointment.id, appointment.businessId, ...metadataParams(appointment)],
    );
    writeItems(db, appointment);
    markAggregateUpserted(db, 'APPOINTMENT', appointment.id);
  });
}

/**
 * Replaces metadata, lifecycle outcome, and the complete item/phase snapshot
 * list of the Appointment with the same id, atomically.
 */
export function updateAppointment(db: SourisDatabase, appointment: Appointment): void {
  runInTransaction(db, () => {
    const before = readAppointmentDepositPosition(db, appointment.id);
    const result = db.runSync(
      'UPDATE appointments SET client_id = ?, staff_member_id = ?, start_at = ?, status = ?, notes = ?, cancelled_at = ?, cancelled_by = ?, cancellation_reason = ?, no_show_recorded_at = ?, paid_at = ?, card_amount_cents = ?, cash_amount_cents = ?, discount_percent = ?, discount_amount_cents = ?, client_reminder_enabled = ? WHERE id = ?',
      [...metadataParams(appointment), appointment.id],
    );
    if (result.changes !== 1) {
      throw new Error(`updateAppointment: Appointment "${appointment.id}" not found`);
    }
    db.runSync('DELETE FROM appointment_items WHERE appointment_id = ?', [appointment.id]);
    writeItems(db, appointment);
    assertAppointmentDepositsCovered(db, appointment.id, before);
    markAggregateUpserted(db, 'APPOINTMENT', appointment.id);
  });
}

export class AppointmentTimingConflictError extends Error {
  constructor(readonly appointmentId: string) {
    super(`Appointment "${appointmentId}" no longer allows timing changes`);
    this.name = 'AppointmentTimingConflictError';
  }
}

/**
 * Appointment-specific timing edit in ONE transaction: the stored Appointment
 * must still exist and still be editable (no terminal outcome), then every
 * targeted phase row of the item receives its new duration. A phase that
 * does not belong to the item, or an invalid duration, rolls the whole
 * write back. Zero is written as zero; no row is deleted. The catalog
 * `service_phases` table is never involved. No derived duration is stored
 * in the schema, so nothing else needs updating.
 */
export function updateAppointmentItemPhaseDurations(
  db: SourisDatabase,
  appointmentId: string,
  appointmentItemId: string,
  updates: readonly AppointmentPhaseDurationUpdate[],
): void {
  for (const update of updates) {
    if (!isValidPhaseDurationMinutes(update.durationMinutes)) {
      throw new RangeError(
        `updateAppointmentItemPhaseDurations: invalid duration ${update.durationMinutes} for phase "${update.phaseId}"`,
      );
    }
  }
  runInTransaction(db, () => {
    const row = db.getFirstSync<{ status: AppointmentStatus }>(
      'SELECT status FROM appointments WHERE id = ?',
      [appointmentId],
    );
    if (!row || !isEditableAppointmentStatus(row.status)) {
      throw new AppointmentTimingConflictError(appointmentId);
    }
    for (const update of updates) {
      const result = db.runSync(
        'UPDATE appointment_phases SET duration_minutes = ? WHERE appointment_id = ? AND appointment_item_id = ? AND id = ?',
        [update.durationMinutes, appointmentId, appointmentItemId, update.phaseId],
      );
      if (result.changes !== 1) {
        throw new Error(
          `updateAppointmentItemPhaseDurations: phase "${update.phaseId}" not found in item "${appointmentItemId}" of Appointment "${appointmentId}"`,
        );
      }
    }
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

export type AppointmentItemRefusal =
  | 'APPOINTMENT_NOT_FOUND'
  | 'APPOINTMENT_NOT_EDITABLE'
  | 'ITEM_NOT_FOUND'
  /** Removing the item would leave the Appointment without any Service. */
  | 'LAST_ITEM'
  /** The requested order does not name every stored item exactly once. */
  | 'ORDER_MISMATCH';

/** The stored rows refuse this item change; nothing was written. */
export class AppointmentItemConflictError extends Error {
  constructor(
    readonly appointmentId: string,
    readonly reason: AppointmentItemRefusal,
  ) {
    super(`Appointment "${appointmentId}" refuses this item change (${reason})`);
    this.name = 'AppointmentItemConflictError';
  }
}

function requireEditableAppointment(db: SourisDatabase, appointmentId: string): void {
  const row = db.getFirstSync<{ status: AppointmentStatus }>(
    'SELECT status FROM appointments WHERE id = ?',
    [appointmentId],
  );
  if (!row) throw new AppointmentItemConflictError(appointmentId, 'APPOINTMENT_NOT_FOUND');
  if (!isEditableAppointmentStatus(row.status)) {
    throw new AppointmentItemConflictError(appointmentId, 'APPOINTMENT_NOT_EDITABLE');
  }
}

function storedItemIds(db: SourisDatabase, appointmentId: string): string[] {
  return db
    .getAllSync<{ id: string }>(
      'SELECT id FROM appointment_items WHERE appointment_id = ? ORDER BY item_order',
      [appointmentId],
    )
    .map((row) => row.id);
}

/**
 * Direct reorder from Appointment Details, in ONE transaction: the stored
 * Appointment must still exist and be editable, the requested order must
 * name every stored item exactly once, then `item_order` is rewritten by
 * STABLE item id (never by array position). Phases, prices and the catalog
 * are untouched. Any failure rolls the whole write back.
 */
export function reorderAppointmentItems(
  db: SourisDatabase,
  appointmentId: string,
  orderedItemIds: readonly string[],
): void {
  runInTransaction(db, () => {
    requireEditableAppointment(db, appointmentId);
    const stored = storedItemIds(db, appointmentId);
    const requested = new Set(orderedItemIds);
    if (
      requested.size !== orderedItemIds.length ||
      requested.size !== stored.length ||
      stored.some((id) => !requested.has(id))
    ) {
      throw new AppointmentItemConflictError(appointmentId, 'ORDER_MISMATCH');
    }
    orderedItemIds.forEach((itemId, index) => {
      const result = db.runSync(
        'UPDATE appointment_items SET item_order = ? WHERE appointment_id = ? AND id = ?',
        [index, appointmentId, itemId],
      );
      if (result.changes !== 1) {
        throw new AppointmentItemConflictError(appointmentId, 'ITEM_NOT_FOUND');
      }
    });
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

/**
 * Direct removal of ONE AppointmentItem from Appointment Details, in ONE
 * transaction: the stored Appointment must still exist and be editable, the
 * item must exist, and it must not be the last one (the editing rule). The
 * item's phase rows go with it and the remaining `item_order` values are
 * normalized. Linked Sales, stock, payment and the catalog are never
 * involved. Any failure rolls the whole write back.
 */
export function removeAppointmentItem(
  db: SourisDatabase,
  appointmentId: string,
  appointmentItemId: string,
): void {
  runInTransaction(db, () => {
    requireEditableAppointment(db, appointmentId);
    const before = readAppointmentDepositPosition(db, appointmentId);
    const stored = storedItemIds(db, appointmentId);
    if (!stored.includes(appointmentItemId)) {
      throw new AppointmentItemConflictError(appointmentId, 'ITEM_NOT_FOUND');
    }
    if (!canRemoveAppointmentItem(stored.length)) {
      throw new AppointmentItemConflictError(appointmentId, 'LAST_ITEM');
    }
    db.runSync(
      'DELETE FROM appointment_phases WHERE appointment_id = ? AND appointment_item_id = ?',
      [appointmentId, appointmentItemId],
    );
    const removed = db.runSync(
      'DELETE FROM appointment_items WHERE appointment_id = ? AND id = ?',
      [appointmentId, appointmentItemId],
    );
    if (removed.changes !== 1) {
      throw new AppointmentItemConflictError(appointmentId, 'ITEM_NOT_FOUND');
    }
    stored
      .filter((id) => id !== appointmentItemId)
      .forEach((itemId, index) => {
        db.runSync(
          'UPDATE appointment_items SET item_order = ? WHERE appointment_id = ? AND id = ?',
          [index, appointmentId, itemId],
        );
      });
    assertAppointmentDepositsCovered(db, appointmentId, before);
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

/** The stored Appointment is missing or no longer editable; nothing was written. */
export class AppointmentDiscountConflictError extends Error {
  constructor(readonly appointmentId: string) {
    super(`Appointment "${appointmentId}" no longer allows discount changes`);
    this.name = 'AppointmentDiscountConflictError';
  }
}

/**
 * Sets, changes or removes (`undefined`) the Appointment discount in ONE
 * transaction: the stored Appointment must still exist and still be
 * editable, so the discount of a COMPLETED / CANCELLED / NO_SHOW Appointment
 * is never rewritten. Item snapshot prices, payment and linked Sales are
 * untouched; no derived total is stored. A discount that would take the
 * expected total below the ACTIVE deposits is refused
 * (`AppointmentDepositShortfallError`), nothing written.
 */
export function updateAppointmentDiscount(
  db: SourisDatabase,
  appointmentId: string,
  discount: AppointmentDiscount | undefined,
): void {
  const [discountPercent, discountAmountCents] = toSqlDiscountColumns(discount);
  runInTransaction(db, () => {
    const before = readAppointmentDepositPosition(db, appointmentId);
    const result = db.runSync(
      "UPDATE appointments SET discount_percent = ?, discount_amount_cents = ? WHERE id = ? AND status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')",
      [discountPercent, discountAmountCents, appointmentId],
    );
    if (result.changes !== 1) {
      throw new AppointmentDiscountConflictError(appointmentId);
    }
    assertAppointmentDepositsCovered(db, appointmentId, before);
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

export class AppointmentCheckoutConflictError extends Error {
  constructor(readonly appointmentId: string) {
    super(`Appointment "${appointmentId}" no longer allows this checkout`);
    this.name = 'AppointmentCheckoutConflictError';
  }
}

/**
 * The amounts do not settle what the stored Appointment allows: not the exact
 * due of a new final payment, outside the correction range, or nothing to
 * pay (deposits already cover everything). Nothing was written.
 */
export class AppointmentCheckoutAmountError extends Error {
  constructor(
    readonly appointmentId: string,
    readonly refusal: AppointmentCheckoutRefusal,
  ) {
    super(`Appointment "${appointmentId}" refuses this payment: ${refusal}`);
    this.name = 'AppointmentCheckoutAmountError';
  }
}

/** The final discount chosen in the checkout sheet (`discount: undefined` removes it). */
export interface StoredCheckoutDiscount {
  readonly discount: AppointmentDiscount | undefined;
}

/**
 * Explicit checkout in ONE transaction, re-verified against the STORED rows
 * (the same pattern as a deposit), so a stale screen or another call path can
 * never record what the domain refuses:
 *
 *   1. with `finalDiscount`, the discount is written first — only while the
 *      row may still change it (open, or COMPLETED without payment) — and may
 *      not take the expected total below the ACTIVE deposits;
 *   2. the deposit position is re-read and the amounts must settle EXACTLY the
 *      checkout due; deposits covering everything refuse any payment;
 *   3. status and payment land together, only on a still eligible row (a
 *      completable status, or COMPLETED without payment).
 *
 * Any refusal throws and rolls every step back.
 */
export function checkoutAppointment(
  db: SourisDatabase,
  appointmentId: string,
  payment: AppointmentPayment,
  finalDiscount?: StoredCheckoutDiscount,
): void {
  const [paidAt, cardAmountCents, cashAmountCents] = toSqlPaymentColumns(payment);
  runInTransaction(db, () => {
    if (finalDiscount) writeCheckoutDiscount(db, appointmentId, finalDiscount.discount);
    const position = readAppointmentDepositPosition(db, appointmentId);
    if (!position) throw new AppointmentCheckoutConflictError(appointmentId);
    const refusal = validateCheckoutAmounts(position, payment);
    if (refusal) throw new AppointmentCheckoutAmountError(appointmentId, refusal);
    const result = db.runSync(
      "UPDATE appointments SET status = 'COMPLETED', paid_at = ?, card_amount_cents = ?, cash_amount_cents = ? WHERE id = ? AND (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS') OR (status = 'COMPLETED' AND paid_at IS NULL))",
      [paidAt, cardAmountCents, cashAmountCents, appointmentId],
    );
    if (result.changes !== 1) {
      throw new AppointmentCheckoutConflictError(appointmentId);
    }
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

/** Step 1 of the checkout: THE checkout discount rule, on the stored row. */
function writeCheckoutDiscount(
  db: SourisDatabase,
  appointmentId: string,
  discount: AppointmentDiscount | undefined,
): void {
  const before = readAppointmentDepositPosition(db, appointmentId);
  const stored = db.getFirstSync<{ paid_at: string | null }>(
    'SELECT paid_at FROM appointments WHERE id = ?',
    [appointmentId],
  );
  if (!before || !stored) throw new AppointmentCheckoutConflictError(appointmentId);
  const [discountPercent, discountAmountCents] = toSqlDiscountColumns(discount);
  const result = db.runSync(
    "UPDATE appointments SET discount_percent = ?, discount_amount_cents = ? WHERE id = ? AND (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS') OR (status = 'COMPLETED' AND paid_at IS NULL))",
    [discountPercent, discountAmountCents, appointmentId],
  );
  if (result.changes !== 1) throw new AppointmentDiscountConflictError(appointmentId);
  const after = readAppointmentDepositPosition(db, appointmentId);
  if (!after) throw new AppointmentCheckoutConflictError(appointmentId);
  const shortfall = findCheckoutDiscountDepositShortfall({
    status: before.status,
    hasPayment: stored.paid_at !== null,
    previousExpectedTotalCents: before.expectedTotalCents,
    nextExpectedTotalCents: after.expectedTotalCents,
    activeDepositTotalCents: after.activeDepositTotalCents,
  });
  if (shortfall) throw new AppointmentDepositShortfallError(appointmentId, shortfall);
}

/**
 * Payment correction: only the card/cash split of an already recorded
 * payment changes. `paid_at` and the status are preserved by construction.
 * The new total is re-verified against the stored position and the stored
 * payment: within [min(due, recorded), max(due, recorded)] — exactly the due
 * for every payment recorded under the exact rule.
 */
export function updateAppointmentPayment(
  db: SourisDatabase,
  appointmentId: string,
  amounts: AppointmentPaymentAmounts,
): void {
  const cardAmountCents = assertAmountCents(amounts.cardAmountCents, 'card_amount_cents');
  const cashAmountCents = assertAmountCents(amounts.cashAmountCents, 'cash_amount_cents');
  runInTransaction(db, () => {
    const stored = db.getFirstSync<{
      status: AppointmentStatus;
      paid_at: string | null;
      card_amount_cents: number | null;
      cash_amount_cents: number | null;
    }>('SELECT status, paid_at, card_amount_cents, cash_amount_cents FROM appointments WHERE id = ?', [
      appointmentId,
    ]);
    const recorded = stored ? fromSqlPaymentColumns(stored) : undefined;
    const position = readAppointmentDepositPosition(db, appointmentId);
    if (!stored || stored.status !== 'COMPLETED' || !recorded || !position) {
      throw new AppointmentCheckoutConflictError(appointmentId);
    }
    const refusal = validatePaymentCorrectionAmounts(position, recorded, { cardAmountCents, cashAmountCents });
    if (refusal) throw new AppointmentCheckoutAmountError(appointmentId, refusal);
    const result = db.runSync(
      "UPDATE appointments SET card_amount_cents = ?, cash_amount_cents = ? WHERE id = ? AND status = 'COMPLETED' AND paid_at IS NOT NULL",
      [cardAmountCents, cashAmountCents, appointmentId],
    );
    if (result.changes !== 1) {
      throw new AppointmentCheckoutConflictError(appointmentId);
    }
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

/**
 * « Terminer le rendez-vous » of a FULLY PREPAID Appointment, in ONE
 * transaction: the stored row must still be financially open, carry no
 * payment and have started; its ACTIVE deposits must cover the whole
 * expected total (at least one deposit, nothing left to collect). The status
 * becomes COMPLETED and NO payment is written — no new money was received,
 * so nothing new reaches the Cash Register.
 */
export function completePrepaidAppointment(
  db: SourisDatabase,
  appointmentId: string,
  now: Date,
): void {
  runInTransaction(db, () => {
    const position = readAppointmentDepositPosition(db, appointmentId);
    if (!position || position.activeDepositTotalCents === 0 || position.remainingCents !== 0) {
      throw new AppointmentCheckoutConflictError(appointmentId);
    }
    const result = db.runSync(
      "UPDATE appointments SET status = 'COMPLETED' WHERE id = ? AND status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS') AND paid_at IS NULL AND start_at <= ?",
      [appointmentId, toSqlInstant(now)],
    );
    if (result.changes !== 1) {
      throw new AppointmentCheckoutConflictError(appointmentId);
    }
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

/**
 * A COMPLETED Appointment without payment, settled by its deposits once the
 * checkout discount is applied — in ONE transaction: the discount goes through
 * THE checkout discount write (eligibility on the stored row, never below the
 * deposits), then the stored position must show the ACTIVE deposits covering
 * the whole expected total. Only the discount is written: NO payment, no
 * `paid_at`, no amounts; the status stays COMPLETED. Any refusal rolls back.
 */
export function settleCompletedAppointmentWithDeposits(
  db: SourisDatabase,
  appointmentId: string,
  finalDiscount: StoredCheckoutDiscount,
): void {
  runInTransaction(db, () => {
    writeCheckoutDiscount(db, appointmentId, finalDiscount.discount);
    const position = readAppointmentDepositPosition(db, appointmentId);
    const stored = db.getFirstSync<{ paid_at: string | null }>(
      'SELECT paid_at FROM appointments WHERE id = ?',
      [appointmentId],
    );
    if (
      !position ||
      !stored ||
      stored.paid_at !== null ||
      !canSettleCompletedAppointmentWithDeposits({ status: position.status }, position)
    ) {
      throw new AppointmentCheckoutConflictError(appointmentId);
    }
    markAggregateUpserted(db, 'APPOINTMENT', appointmentId);
  });
}

export class AppointmentDeleteConflictError extends Error {
  constructor(
    readonly appointmentId: string,
    readonly references: AppointmentReferences,
  ) {
    super(`Appointment "${appointmentId}" is referenced by business history and cannot be deleted`);
    this.name = 'AppointmentDeleteConflictError';
  }
}

/** The stored facts that anchor the Appointment in history (payment, linked Sales, deposits). */
export function countAppointmentReferences(
  db: SourisDatabase,
  appointmentId: string,
): AppointmentReferences {
  const row = db.getFirstSync<{ paid_at: string | null }>(
    'SELECT paid_at FROM appointments WHERE id = ?',
    [appointmentId],
  );
  return {
    hasPayment: row?.paid_at !== null && row?.paid_at !== undefined,
    saleCount: countAppointmentSales(db, appointmentId),
    depositCount: countAppointmentDeposits(db, appointmentId),
  };
}

/**
 * Permanent deletion: the parent row and every nested item/phase row, in
 * ONE transaction that first re-verifies the stored references:
 *
 *   → a recorded payment, a linked Sale or a deposit (VOIDED included):
 *     AppointmentDeleteConflictError,
 *     nothing written (no cascade, no `appointment_id = NULL` rewrite)
 *   → otherwise DELETE + APPOINTMENT DELETE outbox entry
 */
export function deleteAppointment(db: SourisDatabase, appointmentId: string): void {
  runInTransaction(db, () => {
    const references = countAppointmentReferences(db, appointmentId);
    if (!canDeleteAppointmentPermanently(references)) {
      throw new AppointmentDeleteConflictError(appointmentId, references);
    }
    const result = db.runSync('DELETE FROM appointments WHERE id = ?', [appointmentId]);
    if (result.changes === 1) markAggregateDeleted(db, 'APPOINTMENT', appointmentId);
  });
}
