// Souris — remote sync boundary (Cloud Sync V1C)
//
// The ONLY shape in which operational data leaves the device. Production
// binds it to the two Supabase RPCs of
// supabase/migrations/20260917120000_create_sync_push_functions.sql
// (src/infrastructure/supabase/sync-gateway.ts); tests bind it to an
// in-memory remote with the same semantics (testing/fake-sync-remote.ts).
//
// Payloads use the REMOTE column names and types (CLOUD_SYNC.md §3): integer
// cents copied as they are stored, real booleans, ISO-8601 instants, NULL for
// absent optionals. `products.image_uri` and `clients.birth_date` have no
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
  readonly phases: readonly RemotePhasePayload[];
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
  readonly items: readonly RemoteAppointmentItemPayload[];
}

export interface RemoteProductPayload {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly barcode: string | null;
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

export type RemoteAggregatePayload =
  | RemoteClientPayload
  | RemoteServicePayload
  | RemoteAppointmentPayload
  | RemoteProductPayload
  | RemoteSalePayload;

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
  | { readonly status: 'ABSENT' };

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
}
