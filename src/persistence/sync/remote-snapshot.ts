// Souris — remote read → validated snapshot (Cloud Sync V1D)
//
// Whatever `pullBusinessAggregates` returns is untrusted wire JSON. This
// module is the gate between it and SQLite: the WHOLE answer is validated
// before a single row is written, so a restore or a pull never leaves a
// half-understood aggregate behind. It is pure (no database, no network).
//
// Wire shape (supabase/migrations/20260917200000_create_sync_pull_function.sql):
//
//   { pulled_at, clients: [...], services: [...], products: [...],
//     appointments: [...], sales: [...] }
//
//   every aggregate   id, sync_version, deleted_at  + the push payload columns
//   services          + phases[]
//   appointments      + items[] each with phases[]
//   sales             + items[]
//
// Rules enforced here mirror the remote CHECKs and the local schema: exact
// non-negative integer cents, vocabularies, a payment is all three columns or
// none, a cancellation is `cancelled_at` + `cancelled_by` together, child ids
// and positions unique inside their parent, aggregate ids unique per family.
// A TOMBSTONE is validated for its identity and version only and carries no
// payload: its columns and children are never read as live data.
//
// Errors name the offending FIELD PATH, never a value: a remote row can hold
// a client's name or phone number.

import { parseBirthdayKey } from '@/domain/clients';

import type { SyncAggregateType } from './aggregate';
import type {
  RemoteAppointmentItemPayload,
  RemoteAppointmentPayload,
  RemoteBusinessSnapshot,
  RemoteClientPayload,
  RemotePhasePayload,
  RemoteProductPayload,
  RemotePulledAggregate,
  RemoteSaleItemPayload,
  RemoteSalePayload,
  RemoteServicePayload,
} from './remote-gateway';

/** The remote answer is not a dataset this device can store. `field` is a path, never a value. */
export class RemoteSnapshotInvalidError extends Error {
  constructor(readonly field: string) {
    super(`Remote snapshot is invalid at ${field}`);
    this.name = 'RemoteSnapshotInvalidError';
  }
}

type Json = Record<string, unknown>;

const SERVICE_TYPES = ['SERVICE', 'TECHNIQUE'];
const APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const CANCELLATION_ACTORS = ['CLIENT', 'BUSINESS'];

function fail(field: string): never {
  throw new RemoteSnapshotInvalidError(field);
}

function object(value: unknown, field: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(field);
  return value as Json;
}

function array(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(field);
  return value as readonly unknown[];
}

function text(row: Json, key: string, field: string): string {
  const value = row[key];
  if (typeof value !== 'string') fail(`${field}.${key}`);
  return value as string;
}

function nonEmptyText(row: Json, key: string, field: string): string {
  const value = text(row, key, field);
  if (value.trim().length === 0) fail(`${field}.${key}`);
  return value;
}

function optionalText(row: Json, key: string, field: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail(`${field}.${key}`);
  return value as string;
}

function oneOf(row: Json, key: string, field: string, vocabulary: readonly string[]): string {
  const value = text(row, key, field);
  if (!vocabulary.includes(value)) fail(`${field}.${key}`);
  return value;
}

function flag(row: Json, key: string, field: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') fail(`${field}.${key}`);
  return value as boolean;
}

function integer(row: Json, key: string, field: string, minimum: number): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(`${field}.${key}`);
  return value as number;
}

function optionalCents(row: Json, key: string, field: string): number | null {
  if (row[key] === null || row[key] === undefined) return null;
  return integer(row, key, field, 0);
}

/**
 * timestamptz → the local ISO-8601 UTC form. Postgres serializes microseconds
 * (`…00.123456+00:00`); everything the device ever pushed has millisecond
 * precision, so trimming the fraction restores the exact pushed instant.
 */
function toInstant(value: unknown, field: string): string {
  if (typeof value !== 'string') fail(field);
  const date = new Date((value as string).replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(date.getTime())) fail(field);
  return date.toISOString();
}

function instant(row: Json, key: string, field: string): string {
  return toInstant(row[key], `${field}.${key}`);
}

function optionalInstant(row: Json, key: string, field: string): string | null {
  if (row[key] === null || row[key] === undefined) return null;
  return instant(row, key, field);
}

/** `paid_at` + both amounts, or none of the three (the remote CHECK, and what the local mappers assume). */
function payment(
  row: Json,
  field: string,
): Pick<RemoteSalePayload, 'paid_at' | 'card_amount_cents' | 'cash_amount_cents'> {
  const paidAt = optionalInstant(row, 'paid_at', field);
  const card = optionalCents(row, 'card_amount_cents', field);
  const cash = optionalCents(row, 'cash_amount_cents', field);
  const complete = paidAt !== null && card !== null && cash !== null;
  const absent = paidAt === null && card === null && cash === null;
  if (!complete && !absent) fail(`${field}.paid_at`);
  return { paid_at: paidAt, card_amount_cents: card, cash_amount_cents: cash };
}

/** Parses a child list and refuses a repeated id or position inside the parent. */
function children<Child extends { readonly id: string }>(
  value: unknown,
  field: string,
  positionOf: (child: Child) => number,
  parse: (row: Json, field: string) => Child,
): Child[] {
  const ids = new Set<string>();
  const positions = new Set<number>();
  const parsed = array(value ?? [], field).map((entry, index) => {
    const child = parse(object(entry, `${field}[${index}]`), `${field}[]`);
    if (ids.has(child.id)) fail(`${field}[].id`);
    if (positions.has(positionOf(child))) fail(`${field}[].position`);
    ids.add(child.id);
    positions.add(positionOf(child));
    return child;
  });
  return parsed.sort((left, right) => positionOf(left) - positionOf(right));
}

function parsePhase(row: Json, field: string): RemotePhasePayload {
  return {
    id: nonEmptyText(row, 'id', field),
    position: integer(row, 'position', field, 0),
    name: text(row, 'name', field),
    duration_minutes: integer(row, 'duration_minutes', field, 0),
    requires_staff: flag(row, 'requires_staff', field),
  };
}

function parseClient(row: Json, field: string): RemoteClientPayload {
  const birthday = optionalText(row, 'birthday', field);
  // The local mapper parses the key on every load: refuse here what it could not read.
  if (birthday !== null && parseBirthdayKey(birthday) === undefined) fail(`${field}.birthday`);
  return {
    first_name: nonEmptyText(row, 'first_name', field),
    last_name: optionalText(row, 'last_name', field),
    phone: optionalText(row, 'phone', field),
    email: optionalText(row, 'email', field),
    birthday,
    // Absent on a remote that predates the column: no note, never a failure.
    notes: optionalText(row, 'notes', field),
    archived_at: optionalInstant(row, 'archived_at', field),
  };
}

function parseService(row: Json, field: string): RemoteServicePayload {
  return {
    name: text(row, 'name', field),
    type: oneOf(row, 'type', field, SERVICE_TYPES),
    price_cents: integer(row, 'price_cents', field, 0),
    active: flag(row, 'active', field),
    phases: children(row.phases, `${field}.phases`, (phase) => phase.position, parsePhase),
  };
}

function parseProduct(row: Json, field: string): RemoteProductPayload {
  return {
    name: text(row, 'name', field),
    brand: optionalText(row, 'brand', field),
    category: optionalText(row, 'category', field),
    barcode: optionalText(row, 'barcode', field),
    price_cents: integer(row, 'price_cents', field, 0),
    stock_quantity: integer(row, 'stock_quantity', field, 0),
    active: flag(row, 'active', field),
  };
}

function parseAppointmentItem(row: Json, field: string): RemoteAppointmentItemPayload {
  return {
    id: nonEmptyText(row, 'id', field),
    item_order: integer(row, 'item_order', field, 0),
    service_id: text(row, 'service_id', field),
    service_option_id: optionalText(row, 'service_option_id', field),
    service_name: text(row, 'service_name', field),
    service_type: oneOf(row, 'service_type', field, SERVICE_TYPES),
    price_cents: integer(row, 'price_cents', field, 0),
    phases: children(row.phases, `${field}.phases`, (phase) => phase.position, parsePhase),
  };
}

function parseAppointment(row: Json, field: string): RemoteAppointmentPayload {
  const cancelledAt = optionalInstant(row, 'cancelled_at', field);
  const cancelledBy =
    row.cancelled_by === null || row.cancelled_by === undefined
      ? null
      : oneOf(row, 'cancelled_by', field, CANCELLATION_ACTORS);
  if ((cancelledAt === null) !== (cancelledBy === null)) fail(`${field}.cancelled_at`);
  const reason = optionalText(row, 'cancellation_reason', field);
  if (reason !== null && cancelledAt === null) fail(`${field}.cancellation_reason`);
  return {
    client_id: nonEmptyText(row, 'client_id', field),
    staff_member_id: text(row, 'staff_member_id', field),
    start_at: instant(row, 'start_at', field),
    status: oneOf(row, 'status', field, APPOINTMENT_STATUSES),
    notes: optionalText(row, 'notes', field),
    cancelled_at: cancelledAt,
    cancelled_by: cancelledBy,
    cancellation_reason: reason,
    no_show_recorded_at: optionalInstant(row, 'no_show_recorded_at', field),
    ...payment(row, field),
    items: children(row.items, `${field}.items`, (item) => item.item_order, parseAppointmentItem),
  };
}

function parseSaleItem(row: Json, field: string): RemoteSaleItemPayload {
  return {
    id: nonEmptyText(row, 'id', field),
    position: integer(row, 'position', field, 0),
    product_id: text(row, 'product_id', field),
    product_name: text(row, 'product_name', field),
    unit_price_cents: integer(row, 'unit_price_cents', field, 0),
    quantity: integer(row, 'quantity', field, 1),
  };
}

function parseSale(row: Json, field: string): RemoteSalePayload {
  const recorded = payment(row, field);
  const appointmentId = optionalText(row, 'appointment_id', field);
  // An Appointment-linked Sale is settled by the Appointment checkout, never on its own.
  if (appointmentId !== null && recorded.paid_at !== null) fail(`${field}.paid_at`);
  return {
    client_id: optionalText(row, 'client_id', field),
    appointment_id: appointmentId,
    completed_at: instant(row, 'completed_at', field),
    ...recorded,
    items: children(row.items, `${field}.items`, (item) => item.position, parseSaleItem),
  };
}

function parseFamily<Payload>(
  value: unknown,
  field: string,
  parsePayload: (row: Json, field: string) => Payload,
): RemotePulledAggregate<Payload>[] {
  const ids = new Set<string>();
  return array(value, field).map((entry, index) => {
    const row = object(entry, `${field}[${index}]`);
    const id = nonEmptyText(row, 'id', `${field}[]`);
    if (ids.has(id)) fail(`${field}[].id`);
    ids.add(id);
    const syncVersion = integer(row, 'sync_version', `${field}[]`, 1);
    const deleted = optionalInstant(row, 'deleted_at', `${field}[]`) !== null;
    return { id, syncVersion, payload: deleted ? undefined : parsePayload(row, `${field}[]`) };
  });
}

/** Validates the WHOLE remote answer. Throws `RemoteSnapshotInvalidError`; never returns a partial snapshot. */
export function parseRemoteBusinessSnapshot(data: unknown): RemoteBusinessSnapshot {
  const root = object(data, 'snapshot');
  return {
    pulledAt: new Date(toInstant(root.pulled_at, 'snapshot.pulled_at')),
    clients: parseFamily(root.clients, 'clients', parseClient),
    services: parseFamily(root.services, 'services', parseService),
    products: parseFamily(root.products, 'products', parseProduct),
    appointments: parseFamily(root.appointments, 'appointments', parseAppointment),
    sales: parseFamily(root.sales, 'sales', parseSale),
  };
}

/**
 * A COMPLETE dataset must be closed over its own references: a live
 * Appointment or Sale names a live Client, a linked Sale names a live
 * Appointment. The local deletion guards (PERSISTENCE.md §7a, §7b) keep that
 * true on every device, so a dataset that breaks it is refused as a whole
 * rather than restored with history pointing at nothing.
 */
export function assertSnapshotReferences(snapshot: RemoteBusinessSnapshot): void {
  const live = <Payload>(family: readonly RemotePulledAggregate<Payload>[]) =>
    new Set(family.filter((aggregate) => aggregate.payload !== undefined).map((aggregate) => aggregate.id));
  const clients = live(snapshot.clients);
  const appointments = live(snapshot.appointments);
  for (const { payload } of snapshot.appointments) {
    if (payload && !clients.has(payload.client_id)) fail('appointments[].client_id');
  }
  for (const { payload } of snapshot.sales) {
    if (!payload) continue;
    if (payload.client_id !== null && !clients.has(payload.client_id)) fail('sales[].client_id');
    if (payload.appointment_id !== null && !appointments.has(payload.appointment_id)) {
      fail('sales[].appointment_id');
    }
  }
}

export type RemotePulledEntry =
  | { readonly aggregateType: 'CLIENT'; readonly aggregate: RemotePulledAggregate<RemoteClientPayload> }
  | { readonly aggregateType: 'SERVICE'; readonly aggregate: RemotePulledAggregate<RemoteServicePayload> }
  | { readonly aggregateType: 'PRODUCT'; readonly aggregate: RemotePulledAggregate<RemoteProductPayload> }
  | { readonly aggregateType: 'APPOINTMENT'; readonly aggregate: RemotePulledAggregate<RemoteAppointmentPayload> }
  | { readonly aggregateType: 'SALE'; readonly aggregate: RemotePulledAggregate<RemoteSalePayload> };

/**
 * Every aggregate of the snapshot in DEPENDENCY order — CLIENT, SERVICE,
 * PRODUCT, APPOINTMENT, SALE — and, inside a family, in the remote creation
 * order. Writing in this order keeps every reference resolvable; removing in
 * the reverse order keeps the deletion guards satisfiable.
 */
export function listSnapshotEntries(snapshot: RemoteBusinessSnapshot): readonly RemotePulledEntry[] {
  const tag =
    <Type extends SyncAggregateType>(aggregateType: Type) =>
    <Payload>(aggregate: RemotePulledAggregate<Payload>) => ({ aggregateType, aggregate });
  return [
    ...snapshot.clients.map(tag('CLIENT')),
    ...snapshot.services.map(tag('SERVICE')),
    ...snapshot.products.map(tag('PRODUCT')),
    ...snapshot.appointments.map(tag('APPOINTMENT')),
    ...snapshot.sales.map(tag('SALE')),
  ] as readonly RemotePulledEntry[];
}
