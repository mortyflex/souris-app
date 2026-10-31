// BeautIzzy — remote sync boundary (Cloud Sync V1C push, V1D pull / restore)
//
// The ONLY shape in which operational data leaves or reaches the device.
// Production binds it to the Supabase RPCs of
// supabase/migrations/20260917120000_create_sync_push_functions.sql and
// supabase/migrations/20260917200000_create_sync_pull_function.sql
// (src/infrastructure/supabase/sync-gateway.ts); tests bind it to an
// in-memory remote with the same semantics (testing/fake-sync-remote.ts).
//
// Payloads use the REMOTE column names and types (CLOUD_SYNC.md §3): integer
// cents copied as they are stored, real booleans, ISO-8601 instants, NULL for
// absent optionals. `products.image_uri` (the legacy device-local image) and `clients.birth_date` have no
// remote column and are never part of a payload. `business_id`, the
// aggregate id and the parent ids of children are NOT in the payload: the
// remote stamps them from the request, so a child can never be pushed under
// another parent or Business.

import type { SyncAggregateType, SyncOperation } from './aggregate';

export interface RemoteClientPayload {
  readonly first_name: string;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  /** Stable object path of the Client photo in the Business media storage, or null. */
  readonly photo_path: string | null;
  /**
   * Promotional SMS consent (SMS pivot Phase 2): OPTED_IN | OPTED_OUT, null
   * = UNKNOWN. The three consent keys travel together — always sent, nulls
   * included: a missing `sms_marketing_consent` key means "a build that
   * predates the consent" and keeps the stored value remotely.
   */
  readonly sms_marketing_consent: string | null;
  readonly sms_marketing_consent_updated_at: string | null;
  readonly sms_marketing_consent_source: string | null;
  readonly archived_at: string | null;
}

export interface RemotePhasePayload {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly duration_minutes: number;
  readonly requires_staff: boolean;
}

export interface RemoteServicePayload {
  readonly name: string;
  readonly type: string;
  readonly price_cents: number;
  readonly active: boolean;
  /**
   * Schema v17 / CLOUD_SYNC.md §27. A build that knows the fields always
   * SENDS both keys (a value, or null to clear). On a PULLED payload a key
   * is `undefined` when the remote predates the column: the local value is
   * then kept, never read as "cleared".
   */
  readonly category_id?: string | null;
  readonly description?: string | null;
  readonly phases: readonly RemotePhasePayload[];
}

/** A professional-defined catalogue category (CLOUD_SYNC.md §27). */
export interface RemoteServiceCategoryPayload {
  readonly name: string;
  readonly description: string | null;
  readonly position: number;
}

export interface RemoteAppointmentItemPayload {
  readonly id: string;
  readonly item_order: number;
  readonly service_id: string;
  readonly service_option_id: string | null;
  readonly service_name: string;
  readonly service_type: string;
  readonly price_cents: number;
  readonly phases: readonly RemotePhasePayload[];
}

export interface RemoteAppointmentPayload {
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
  /** Whole percent 1–50, or null. At most one of the two discount fields is set. */
  readonly discount_percent: number | null;
  /** Fixed discount in integer cents (>= 1), or null. */
  readonly discount_amount_cents: number | null;
  /**
   * Per-appointment client reminder override (Lot B). NULL = never explicitly
   * set, which the domain reads as enabled. Always sent, null included — a
   * missing key means "a build that predates the field" and keeps the stored
   * value remotely.
   */
  readonly client_reminder_enabled: boolean | null;
  readonly items: readonly RemoteAppointmentItemPayload[];
}

export interface RemoteProductPayload {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly barcode: string | null;
  /** Stable object path of the Product photo in the Business media storage, or null. */
  readonly photo_path: string | null;
  readonly price_cents: number;
  readonly stock_quantity: number;
  readonly active: boolean;
}

export interface RemoteSaleItemPayload {
  readonly id: string;
  readonly position: number;
  readonly product_id: string;
  readonly product_name: string;
  readonly unit_price_cents: number;
  readonly quantity: number;
}

export interface RemoteSalePayload {
  readonly client_id: string | null;
  readonly appointment_id: string | null;
  readonly completed_at: string;
  readonly paid_at: string | null;
  readonly card_amount_cents: number | null;
  readonly cash_amount_cents: number | null;
  readonly items: readonly RemoteSaleItemPayload[];
}

/**
 * A Calendar Block (personal unavailability): a staff member, an interval and
 * a reason. No client, price, payment or status — there is nothing financial
 * to carry (CLOUD_SYNC.md §20).
 */
export interface RemoteCalendarBlockPayload {
  readonly staff_member_id: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly reason: string;
}

/**
 * An Appointment deposit (« Acompte »): money received in advance for ONE
 * Appointment, in integer cents, by one method. VOIDED is a status carried by
 * the row — never a tombstone (CLOUD_SYNC.md §21).
 */
export interface RemoteAppointmentDepositPayload {
  readonly appointment_id: string;
  readonly amount_cents: number;
  readonly payment_method: string;
  readonly paid_at: string;
  readonly status: string;
  readonly voided_at: string | null;
  readonly recorded_at: string;
}

/** One affected line of a Sale adjustment, copied from the Sale snapshot. */
export interface RemoteSaleAdjustmentItemPayload {
  readonly id: string;
  readonly position: number;
  readonly sale_item_id: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly unit_price_cents: number;
  readonly quantity: number;
  readonly restock: boolean;
}

/**
 * A correction or a refund of ONE Sale (CLOUD_SYNC.md §28): its own
 * aggregate, never a child of the Sale. Integer cents; the status carries the
 * lifecycle (never a tombstone).
 */
export interface RemoteSaleAdjustmentPayload {
  readonly sale_id: string;
  readonly kind: string;
  readonly reverses_adjustment_id: string | null;
  readonly reason: string;
  readonly note: string | null;
  readonly staff_member_id: string;
  readonly refund_card_cents: number;
  readonly refund_cash_cents: number;
  readonly initial_status: string;
  readonly status: string;
  readonly refunded_at: string | null;
  readonly settled_at: string | null;
  readonly voided_at: string | null;
  readonly recorded_at: string;
  readonly items: readonly RemoteSaleAdjustmentItemPayload[];
}

export type RemoteAggregatePayload =
  | RemoteClientPayload
  | RemoteServicePayload
  | RemoteAppointmentPayload
  | RemoteProductPayload
  | RemoteSalePayload
  | RemoteCalendarBlockPayload
  | RemoteAppointmentDepositPayload
  | RemoteServiceCategoryPayload
  | RemoteSaleAdjustmentPayload;

/**
 * One aggregate as the remote holds it (V1D). `payload` is the same shape a
 * push sends — so a pulled aggregate and a pushed one compare field for field
 * — with every instant normalized to the local ISO-8601 UTC form. A remote
 * TOMBSTONE has no payload at all: whatever columns or children the remote
 * still stores for it must never be read as live data (CLOUD_SYNC.md §8).
 */
export interface RemotePulledAggregate<Payload> {
  readonly id: string;
  /** Server-assigned `sync_version` of the row (>= 1). */
  readonly syncVersion: number;
  readonly payload: Payload | undefined;
}

/**
 * A VALIDATED remote read of one Business (`parseRemoteBusinessSnapshot`):
 * the complete dataset (restore) or the aggregates changed since an instant
 * (incremental pull), tombstones included, each family in the remote
 * creation order. One consistent remote snapshot: every aggregate comes with
 * its complete ordered child set.
 */
export interface RemoteBusinessSnapshot {
  /** Server time of the read; the next incremental pull starts from it (minus an overlap). */
  readonly pulledAt: Date;
  readonly clients: readonly RemotePulledAggregate<RemoteClientPayload>[];
  readonly services: readonly RemotePulledAggregate<RemoteServicePayload>[];
  readonly products: readonly RemotePulledAggregate<RemoteProductPayload>[];
  readonly appointments: readonly RemotePulledAggregate<RemoteAppointmentPayload>[];
  readonly sales: readonly RemotePulledAggregate<RemoteSalePayload>[];
  /** Empty when the remote functions predate Calendar Blocks (no `calendar_blocks` key). */
  readonly calendarBlocks: readonly RemotePulledAggregate<RemoteCalendarBlockPayload>[];
  /** Empty when the remote functions predate deposits (no `appointment_deposits` key). */
  readonly appointmentDeposits: readonly RemotePulledAggregate<RemoteAppointmentDepositPayload>[];
  /** Empty when the remote functions predate service categories (no `service_categories` key). */
  readonly serviceCategories: readonly RemotePulledAggregate<RemoteServiceCategoryPayload>[];
  /**
   * Whether the remote answered with the `service_categories` family — the
   * proof that it stores categories and the two Service fields (§27).
   */
  readonly serviceCatalogue: boolean;
  /** Empty when the remote functions predate sale adjustments (no `sale_adjustments` key). */
  readonly saleAdjustments: readonly RemotePulledAggregate<RemoteSaleAdjustmentPayload>[];
  /**
   * Whether the remote answered with the `sale_adjustments` family — the proof
   * that it stores adjustments and enforces their ceilings (§28).
   */
  readonly saleAdjustmentsSupported: boolean;
}

export interface RemotePushRequest {
  /** The bound Business UUID. Every remote operation is scoped to it. */
  readonly businessId: string;
  readonly aggregateType: SyncAggregateType;
  readonly aggregateId: string;
  readonly operation: SyncOperation;
  /** `sync_state.remote_version`; undefined = this device never acknowledged the aggregate. */
  readonly expectedVersion: number | undefined;
  /** The CURRENT local aggregate for an UPSERT; undefined for a DELETE. */
  readonly payload: RemoteAggregatePayload | undefined;
}

export type RemotePushResult =
  /** The remote now holds the pushed state at `syncVersion` (server-assigned). */
  | { readonly status: 'APPLIED'; readonly syncVersion: number }
  /** The remote is at a revision this device never acknowledged. NOTHING was written. */
  | { readonly status: 'CONFLICT'; readonly remoteVersion: number | undefined }
  /** DELETE of an aggregate the remote never held: no tombstone was created. */
  | { readonly status: 'ABSENT' }
  /**
   * The write would leave an Appointment with more ACTIVE deposits than its
   * expected total (CLOUD_SYNC.md §21.2). NOTHING was written: the device keeps
   * its record, the entry stays pending, and the conflict is surfaced.
   */
  | {
      readonly status: 'FINANCIAL_CONFLICT';
      readonly appointmentId: string | undefined;
      readonly expectedTotalCents: number;
      readonly activeDepositTotalCents: number;
    }
  /**
   * The write would break the refund ceilings or the immutability of a Sale
   * adjustment (CLOUD_SYNC.md §28): more money or units than the Sale allows,
   * a settled record changed, a second reversal. NOTHING was written. The
   * device keeps its record, pending and shown as refused.
   */
  | { readonly status: 'ADJUSTMENT_CONFLICT'; readonly saleId: string | undefined; readonly reason: string }
  /**
   * The owner holds no verified Plus entitlement, so the server refused the
   * write (BeautIzzy Plus Phase 6.5C — a server behaviour to come; the client
   * is prepared, CLOUD_SYNC.md §26). NOTHING was written. A per-Business
   * restriction, not a failure of this aggregate: the entry stays pending
   * untouched, the Business's push pass goes on hold (entitlement-hold.ts)
   * and the pull half of the run proceeds as usual.
   */
  | { readonly status: 'ENTITLEMENT_REQUIRED' };

export type SyncRemoteFailureCode =
  /** No connectivity / transport failure. The run stops; nothing is lost. */
  | 'NETWORK'
  /** No valid session, or the signed-in user does not own the Business. The run stops. */
  | 'FORBIDDEN'
  /** The remote refused THIS aggregate (constraint, foreign key…). Other aggregates continue. */
  | 'REJECTED'
  | 'UNKNOWN';

/**
 * A remote failure with a stable code. `detail` is a machine code only (a
 * Postgres SQLSTATE such as `23503`) — never a server message, which may
 * quote row values.
 */
export class SyncRemoteError extends Error {
  readonly code: SyncRemoteFailureCode;
  readonly detail: string | undefined;

  constructor(code: SyncRemoteFailureCode, detail?: string) {
    super(`Sync remote failure: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'SyncRemoteError';
    this.code = code;
    this.detail = detail;
  }
}

export interface SyncRemoteGateway {
  /** Top-level aggregate rows the remote holds for the Business, tombstones included. Throws `SyncRemoteError`. */
  countBusinessAggregates(businessId: string): Promise<number>;
  /** Writes ONE aggregate atomically, conditionally on `expectedVersion`. Throws `SyncRemoteError`. */
  pushAggregate(request: RemotePushRequest): Promise<RemotePushResult>;
  /**
   * Reads the aggregates of the Business changed after `since` (undefined =
   * the COMPLETE dataset), tombstones included, in ONE consistent remote
   * snapshot. Returns the UNVALIDATED wire JSON: nothing of it may touch
   * SQLite before `parseRemoteBusinessSnapshot` accepted the whole of it.
   * Throws `SyncRemoteError`.
   */
  pullBusinessAggregates(businessId: string, since: Date | undefined): Promise<unknown>;
}
