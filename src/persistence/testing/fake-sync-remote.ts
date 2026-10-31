// BeautIzzy — in-memory remote for sync tests (never imported by app code)
//
// Reproduces the CONTRACT of `public.sync_push_aggregate` /
// `public.sync_count_business_aggregates`
// (supabase/migrations/20260917120000_create_sync_push_functions.sql), which
// is verified against real Postgres by the SQL harness (CLOUD_SYNC.md §13):
//
//   * owner-only: a Business the signed-in user does not own → FORBIDDEN;
//   * server-assigned sync_version: 1 on insert, +1 on a MEANINGFUL change,
//     unchanged when the pushed state is identical (tombstone included);
//   * version mismatch + different state → CONFLICT, nothing written;
//   * DELETE → tombstone; no row → ABSENT; already tombstoned → same version;
//   * composite foreign keys: an Appointment / Sale whose Client (or a Sale
//     whose Appointment) the remote does not hold is REJECTED (23503);
//   * the financial invariant (CLOUD_SYNC.md §21.2): a write that would leave an
//     Appointment with more ACTIVE deposits than its expected total is refused
//     with FINANCIAL_CONFLICT and NOTHING is written — the same rule as
//     `sync_appointment_deposit_breach`, on the same authoritative state.
//
// …and the CONTRACT of `public.sync_pull_business_aggregates`
// (supabase/migrations/20260917200000_create_sync_pull_function.sql):
//
//   * owner-only, like the push;
//   * returns the WIRE JSON — `pulled_at` + the seven families (`calendar_blocks`
//     since 20260923120000, `appointment_deposits` since 20260924120000), each aggregate
//     as `{ id, sync_version, deleted_at, …payload columns, children }`, in
//     creation order, tombstones included — instants as ISO-8601 UTC text
//     with milliseconds, the fixed form `sync_instant_text` produces;
//   * `since` filters on the server `updated_at` (strictly greater).
//
// …and the service catalogue migration
// (supabase/migrations/20261010120000_add_service_categories_and_descriptions.sql,
// CLOUD_SYNC.md §27): a `service_categories` family, and two SERVICE keys a
// push that omits keeps as stored. `serviceCatalogue: false` (or
// `setServiceCatalogue(false)`) models a remote that PREDATES it: the two
// SERVICE keys are silently dropped (`jsonb_to_record`), a SERVICE_CATEGORY
// push is rejected (22023, unknown aggregate type), and the pull carries no
// `service_categories` key and no SERVICE catalogue keys.
//
// …and the sale adjustment migration
// (supabase/migrations/20261011120000_create_sale_adjustments.sql, CLOUD_SYNC.md
// §28): a `sale_adjustments` family; a SALE_ADJUSTMENT push whose Sale the
// remote does not hold is REJECTED (23503); a write that would give back more
// money or units than the Sale allows, change an immutable field or a final
// status, or reverse a refund twice answers ADJUSTMENT_CONFLICT and writes
// NOTHING; any change or tombstone of a Sale that holds an adjustment answers
// CONFLICT (the status every build knows) and writes nothing.
// `saleAdjustments: false` (or `setSaleAdjustments(false)`) models a remote
// that PREDATES it: the type is rejected (22023) and the pull has no key.
//
// The server clock is logical: it starts at `FAKE_REMOTE_EPOCH` and advances
// one second per write and per read; `advanceClock` jumps it.
//
// Test hooks: `failNext` (throw before writing), `loseNextResponse` (write,
// then throw NETWORK — the acknowledgement is lost), `beforePush` (run code
// while the upload is "in flight", e.g. a local mutation).

import type { SyncAggregateType } from '../sync/aggregate';
import {
  SyncRemoteError,
  type RemoteAggregatePayload,
  type RemotePushRequest,
  type RemotePushResult,
  type SyncRemoteGateway,
} from '../sync/remote-gateway';

export interface FakeRemoteAggregate {
  readonly payload: RemoteAggregatePayload;
  readonly syncVersion: number;
  readonly deleted: boolean;
  /** Server clock (ms) of the insert and of the last meaningful change. */
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const FAKE_REMOTE_EPOCH = Date.parse('2026-09-01T00:00:00.000Z');

export interface FakeSyncRemote extends SyncRemoteGateway {
  readonly requests: readonly RemotePushRequest[];
  readonly countCalls: number;
  find(businessId: string, aggregateType: SyncAggregateType, aggregateId: string): FakeRemoteAggregate | undefined;
  list(businessId: string): readonly (FakeRemoteAggregate & { readonly key: string })[];
  /** Writes a row as ANOTHER device would (bumps the version like any change). */
  writeFromElsewhere(
    businessId: string,
    aggregateType: SyncAggregateType,
    aggregateId: string,
    payload: RemoteAggregatePayload,
  ): number;
  /** Tombstones a row as ANOTHER device would. Returns the tombstone version. */
  tombstoneFromElsewhere(businessId: string, aggregateType: SyncAggregateType, aggregateId: string): number;
  /** The `since` of every pull received, in order (undefined = complete dataset). */
  readonly pulls: readonly (Date | undefined)[];
  /** Replaces the NEXT pull answer with arbitrary wire JSON (validation tests). */
  answerNextPullWith(data: unknown): void;
  /** Runs while a pull is "in flight", before the answer is built (e.g. a local mutation). */
  beforePull(hook: (() => void) | undefined): void;
  /** Migrates (true) or un-migrates (false) the modelled remote for the service catalogue fields. */
  setServiceCatalogue(enabled: boolean): void;
  /** Migrates (true) or un-migrates (false) the modelled remote for sale adjustments. */
  setSaleAdjustments(enabled: boolean): void;
  /** Moves the logical server clock forward. */
  advanceClock(ms: number): void;
  /** Forgets the push and pull logs (not the rows): lets a test start counting after its setup. */
  clearRequests(): void;
  failNext(error: SyncRemoteError, times?: number): void;
  loseNextResponse(): void;
  beforePush(hook: ((request: RemotePushRequest) => void) | undefined): void;
  /**
   * The server behaviour of BeautIzzy Plus Phase 6.5C (CLOUD_SYNC.md §26):
   * while `refused` is true, every push of an OWNED Business answers
   * `ENTITLEMENT_REQUIRED` and writes nothing (ownership is still checked
   * first; pulls are unaffected) — except a CLIENT upsert that only withdraws
   * an existing client's promotional SMS consent, which is applied (step 8,
   * §26.3). Off by default: the deployed server's switch is disabled.
   */
  refuseEntitlement(refused: boolean): void;
}

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function referenceError(
  rows: Map<string, FakeRemoteAggregate>,
  request: RemotePushRequest,
): SyncRemoteError | undefined {
  const payload = request.payload as { client_id?: string | null; appointment_id?: string | null };
  if (request.aggregateType === 'SALE_ADJUSTMENT') {
    const saleId = (request.payload as { sale_id?: string }).sale_id;
    const sale = saleId === undefined ? undefined : rows.get(`SALE/${saleId}`);
    return sale && !sale.deleted ? undefined : new SyncRemoteError('REJECTED', '23503');
  }
  if (request.aggregateType === 'APPOINTMENT_DEPOSIT') {
    return payload.appointment_id != null && rows.has(`APPOINTMENT/${payload.appointment_id}`)
      ? undefined
      : new SyncRemoteError('REJECTED', '23503');
  }
  if (request.aggregateType !== 'APPOINTMENT' && request.aggregateType !== 'SALE') return undefined;
  if (payload.client_id != null && !rows.has(`CLIENT/${payload.client_id}`)) {
    return new SyncRemoteError('REJECTED', '23503');
  }
  if (
    request.aggregateType === 'SALE' &&
    payload.appointment_id != null &&
    !rows.has(`APPOINTMENT/${payload.appointment_id}`)
  ) {
    return new SyncRemoteError('REJECTED', '23503');
  }
  return undefined;
}


interface WireAdjustment {
  readonly sale_id: string;
  readonly kind: string;
  readonly reason?: string;
  readonly refunded_at?: string | null;
  readonly reverses_adjustment_id: string | null;
  readonly status: string;
  readonly refund_card_cents: number;
  readonly refund_cash_cents: number;
  readonly items: readonly { readonly sale_item_id: string; readonly quantity: number }[];
}

/** The fields a stored adjustment may never change; only the status and its instants move. */
const IMMUTABLE_ADJUSTMENT_KEYS = [
  'sale_id',
  'kind',
  'reverses_adjustment_id',
  'reason',
  'note',
  'staff_member_id',
  'refund_card_cents',
  'refund_cash_cents',
  'initial_status',
  'recorded_at',
  'items',
] as const;

/** `sync_sale_adjustment_transition_allowed`: same, PENDING → SETTLED, PENDING → VOIDED. */
function isAllowedAdjustmentTransition(from: string, to: string): boolean {
  return from === to || (from === 'PENDING' && (to === 'SETTLED' || to === 'VOIDED'));
}

/**
 * `sync_sale_adjustment_breach`: the reason the adjustments of ONE Sale break
 * its ceilings on the state the remote holds, or undefined.
 */
function saleAdjustmentBreach(rows: Map<string, FakeRemoteAggregate>, saleId: string): string | undefined {
  const saleRow = rows.get(`SALE/${saleId}`);
  const adjustments: [string, WireAdjustment][] = [];
  for (const [key, row] of rows) {
    if (!key.startsWith('SALE_ADJUSTMENT/') || row.deleted) continue;
    const adjustment = row.payload as unknown as WireAdjustment;
    if (adjustment.sale_id === saleId) adjustments.push([key.slice('SALE_ADJUSTMENT/'.length), adjustment]);
  }
  if (adjustments.length === 0) return undefined;
  if (!saleRow || saleRow.deleted) return 'SALE_HAS_ADJUSTMENTS';
  const sale = saleRow.payload as unknown as {
    readonly appointment_id: string | null;
    readonly card_amount_cents: number | null;
    readonly cash_amount_cents: number | null;
    readonly items: readonly { readonly id: string; readonly unit_price_cents: number; readonly quantity: number }[];
  };
  const base =
    sale.appointment_id !== null
      ? sale.items.reduce((total, item) => total + item.unit_price_cents * item.quantity, 0)
      : (sale.card_amount_cents ?? 0) + (sale.cash_amount_cents ?? 0);
  const reversed = new Map<string, number>();
  for (const [, adjustment] of adjustments) {
    if (adjustment.kind !== 'REVERSAL' || adjustment.status === 'VOIDED' || !adjustment.reverses_adjustment_id) continue;
    reversed.set(adjustment.reverses_adjustment_id, (reversed.get(adjustment.reverses_adjustment_id) ?? 0) + 1);
  }
  for (const [, adjustment] of adjustments) {
    if (adjustment.kind !== 'REVERSAL' || !adjustment.reverses_adjustment_id) continue;
    const target = adjustments.find(([id]) => id === adjustment.reverses_adjustment_id)?.[1];
    if (!target || target.kind !== 'REFUND' || target.status !== 'SETTLED') return 'REVERSAL';
    if ((reversed.get(adjustment.reverses_adjustment_id) ?? 0) > 1) return 'REVERSAL';
    const total = (value: WireAdjustment) => value.refund_card_cents + value.refund_cash_cents;
    if (total(target) !== total(adjustment)) return 'REVERSAL';
    if (
      adjustment.reason === 'RECORDED_IN_ERROR' &&
      (target.refund_card_cents !== adjustment.refund_card_cents ||
        target.refund_cash_cents !== adjustment.refund_cash_cents ||
        target.refunded_at !== adjustment.refunded_at)
    ) {
      return 'REVERSAL';
    }
    if (adjustment.reason === 'REFUND_RETURNED' && Date.parse(adjustment.refunded_at ?? '') < Date.parse(target.refunded_at ?? '')) {
      return 'REVERSAL';
    }
  }
  let committed = 0;
  const units = new Map<string, number>();
  for (const [id, adjustment] of adjustments) {
    if (adjustment.kind !== 'REFUND' || adjustment.status === 'VOIDED' || reversed.has(id)) continue;
    committed += adjustment.refund_card_cents + adjustment.refund_cash_cents;
    for (const item of adjustment.items) units.set(item.sale_item_id, (units.get(item.sale_item_id) ?? 0) + item.quantity);
  }
  if (committed > base) return 'CEILING';
  for (const [saleItemId, quantity] of units) {
    const line = sale.items.find((item) => item.id === saleItemId);
    if (!line || quantity > line.quantity) return 'UNITS';
  }
  return undefined;
}

/** The ADJUSTMENT_CONFLICT answer a write of this aggregate would leave behind, or undefined. */
/** Whether the remote holds a live adjustment of this Sale (the Sale is then frozen). */
function hasLiveAdjustment(rows: Map<string, FakeRemoteAggregate>, saleId: string): boolean {
  for (const [key, row] of rows) {
    if (key.startsWith('SALE_ADJUSTMENT/') && !row.deleted && (row.payload as unknown as WireAdjustment).sale_id === saleId) {
      return true;
    }
  }
  return false;
}

function adjustmentConflict(
  rows: Map<string, FakeRemoteAggregate>,
  request: RemotePushRequest,
  previous: FakeRemoteAggregate | undefined,
): RemotePushResult | undefined {
  if (request.aggregateType !== 'SALE_ADJUSTMENT') return undefined;
  const saleId = ((request.payload ?? previous?.payload) as unknown as WireAdjustment | undefined)?.sale_id;
  if (saleId === undefined) return undefined;
  const reason = saleAdjustmentBreach(rows, saleId);
  return reason === undefined ? undefined : { status: 'ADJUSTMENT_CONFLICT', saleId, reason };
}

/** The expected total of one Appointment as the remote holds it (items − discount + linked Sale lines). */
function remoteExpectedTotalCents(rows: Map<string, FakeRemoteAggregate>, appointmentId: string): number {
  const appointment = rows.get(`APPOINTMENT/${appointmentId}`);
  if (!appointment || appointment.deleted) return 0;
  const payload = appointment.payload as {
    readonly items?: readonly { readonly price_cents: number }[];
    readonly discount_percent?: number | null;
    readonly discount_amount_cents?: number | null;
  };
  const gross = (payload.items ?? []).reduce((total, item) => total + item.price_cents, 0);
  const requested =
    payload.discount_percent != null
      ? Math.floor((gross * payload.discount_percent + 50) / 100)
      : (payload.discount_amount_cents ?? 0);
  let products = 0;
  for (const [key, row] of rows) {
    if (!key.startsWith('SALE/') || row.deleted) continue;
    const sale = row.payload as {
      readonly appointment_id?: string | null;
      readonly items?: readonly { readonly unit_price_cents: number; readonly quantity: number }[];
    };
    if (sale.appointment_id !== appointmentId) continue;
    products += (sale.items ?? []).reduce((total, item) => total + item.unit_price_cents * item.quantity, 0);
  }
  return gross - Math.min(requested, gross) + products;
}

function remoteActiveDepositCents(rows: Map<string, FakeRemoteAggregate>, appointmentId: string): number {
  let total = 0;
  for (const [key, row] of rows) {
    if (!key.startsWith('APPOINTMENT_DEPOSIT/') || row.deleted) continue;
    const deposit = row.payload as {
      readonly appointment_id?: string;
      readonly amount_cents?: number;
      readonly status?: string;
    };
    if (deposit.appointment_id !== appointmentId || deposit.status !== 'ACTIVE') continue;
    total += deposit.amount_cents ?? 0;
  }
  return total;
}

/** The FINANCIAL_CONFLICT answer, or undefined. COMPLETED and absent Appointments are out of scope. */
function financialBreach(
  rows: Map<string, FakeRemoteAggregate>,
  appointmentId: string | undefined,
): RemotePushResult | undefined {
  if (appointmentId === undefined) return undefined;
  const appointment = rows.get(`APPOINTMENT/${appointmentId}`);
  if (!appointment || appointment.deleted) return undefined;
  if ((appointment.payload as { readonly status?: string }).status === 'COMPLETED') return undefined;
  const expectedTotalCents = remoteExpectedTotalCents(rows, appointmentId);
  const activeDepositTotalCents = remoteActiveDepositCents(rows, appointmentId);
  if (activeDepositTotalCents <= expectedTotalCents) return undefined;
  return { status: 'FINANCIAL_CONFLICT', appointmentId, expectedTotalCents, activeDepositTotalCents };
}

/** The Appointment whose invariant a write of this aggregate may affect. */
function affectedAppointmentId(
  rows: Map<string, FakeRemoteAggregate>,
  request: RemotePushRequest,
): string | undefined {
  if (request.aggregateType === 'APPOINTMENT') return request.aggregateId;
  if (request.aggregateType === 'APPOINTMENT_DEPOSIT' || request.aggregateType === 'SALE') {
    const payload = (request.payload ?? rows.get(`${request.aggregateType}/${request.aggregateId}`)?.payload) as
      | { readonly appointment_id?: string | null }
      | undefined;
    return payload?.appointment_id ?? undefined;
  }
  return undefined;
}

const SERVICE_CATALOGUE_KEYS = ['category_id', 'description'] as const;

export function createFakeSyncRemote(
  ownedBusinessIds: readonly string[],
  options: { readonly serviceCatalogue?: boolean; readonly saleAdjustments?: boolean } = {},
): FakeSyncRemote {
  let serviceCatalogue = options.serviceCatalogue ?? true;
  let saleAdjustments = options.saleAdjustments ?? true;
  const businesses = new Map<string, Map<string, FakeRemoteAggregate>>();
  const requests: RemotePushRequest[] = [];
  const failures: SyncRemoteError[] = [];
  let loseResponse = false;
  let entitlementRefused = false;
  let countCalls = 0;
  let hook: ((request: RemotePushRequest) => void) | undefined;
  let pullHook: (() => void) | undefined;
  let nextPullAnswer: { readonly data: unknown } | undefined;
  const pulls: (Date | undefined)[] = [];
  let clock = FAKE_REMOTE_EPOCH;

  function tick(): number {
    clock += 1000;
    return clock;
  }

  /** The fixed wire form of `public.sync_instant_text`: UTC, milliseconds, `Z`. */
  function toWireInstant(value: number | string | null): string | null {
    return value === null ? null : new Date(value).toISOString();
  }

  const INSTANT_COLUMNS = [
    'archived_at',
    'start_at',
    'end_at',
    'cancelled_at',
    'no_show_recorded_at',
    'paid_at',
    'completed_at',
    'voided_at',
    'recorded_at',
    'refunded_at',
    'settled_at',
  ];

  function toWireAggregate(key: string, row: FakeRemoteAggregate): Record<string, unknown> {
    const columns: Record<string, unknown> = { ...clone(row.payload) };
    for (const column of INSTANT_COLUMNS) {
      if (typeof columns[column] === 'string') columns[column] = toWireInstant(columns[column] as string);
    }
    return {
      ...columns,
      id: key.slice(key.indexOf('/') + 1),
      sync_version: row.syncVersion,
      deleted_at: row.deleted ? toWireInstant(row.updatedAt) : null,
    };
  }

  function rowsOf(businessId: string): Map<string, FakeRemoteAggregate> {
    if (!ownedBusinessIds.includes(businessId)) throw new SyncRemoteError('FORBIDDEN', '42501');
    let rows = businesses.get(businessId);
    if (!rows) {
      rows = new Map();
      businesses.set(businessId, rows);
    }
    return rows;
  }

  const CONSENT_KEYS = ['sms_marketing_consent', 'sms_marketing_consent_updated_at', 'sms_marketing_consent_source'];

  /** The server's narrow consent-withdrawal write, or undefined when the request is not exactly one. */
  function applyConsentWithdrawal(
    rows: Map<string, FakeRemoteAggregate>,
    request: RemotePushRequest,
  ): RemotePushResult | undefined {
    if (request.aggregateType !== 'CLIENT' || request.operation !== 'UPSERT' || request.payload === undefined) return undefined;
    const payload = request.payload as unknown as Record<string, unknown>;
    if (payload.sms_marketing_consent !== 'OPTED_OUT') return undefined;
    if (typeof payload.sms_marketing_consent_updated_at !== 'string' || typeof payload.sms_marketing_consent_source !== 'string') return undefined;
    const remote = rows.get(`CLIENT/${request.aggregateId}`);
    if (!remote || remote.deleted) return undefined;
    const stored = remote.payload as unknown as Record<string, unknown>;
    for (const key of Object.keys(payload)) {
      if (CONSENT_KEYS.includes(key)) continue;
      if (JSON.stringify(payload[key] ?? null) !== JSON.stringify(stored[key] ?? null)) return undefined;
    }
    const identical = CONSENT_KEYS.every((key) => stored[key] === payload[key]);
    if (identical) return { status: 'APPLIED', syncVersion: remote.syncVersion };
    const next = { ...stored };
    for (const key of CONSENT_KEYS) next[key] = payload[key];
    const written: FakeRemoteAggregate = { ...remote, payload: next as unknown as FakeRemoteAggregate['payload'], syncVersion: remote.syncVersion + 1, updatedAt: tick() };
    rows.set(`CLIENT/${request.aggregateId}`, written);
    return { status: 'APPLIED', syncVersion: written.syncVersion };
  }

  /**
   * What the server would store from this payload: on a migrated remote a
   * SERVICE key the push omits keeps its stored value (null when new); on an
   * unmigrated one the two keys are dropped.
   */
  function storedPayload(
    aggregateType: SyncAggregateType,
    payload: RemoteAggregatePayload,
    remote: FakeRemoteAggregate | undefined,
  ): RemoteAggregatePayload {
    if (aggregateType !== 'SERVICE') return clone(payload);
    const next: Record<string, unknown> = { ...clone(payload) };
    for (const column of SERVICE_CATALOGUE_KEYS) {
      if (!serviceCatalogue) delete next[column];
      else if (!(column in next)) next[column] = (remote?.payload as Record<string, unknown> | undefined)?.[column] ?? null;
    }
    return next as unknown as RemoteAggregatePayload;
  }

  function apply(original: RemotePushRequest): RemotePushResult {
    if (original.aggregateType === 'SERVICE_CATEGORY' && !serviceCatalogue) {
      rowsOf(original.businessId); // the owner check comes first, as on the server
      throw new SyncRemoteError('REJECTED', '22023');
    }
    if (original.aggregateType === 'SALE_ADJUSTMENT' && !saleAdjustments) {
      rowsOf(original.businessId);
      throw new SyncRemoteError('REJECTED', '22023');
    }
    const rows = rowsOf(original.businessId);
    const key = `${original.aggregateType}/${original.aggregateId}`;
    const remote = rows.get(key);
    const request: RemotePushRequest =
      original.payload === undefined
        ? original
        : { ...original, payload: storedPayload(original.aggregateType, original.payload, remote) };
    const versionMatches = request.expectedVersion === remote?.syncVersion;

    if (request.operation === 'DELETE') {
      if (!remote) return { status: 'ABSENT' };
      if (remote.deleted) return { status: 'APPLIED', syncVersion: remote.syncVersion };
      if (!versionMatches) return { status: 'CONFLICT', remoteVersion: remote.syncVersion };
      if (request.aggregateType === 'SALE_ADJUSTMENT') {
        const saleId = (remote.payload as unknown as WireAdjustment).sale_id;
        return { status: 'ADJUSTMENT_CONFLICT', saleId, reason: 'IMMUTABLE' };
      }
      // A Sale that holds adjustments is frozen: CONFLICT, the status every build knows.
      if (request.aggregateType === 'SALE' && hasLiveAdjustment(rows, request.aggregateId)) {
        return { status: 'CONFLICT', remoteVersion: remote.syncVersion };
      }
      if (request.aggregateType === 'APPOINTMENT' && remoteActiveDepositCents(rows, request.aggregateId) > 0) {
        return {
          status: 'FINANCIAL_CONFLICT',
          appointmentId: request.aggregateId,
          expectedTotalCents: remoteExpectedTotalCents(rows, request.aggregateId),
          activeDepositTotalCents: remoteActiveDepositCents(rows, request.aggregateId),
        };
      }
      const appointmentId = affectedAppointmentId(rows, request);
      const tombstone = { ...remote, deleted: true, syncVersion: remote.syncVersion + 1, updatedAt: tick() };
      rows.set(key, tombstone);
      const breach = financialBreach(rows, appointmentId) ?? adjustmentConflict(rows, request, remote);
      if (breach) {
        rows.set(key, remote); // nothing is written
        return breach;
      }
      return { status: 'APPLIED', syncVersion: tombstone.syncVersion };
    }

    if (request.payload === undefined) throw new SyncRemoteError('REJECTED', '22023');
    if (!remote) {
      if (request.expectedVersion !== undefined) return { status: 'CONFLICT', remoteVersion: undefined };
      const rejected = referenceError(rows, request);
      if (rejected) throw rejected;
      const createdAt = tick();
      rows.set(key, { payload: clone(request.payload), syncVersion: 1, deleted: false, createdAt, updatedAt: createdAt });
      const breach =
        financialBreach(rows, affectedAppointmentId(rows, request)) ?? adjustmentConflict(rows, request, undefined);
      if (breach) {
        rows.delete(key); // nothing is written
        return breach;
      }
      return { status: 'APPLIED', syncVersion: 1 };
    }
    const identical =
      !remote.deleted && JSON.stringify(remote.payload) === JSON.stringify(request.payload);
    if (identical) return { status: 'APPLIED', syncVersion: remote.syncVersion };
    if (request.aggregateType === 'SALE_ADJUSTMENT' && !remote.deleted) {
      // A stored record never changes what it says; only its status moves forward.
      const stored = remote.payload as unknown as Record<string, unknown>;
      const next = request.payload as unknown as Record<string, unknown>;
      const changed = IMMUTABLE_ADJUSTMENT_KEYS.some(
        (column) => JSON.stringify(stored[column] ?? null) !== JSON.stringify(next[column] ?? null),
      );
      if (changed || !isAllowedAdjustmentTransition(String(stored.status), String(next.status))) {
        return { status: 'ADJUSTMENT_CONFLICT', saleId: String(stored.sale_id), reason: 'IMMUTABLE' };
      }
    }
    if (!versionMatches) return { status: 'CONFLICT', remoteVersion: remote.syncVersion };
    // A Sale that holds adjustments is frozen: any change is CONFLICT, nothing written.
    if (request.aggregateType === 'SALE' && !remote.deleted && hasLiveAdjustment(rows, request.aggregateId)) {
      return { status: 'CONFLICT', remoteVersion: remote.syncVersion };
    }
    const rejected = referenceError(rows, request);
    if (rejected) throw rejected;
    const next = {
      payload: clone(request.payload),
      syncVersion: remote.syncVersion + 1,
      deleted: false,
      createdAt: remote.createdAt,
      updatedAt: tick(),
    };
    rows.set(key, next);
    const breach =
      financialBreach(rows, affectedAppointmentId(rows, request)) ?? adjustmentConflict(rows, request, remote);
    if (breach) {
      rows.set(key, remote); // nothing is written
      return breach;
    }
    return { status: 'APPLIED', syncVersion: next.syncVersion };
  }

  return {
    get requests() {
      return requests;
    },
    get countCalls() {
      return countCalls;
    },
    find: (businessId, aggregateType, aggregateId) =>
      businesses.get(businessId)?.get(`${aggregateType}/${aggregateId}`),
    list: (businessId) =>
      [...(businesses.get(businessId) ?? new Map<string, FakeRemoteAggregate>()).entries()].map(
        ([key, row]) => ({ key, ...row }),
      ),
    writeFromElsewhere(businessId, aggregateType, aggregateId, payload) {
      const rows = rowsOf(businessId);
      const key = `${aggregateType}/${aggregateId}`;
      const previous = rows.get(key);
      const syncVersion = (previous?.syncVersion ?? 0) + 1;
      const updatedAt = tick();
      rows.set(key, {
        payload: clone(payload),
        syncVersion,
        deleted: false,
        createdAt: previous?.createdAt ?? updatedAt,
        updatedAt,
      });
      return syncVersion;
    },
    tombstoneFromElsewhere(businessId, aggregateType, aggregateId) {
      const rows = rowsOf(businessId);
      const key = `${aggregateType}/${aggregateId}`;
      const previous = rows.get(key);
      if (!previous) throw new Error(`fake remote: no ${key} to tombstone`);
      const tombstone = { ...previous, deleted: true, syncVersion: previous.syncVersion + 1, updatedAt: tick() };
      rows.set(key, tombstone);
      return tombstone.syncVersion;
    },
    get pulls() {
      return pulls;
    },
    answerNextPullWith(data) {
      nextPullAnswer = { data };
    },
    beforePull(next) {
      pullHook = next;
    },
    advanceClock(ms) {
      clock += ms;
    },
    clearRequests() {
      requests.length = 0;
      pulls.length = 0;
    },
    failNext(error, times = 1) {
      for (let index = 0; index < times; index += 1) failures.push(error);
    },
    loseNextResponse() {
      loseResponse = true;
    },
    beforePush(next) {
      hook = next;
    },
    refuseEntitlement(refused) {
      entitlementRefused = refused;
    },
    setServiceCatalogue(enabled) {
      serviceCatalogue = enabled;
    },
    setSaleAdjustments(enabled) {
      saleAdjustments = enabled;
    },

    async countBusinessAggregates(businessId) {
      countCalls += 1;
      const failure = failures.shift();
      if (failure) throw failure;
      return rowsOf(businessId).size;
    },

    async pullBusinessAggregates(businessId, since) {
      pulls.push(since);
      pullHook?.();
      const failure = failures.shift();
      if (failure) throw failure;
      const rows = rowsOf(businessId);
      if (nextPullAnswer) {
        const { data } = nextPullAnswer;
        nextPullAnswer = undefined;
        return data;
      }
      const family = (aggregateType: SyncAggregateType) =>
        [...rows.entries()]
          .filter(([key, row]) => key.startsWith(`${aggregateType}/`) && (since === undefined || row.updatedAt > since.getTime()))
          .sort(([leftKey, left], [rightKey, right]) => left.createdAt - right.createdAt || leftKey.localeCompare(rightKey))
          .map(([key, row]) => toWireAggregate(key, row))
          .map((wire) => {
            if (aggregateType !== 'SERVICE' || serviceCatalogue) return wire;
            const legacy = { ...wire };
            for (const column of SERVICE_CATALOGUE_KEYS) delete legacy[column];
            return legacy;
          });
      return {
        ...(serviceCatalogue ? { service_categories: family('SERVICE_CATEGORY') } : {}),
        ...(saleAdjustments ? { sale_adjustments: family('SALE_ADJUSTMENT') } : {}),
        pulled_at: toWireInstant(tick()),
        clients: family('CLIENT'),
        services: family('SERVICE'),
        products: family('PRODUCT'),
        appointments: family('APPOINTMENT'),
        sales: family('SALE'),
        calendar_blocks: family('CALENDAR_BLOCK'),
        appointment_deposits: family('APPOINTMENT_DEPOSIT'),
      };
    },

    async pushAggregate(request) {
      requests.push(request);
      hook?.(request);
      const failure = failures.shift();
      if (failure) throw failure;
      if (entitlementRefused) {
        const rows = rowsOf(request.businessId); // the owner check comes first, as on the server
        // The step 8 exception: a CLIENT upsert that only withdraws the SMS
        // consent of an existing client is applied — the three consent
        // columns only — whatever the entitlement (sync_withdraw_client_sms_consent).
        const withdrawal = applyConsentWithdrawal(rows, request);
        if (withdrawal) return withdrawal;
        return { status: 'ENTITLEMENT_REQUIRED' };
      }
      const result = apply(request);
      if (loseResponse) {
        loseResponse = false;
        throw new SyncRemoteError('NETWORK');
      }
      return result;
    },
  };
}
