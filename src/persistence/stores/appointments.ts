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

import {
  canDeleteAppointmentPermanently,
  canRemoveAppointmentItem,
  isEditableAppointmentStatus,
  isValidPhaseDurationMinutes,
  type Appointment,
  type AppointmentCancellation,
  type AppointmentCancellationActor,
  type AppointmentItem,
  type AppointmentPayment,
  type AppointmentPaymentAmounts,
  type AppointmentPhase,
  type AppointmentPhaseDurationUpdate,
  type AppointmentReferences,
  type AppointmentStatus,
  type ServiceType,
} from '@/domain/appointments';

import { runInTransaction, type SourisDatabase } from '../database';
import { markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import { countAppointmentSales } from './sales';
import {
  assertAmountCents,
  fromSqlBoolean,
  fromSqlInstant,
  fromSqlOptional,
  fromSqlPaymentColumns,
  toSqlBoolean,
  toSqlInstant,
  toSqlOptional,
  toSqlPaymentColumns,
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
}

interface AppointmentItemRow {
  readonly appointment_id: string;
  readonly id: string;
  readonly item_order: number;
  readonly service_id: string;
  readonly service_option_id: string | null;
  readonly service_name: string;
  readonly service_type: ServiceType;
  readonly price: number;
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
  const cancellation = toCancellation(row);
  const noShow =
    row.no_show_recorded_at !== null
      ? { recordedAt: fromSqlInstant(row.no_show_recorded_at) }
      : undefined;
  const payment: AppointmentPayment | undefined = fromSqlPaymentColumns(row);

  return {
    id: row.id,
    businessId: row.business_id,
    clientId: row.client_id,
    staffMemberId: row.staff_member_id,
    startAt: fromSqlInstant(row.start_at),
    status: row.status,
    items,
    ...(notes !== undefined ? { notes } : {}),
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
    'SELECT appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price FROM appointment_items ORDER BY appointment_id, item_order',
  )) {
    const serviceOptionId = fromSqlOptional(row.service_option_id);
    const item: AppointmentItem = {
      id: row.id,
      serviceId: row.service_id,
      ...(serviceOptionId !== undefined ? { serviceOptionId } : {}),
      order: row.item_order,
      serviceName: row.service_name,
      serviceType: row.service_type,
      price: row.price,
      phases: phasesByItem.get(itemKey(row.appointment_id, row.id)) ?? [],
    };
    const items = itemsByAppointment.get(row.appointment_id) ?? [];
    items.push(item);
    itemsByAppointment.set(row.appointment_id, items);
  }

  return db
    .getAllSync<AppointmentRow>(
      'SELECT id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents FROM appointments ORDER BY rowid',
    )
    .map((row) => toAppointment(row, itemsByAppointment.get(row.id) ?? []));
}

function writeItems(db: SourisDatabase, appointment: Appointment): void {
  for (const item of appointment.items) {
    db.runSync(
      'INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        appointment.id,
        item.id,
        item.order,
        item.serviceId,
        toSqlOptional(item.serviceOptionId),
        item.serviceName,
        item.serviceType,
        item.price,
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
  ] as const;
}

export function insertAppointment(db: SourisDatabase, appointment: Appointment): void {
  runInTransaction(db, () => {
    db.runSync(
      'INSERT INTO appointments (id, business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    const result = db.runSync(
      'UPDATE appointments SET client_id = ?, staff_member_id = ?, start_at = ?, status = ?, notes = ?, cancelled_at = ?, cancelled_by = ?, cancellation_reason = ?, no_show_recorded_at = ?, paid_at = ?, card_amount_cents = ?, cash_amount_cents = ? WHERE id = ?',
      [...metadataParams(appointment), appointment.id],
    );
    if (result.changes !== 1) {
      throw new Error(`updateAppointment: Appointment "${appointment.id}" not found`);
    }
    db.runSync('DELETE FROM appointment_items WHERE appointment_id = ?', [appointment.id]);
    writeItems(db, appointment);
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
 * Explicit checkout in ONE transaction: the stored row must still exist and
 * still be eligible (a completable status, or COMPLETED without payment),
 * otherwise nothing is written. Status and payment land together — never
 * COMPLETED first and the payment afterwards.
 */
export function checkoutAppointment(
  db: SourisDatabase,
  appointmentId: string,
  payment: AppointmentPayment,
): void {
  const [paidAt, cardAmountCents, cashAmountCents] = toSqlPaymentColumns(payment);
  runInTransaction(db, () => {
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

/**
 * Payment correction: only the card/cash split of an already recorded
 * payment changes. `paid_at` and the status are preserved by construction.
 */
export function updateAppointmentPayment(
  db: SourisDatabase,
  appointmentId: string,
  amounts: AppointmentPaymentAmounts,
): void {
  const cardAmountCents = assertAmountCents(amounts.cardAmountCents, 'card_amount_cents');
  const cashAmountCents = assertAmountCents(amounts.cashAmountCents, 'cash_amount_cents');
  runInTransaction(db, () => {
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

export class AppointmentDeleteConflictError extends Error {
  constructor(
    readonly appointmentId: string,
    readonly references: AppointmentReferences,
  ) {
    super(`Appointment "${appointmentId}" is referenced by business history and cannot be deleted`);
    this.name = 'AppointmentDeleteConflictError';
  }
}

/** The stored facts that anchor the Appointment in history (payment, linked Sales). */
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
  };
}

/**
 * Permanent deletion: the parent row and every nested item/phase row, in
 * ONE transaction that first re-verifies the stored references:
 *
 *   → a recorded payment or a linked Sale: AppointmentDeleteConflictError,
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
