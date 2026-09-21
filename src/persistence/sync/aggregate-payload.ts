// Souris — current local aggregate → remote payload (Cloud Sync V1C)
//
// The push worker never uploads an outbox snapshot: it reads the CURRENT
// aggregate from SQLite at push time, through this module. Rows are read
// raw (not through the domain mappers) so integer cents travel exactly as
// stored, with no euro round trip. The only conversions are the documented
// boundary ones (CLOUD_SYNC.md §3): 0/1 → boolean, ISO text → validated ISO
// instant, and the Business scope.
//
// Scope rule: a business-scoped row (services, appointments, products,
// sales) is pushed ONLY when its `business_id` is the bound Business. A row
// carrying another id is refused loudly — never pushed, never mistaken for a
// deleted aggregate. `clients` has no `business_id` column; the single local
// address book belongs to the bound Business (PERSISTENCE.md §4b).

import type { SourisDatabase } from '../database';
import { assertAmountCents, fromSqlBoolean, fromSqlInstant } from '../values';

import type { SyncAggregateRef } from './aggregate';
import type {
  RemoteAggregatePayload,
  RemoteAppointmentItemPayload,
  RemoteAppointmentPayload,
  RemoteCalendarBlockPayload,
  RemoteClientPayload,
  RemotePhasePayload,
  RemoteProductPayload,
  RemoteSaleItemPayload,
  RemoteSalePayload,
  RemoteServicePayload,
} from './remote-gateway';

/** The local row exists but belongs to another Business id than the bound one. */
export class LocalAggregateScopeError extends Error {
  constructor(ref: SyncAggregateRef) {
    super(`${ref.aggregateType} "${ref.aggregateId}" is not scoped to the bound Business`);
    this.name = 'LocalAggregateScopeError';
  }
}

interface PhaseRow {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly duration_minutes: number;
  readonly requires_staff: number;
}

function toInstant(value: string): string {
  return fromSqlInstant(value).toISOString();
}

function toOptionalInstant(value: string | null): string | null {
  return value === null ? null : toInstant(value);
}

function toOptionalCents(value: number | null, column: string): number | null {
  return value === null ? null : assertAmountCents(value, column);
}

function toPhase(row: PhaseRow): RemotePhasePayload {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    duration_minutes: row.duration_minutes,
    requires_staff: fromSqlBoolean(row.requires_staff),
  };
}

/** Refuses a row stamped with another Business id; a `null` row is simply not found. */
function assertScoped(
  row: { readonly business_id: string } | null,
  businessId: string,
  ref: SyncAggregateRef,
): void {
  if (row !== null && row.business_id !== businessId) throw new LocalAggregateScopeError(ref);
}

function readClient(db: SourisDatabase, id: string): RemoteClientPayload | undefined {
  const row = db.getFirstSync<{
    readonly first_name: string;
    readonly last_name: string | null;
    readonly phone: string | null;
    readonly email: string | null;
    readonly birthday: string | null;
    readonly notes: string | null;
    readonly archived_at: string | null;
  }>('SELECT first_name, last_name, phone, email, birthday, notes, archived_at FROM clients WHERE id = ?', [id]);
  if (!row) return undefined;
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    email: row.email,
    birthday: row.birthday,
    notes: row.notes,
    archived_at: toOptionalInstant(row.archived_at),
  };
}

function readService(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): RemoteServicePayload | undefined {
  const row = db.getFirstSync<{
    readonly business_id: string;
    readonly name: string;
    readonly type: string;
    readonly price_cents: number;
    readonly active: number;
  }>('SELECT business_id, name, type, price_cents, active FROM services WHERE id = ?', [ref.aggregateId]);
  assertScoped(row, businessId, ref);
  if (!row) return undefined;
  const phases = db.getAllSync<PhaseRow>(
    'SELECT id, position, name, duration_minutes, requires_staff FROM service_phases WHERE service_id = ? ORDER BY position',
    [ref.aggregateId],
  );
  return {
    name: row.name,
    type: row.type,
    price_cents: assertAmountCents(row.price_cents, 'services.price_cents'),
    active: fromSqlBoolean(row.active),
    phases: phases.map(toPhase),
  };
}

function readAppointment(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): RemoteAppointmentPayload | undefined {
  const row = db.getFirstSync<{
    readonly business_id: string;
    readonly client_id: string;
    readonly staff_member_id: string;
    readonly start_at: string;
    readonly status: string;
    readonly notes: string | null;
    readonly cancelled_at: string | null;
    readonly cancelled_by: string | null;
    readonly cancellation_reason: string | null;
    readonly no_show_recorded_at: string | null;
    readonly paid_at: string | null;
    readonly card_amount_cents: number | null;
    readonly cash_amount_cents: number | null;
    readonly discount_percent: number | null;
    readonly discount_amount_cents: number | null;
  }>(
    'SELECT business_id, client_id, staff_member_id, start_at, status, notes, cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at, paid_at, card_amount_cents, cash_amount_cents, discount_percent, discount_amount_cents FROM appointments WHERE id = ?',
    [ref.aggregateId],
  );
  assertScoped(row, businessId, ref);
  if (!row) return undefined;

  const phasesByItem = new Map<string, RemotePhasePayload[]>();
  for (const phase of db.getAllSync<PhaseRow & { readonly appointment_item_id: string }>(
    'SELECT appointment_item_id, id, position, name, duration_minutes, requires_staff FROM appointment_phases WHERE appointment_id = ? ORDER BY appointment_item_id, position',
    [ref.aggregateId],
  )) {
    const phases = phasesByItem.get(phase.appointment_item_id) ?? [];
    phases.push(toPhase(phase));
    phasesByItem.set(phase.appointment_item_id, phases);
  }

  const items: RemoteAppointmentItemPayload[] = db
    .getAllSync<{
      readonly id: string;
      readonly item_order: number;
      readonly service_id: string;
      readonly service_option_id: string | null;
      readonly service_name: string;
      readonly service_type: string;
      readonly price_cents: number;
    }>(
      'SELECT id, item_order, service_id, service_option_id, service_name, service_type, price_cents FROM appointment_items WHERE appointment_id = ? ORDER BY item_order',
      [ref.aggregateId],
    )
    .map((item) => ({
      id: item.id,
      item_order: item.item_order,
      service_id: item.service_id,
      service_option_id: item.service_option_id,
      service_name: item.service_name,
      service_type: item.service_type,
      price_cents: assertAmountCents(item.price_cents, 'appointment_items.price_cents'),
      phases: phasesByItem.get(item.id) ?? [],
    }));

  return {
    client_id: row.client_id,
    staff_member_id: row.staff_member_id,
    start_at: toInstant(row.start_at),
    status: row.status,
    notes: row.notes,
    cancelled_at: toOptionalInstant(row.cancelled_at),
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    no_show_recorded_at: toOptionalInstant(row.no_show_recorded_at),
    paid_at: toOptionalInstant(row.paid_at),
    card_amount_cents: toOptionalCents(row.card_amount_cents, 'appointments.card_amount_cents'),
    cash_amount_cents: toOptionalCents(row.cash_amount_cents, 'appointments.cash_amount_cents'),
    // Always sent, null included: an explicit null is how a removed discount
    // reaches the remote (a missing key means "a build that predates it").
    discount_percent: row.discount_percent,
    discount_amount_cents: toOptionalCents(
      row.discount_amount_cents,
      'appointments.discount_amount_cents',
    ),
    items,
  };
}

function readProduct(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): RemoteProductPayload | undefined {
  // `image_uri` is a device-local path: never selected, never uploaded (V1F).
  const row = db.getFirstSync<{
    readonly business_id: string;
    readonly name: string;
    readonly brand: string | null;
    readonly category: string | null;
    readonly barcode: string | null;
    readonly price_cents: number;
    readonly stock_quantity: number;
    readonly active: number;
  }>(
    'SELECT business_id, name, brand, category, barcode, price_cents, stock_quantity, active FROM products WHERE id = ?',
    [ref.aggregateId],
  );
  assertScoped(row, businessId, ref);
  if (!row) return undefined;
  return {
    name: row.name,
    brand: row.brand,
    category: row.category,
    barcode: row.barcode,
    price_cents: assertAmountCents(row.price_cents, 'products.price_cents'),
    stock_quantity: row.stock_quantity,
    active: fromSqlBoolean(row.active),
  };
}

function readSale(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): RemoteSalePayload | undefined {
  const row = db.getFirstSync<{
    readonly business_id: string;
    readonly client_id: string | null;
    readonly appointment_id: string | null;
    readonly completed_at: string;
    readonly paid_at: string | null;
    readonly card_amount_cents: number | null;
    readonly cash_amount_cents: number | null;
  }>(
    'SELECT business_id, client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents FROM sales WHERE id = ?',
    [ref.aggregateId],
  );
  assertScoped(row, businessId, ref);
  if (!row) return undefined;
  const items: RemoteSaleItemPayload[] = db
    .getAllSync<{
      readonly id: string;
      readonly position: number;
      readonly product_id: string;
      readonly product_name: string;
      readonly unit_price_cents: number;
      readonly quantity: number;
    }>(
      'SELECT id, position, product_id, product_name, unit_price_cents, quantity FROM sale_items WHERE sale_id = ? ORDER BY position',
      [ref.aggregateId],
    )
    .map((item) => ({
      id: item.id,
      position: item.position,
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price_cents: assertAmountCents(item.unit_price_cents, 'sale_items.unit_price_cents'),
      quantity: item.quantity,
    }));
  return {
    client_id: row.client_id,
    appointment_id: row.appointment_id,
    completed_at: toInstant(row.completed_at),
    paid_at: toOptionalInstant(row.paid_at),
    card_amount_cents: toOptionalCents(row.card_amount_cents, 'sales.card_amount_cents'),
    cash_amount_cents: toOptionalCents(row.cash_amount_cents, 'sales.cash_amount_cents'),
    items,
  };
}

function readCalendarBlock(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): RemoteCalendarBlockPayload | undefined {
  const row = db.getFirstSync<{
    readonly business_id: string;
    readonly staff_member_id: string;
    readonly start_at: string;
    readonly end_at: string;
    readonly reason: string;
  }>(
    'SELECT business_id, staff_member_id, start_at, end_at, reason FROM calendar_blocks WHERE id = ?',
    [ref.aggregateId],
  );
  assertScoped(row, businessId, ref);
  if (!row) return undefined;
  return {
    staff_member_id: row.staff_member_id,
    start_at: toInstant(row.start_at),
    end_at: toInstant(row.end_at),
    reason: row.reason,
  };
}

/**
 * The complete current aggregate (row + whole ordered child set), or
 * undefined when the row no longer exists locally. Throws
 * `LocalAggregateScopeError` for a row of another Business id and
 * `RangeError` for a stored value that is not valid canonical data.
 */
export function readAggregatePayload(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): RemoteAggregatePayload | undefined {
  switch (ref.aggregateType) {
    case 'CLIENT':
      return readClient(db, ref.aggregateId);
    case 'SERVICE':
      return readService(db, businessId, ref);
    case 'APPOINTMENT':
      return readAppointment(db, businessId, ref);
    case 'PRODUCT':
      return readProduct(db, businessId, ref);
    case 'SALE':
      return readSale(db, businessId, ref);
    case 'CALENDAR_BLOCK':
      return readCalendarBlock(db, businessId, ref);
  }
}
