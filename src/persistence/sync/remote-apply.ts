// Souris — remote aggregate → SQLite (Cloud Sync V1D)
//
// The mirror image of aggregate-payload.ts: writes ONE validated remote
// aggregate into the local tables. It is used by the new-device restore and by
// the incremental pull, and by nothing else.
//
// It deliberately does NOT go through the stores. A store mutation records an
// outbox entry, which is exactly what a change ORIGINATING from the remote
// must never do: it would be pushed straight back (a sync echo). These
// functions write rows and nothing else — no `sync_outbox`, no `sync_state`;
// the caller owns the transaction and the acknowledged version.
//
//   * integer cents, ids, child ids, positions and `item_order` are copied
//     exactly as the remote holds them — no euro round trip, no renumbering;
//   * an existing parent row is UPDATED in place (its rowid — the list order
//     every screen relies on — is kept) and its child set is REPLACED, which
//     is the aggregate contract (CLOUD_SYNC.md §6);
//   * `products.image_uri` is device-local: never written from the remote, so
//     a restored Product has no image and a pulled one keeps the local file;
//   * `clients.birth_date` (legacy, unused) is never touched;
//   * business-scoped rows are stamped with the bound Business id; a local row
//     carrying the same id under ANOTHER Business id is refused loudly.
//
// A remote tombstone follows the LOCAL deletion semantics: permanent removal
// of the row (children cascade), guarded exactly like a user deletion — a
// Client still referenced by history, or an Appointment with a payment or a
// linked Sale, is NOT removed (`BLOCKED`); integrity wins over convergence.

import { canDeleteAppointmentPermanently } from '@/domain/appointments';
import { canDeleteClientPermanently } from '@/domain/clients';

import type { SourisDatabase } from '../database';
import { countAppointmentReferences } from '../stores/appointments';
import { countClientReferences } from '../stores/clients';
import { toSqlBoolean } from '../values';

import type { SyncAggregateRef } from './aggregate';
import { LocalAggregateScopeError } from './aggregate-payload';
import type {
  RemoteAppointmentPayload,
  RemoteClientPayload,
  RemotePhasePayload,
  RemoteProductPayload,
  RemoteSalePayload,
  RemoteServicePayload,
} from './remote-gateway';
import type { RemotePulledEntry } from './remote-snapshot';

/** A pulled Appointment or Sale names a Client / Appointment this device does not hold. */
export class RemoteReferenceMissingError extends Error {
  constructor(ref: SyncAggregateRef, readonly column: string) {
    super(`${ref.aggregateType} "${ref.aggregateId}" references a missing ${column}`);
    this.name = 'RemoteReferenceMissingError';
  }
}

function exists(db: SourisDatabase, table: string, id: string): boolean {
  return db.getFirstSync<{ readonly found: number }>(`SELECT 1 AS found FROM ${table} WHERE id = ?`, [id]) !== null;
}

/**
 * UPDATE the scoped parent row in place, or report that it must be inserted.
 * A row with this id stamped with another Business id is never overwritten.
 */
function updateScoped(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
  table: string,
  assignments: string,
  params: readonly (string | number | null)[],
): boolean {
  const updated = db.runSync(`UPDATE ${table} SET ${assignments} WHERE id = ? AND business_id = ?`, [
    ...params,
    ref.aggregateId,
    businessId,
  ]).changes;
  if (updated === 1) return true;
  if (exists(db, table, ref.aggregateId)) throw new LocalAggregateScopeError(ref);
  return false;
}

function applyClient(db: SourisDatabase, id: string, client: RemoteClientPayload): void {
  const params = [
    client.first_name,
    client.last_name,
    client.phone,
    client.email,
    client.birthday,
    client.notes,
    client.archived_at,
  ];
  const updated = db.runSync(
    'UPDATE clients SET first_name = ?, last_name = ?, phone = ?, email = ?, birthday = ?, notes = ?, archived_at = ? WHERE id = ?',
    [...params, id],
  ).changes;
  if (updated === 1) return;
  db.runSync(
    'INSERT INTO clients (first_name, last_name, phone, email, birthday, notes, archived_at, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [...params, id],
  );
}

function phaseParams(phase: RemotePhasePayload) {
  return [phase.position, phase.id, phase.name, phase.duration_minutes, toSqlBoolean(phase.requires_staff)] as const;
}

function applyService(db: SourisDatabase, businessId: string, ref: SyncAggregateRef, service: RemoteServicePayload): void {
  const params = [service.name, service.type, service.price_cents, toSqlBoolean(service.active)];
  if (!updateScoped(db, businessId, ref, 'services', 'name = ?, type = ?, price_cents = ?, active = ?', params)) {
    db.runSync(
      'INSERT INTO services (name, type, price_cents, active, id, business_id) VALUES (?, ?, ?, ?, ?, ?)',
      [...params, ref.aggregateId, businessId],
    );
  }
  db.runSync('DELETE FROM service_phases WHERE service_id = ?', [ref.aggregateId]);
  for (const phase of service.phases) {
    db.runSync(
      'INSERT INTO service_phases (service_id, position, id, name, duration_minutes, requires_staff) VALUES (?, ?, ?, ?, ?, ?)',
      [ref.aggregateId, ...phaseParams(phase)],
    );
  }
}

function applyProduct(db: SourisDatabase, businessId: string, ref: SyncAggregateRef, product: RemoteProductPayload): void {
  const params = [
    product.name,
    product.brand,
    product.category,
    product.barcode,
    product.price_cents,
    product.stock_quantity,
    toSqlBoolean(product.active),
  ];
  // `image_uri` is absent from both statements: kept on update, NULL on insert.
  if (
    !updateScoped(
      db,
      businessId,
      ref,
      'products',
      'name = ?, brand = ?, category = ?, barcode = ?, price_cents = ?, stock_quantity = ?, active = ?',
      params,
    )
  ) {
    db.runSync(
      'INSERT INTO products (name, brand, category, barcode, price_cents, stock_quantity, active, id, business_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [...params, ref.aggregateId, businessId],
    );
  }
}

function applyAppointment(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
  appointment: RemoteAppointmentPayload,
): void {
  if (!exists(db, 'clients', appointment.client_id)) throw new RemoteReferenceMissingError(ref, 'client_id');
  const params = [
    appointment.client_id,
    appointment.staff_member_id,
    appointment.start_at,
    appointment.status,
    appointment.notes,
    appointment.cancelled_at,
    appointment.cancelled_by,
    appointment.cancellation_reason,
    appointment.no_show_recorded_at,
    appointment.paid_at,
    appointment.card_amount_cents,
    appointment.cash_amount_cents,
    appointment.discount_percent,
    appointment.discount_amount_cents,
  ];
  if (
    !updateScoped(
      db,
      businessId,
      ref,
      'appointments',
      'client_id = ?, staff_member_id = ?, start_at = ?, status = ?, notes = ?, cancelled_at = ?, cancelled_by = ?, cancellation_reason = ?, no_show_recorded_at = ?, paid_at = ?, card_amount_cents = ?, cash_amount_cents = ?, discount_percent = ?, discount_amount_cents = ?',
      params,
    )
  ) {
    db.runSync(
      'INSERT INTO appointments (client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents, discount_percent, discount_amount_cents, id, business_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [...params, ref.aggregateId, businessId],
    );
  }
  // Removing the items cascades to their phases (the snapshot is replaced as a whole).
  db.runSync('DELETE FROM appointment_items WHERE appointment_id = ?', [ref.aggregateId]);
  for (const item of appointment.items) {
    db.runSync(
      'INSERT INTO appointment_items (appointment_id, id, item_order, service_id, service_option_id, service_name, service_type, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        ref.aggregateId,
        item.id,
        item.item_order,
        item.service_id,
        item.service_option_id,
        item.service_name,
        item.service_type,
        item.price_cents,
      ],
    );
    for (const phase of item.phases) {
      db.runSync(
        'INSERT INTO appointment_phases (appointment_id, appointment_item_id, position, id, name, duration_minutes, requires_staff) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ref.aggregateId, item.id, ...phaseParams(phase)],
      );
    }
  }
}

function applySale(db: SourisDatabase, businessId: string, ref: SyncAggregateRef, sale: RemoteSalePayload): void {
  if (sale.client_id !== null && !exists(db, 'clients', sale.client_id)) {
    throw new RemoteReferenceMissingError(ref, 'client_id');
  }
  if (sale.appointment_id !== null && !exists(db, 'appointments', sale.appointment_id)) {
    throw new RemoteReferenceMissingError(ref, 'appointment_id');
  }
  const params = [
    sale.client_id,
    sale.appointment_id,
    sale.completed_at,
    sale.paid_at,
    sale.card_amount_cents,
    sale.cash_amount_cents,
  ];
  if (
    !updateScoped(
      db,
      businessId,
      ref,
      'sales',
      'client_id = ?, appointment_id = ?, completed_at = ?, paid_at = ?, card_amount_cents = ?, cash_amount_cents = ?',
      params,
    )
  ) {
    db.runSync(
      'INSERT INTO sales (client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents, id, business_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [...params, ref.aggregateId, businessId],
    );
  }
  // Stock is NOT replayed: it travels with the PRODUCT aggregate, as stored.
  db.runSync('DELETE FROM sale_items WHERE sale_id = ?', [ref.aggregateId]);
  for (const item of sale.items) {
    db.runSync(
      'INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ref.aggregateId, item.id, item.position, item.product_id, item.product_name, item.unit_price_cents, item.quantity],
    );
  }
}

/**
 * Writes one LIVE remote aggregate (row + complete child set). Call inside
 * the caller's transaction. Throws for a tombstone (no payload), a missing
 * reference, or a local row scoped to another Business — nothing is then
 * meant to be committed.
 */
export function applyRemoteAggregate(db: SourisDatabase, businessId: string, entry: RemotePulledEntry): void {
  const ref: SyncAggregateRef = { aggregateType: entry.aggregateType, aggregateId: entry.aggregate.id };
  if (entry.aggregate.payload === undefined) {
    throw new RangeError(`applyRemoteAggregate: ${ref.aggregateType} "${ref.aggregateId}" is a tombstone`);
  }
  switch (entry.aggregateType) {
    case 'CLIENT':
      return applyClient(db, ref.aggregateId, entry.aggregate.payload);
    case 'SERVICE':
      return applyService(db, businessId, ref, entry.aggregate.payload);
    case 'PRODUCT':
      return applyProduct(db, businessId, ref, entry.aggregate.payload);
    case 'APPOINTMENT':
      return applyAppointment(db, businessId, ref, entry.aggregate.payload);
    case 'SALE':
      return applySale(db, businessId, ref, entry.aggregate.payload);
  }
}

export type RemoteTombstoneOutcome =
  /** The local row (and its children) was removed. */
  | 'DELETED'
  /** No local row: nothing to remove. */
  | 'ABSENT'
  /** Local history still references the row: NOT removed, nothing written. */
  | 'BLOCKED';

const PARENT_TABLE = {
  CLIENT: 'clients',
  SERVICE: 'services',
  PRODUCT: 'products',
  APPOINTMENT: 'appointments',
  SALE: 'sales',
} as const;

/**
 * Applies a remote tombstone with the local deletion semantics. Call inside
 * the caller's transaction. Catalog rows (Service, Product) and Sales carry
 * no guard — history keeps its own snapshots; a removed Sale restores no
 * stock here, the Product aggregate carries the resulting quantity.
 */
export function applyRemoteTombstone(db: SourisDatabase, ref: SyncAggregateRef): RemoteTombstoneOutcome {
  const table = PARENT_TABLE[ref.aggregateType];
  if (!exists(db, table, ref.aggregateId)) return 'ABSENT';
  if (
    ref.aggregateType === 'CLIENT' &&
    !canDeleteClientPermanently(countClientReferences(db, ref.aggregateId))
  ) {
    return 'BLOCKED';
  }
  if (
    ref.aggregateType === 'APPOINTMENT' &&
    !canDeleteAppointmentPermanently(countAppointmentReferences(db, ref.aggregateId))
  ) {
    return 'BLOCKED';
  }
  db.runSync(`DELETE FROM ${table} WHERE id = ?`, [ref.aggregateId]);
  return 'DELETED';
}
