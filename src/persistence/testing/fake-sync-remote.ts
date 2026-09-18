// Souris — in-memory remote for sync tests (never imported by app code)
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
//     whose Appointment) the remote does not hold is REJECTED (23503).
//
// …and the CONTRACT of `public.sync_pull_business_aggregates`
// (supabase/migrations/20260917200000_create_sync_pull_function.sql):
//
//   * owner-only, like the push;
//   * returns the WIRE JSON — `pulled_at` + the five families, each aggregate
//     as `{ id, sync_version, deleted_at, …payload columns, children }`, in
//     creation order, tombstones included — instants as ISO-8601 UTC text
//     with milliseconds, the fixed form `sync_instant_text` produces;
//   * `since` filters on the server `updated_at` (strictly greater).
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
  /** Moves the logical server clock forward. */
  advanceClock(ms: number): void;
  /** Forgets the push and pull logs (not the rows): lets a test start counting after its setup. */
  clearRequests(): void;
  failNext(error: SyncRemoteError, times?: number): void;
  loseNextResponse(): void;
  beforePush(hook: ((request: RemotePushRequest) => void) | undefined): void;
}

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function referenceError(
  rows: Map<string, FakeRemoteAggregate>,
  request: RemotePushRequest,
): SyncRemoteError | undefined {
  const payload = request.payload as { client_id?: string | null; appointment_id?: string | null };
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

export function createFakeSyncRemote(ownedBusinessIds: readonly string[]): FakeSyncRemote {
  const businesses = new Map<string, Map<string, FakeRemoteAggregate>>();
  const requests: RemotePushRequest[] = [];
  const failures: SyncRemoteError[] = [];
  let loseResponse = false;
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

  const INSTANT_COLUMNS = ['archived_at', 'start_at', 'cancelled_at', 'no_show_recorded_at', 'paid_at', 'completed_at'];

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

  function apply(request: RemotePushRequest): RemotePushResult {
    const rows = rowsOf(request.businessId);
    const key = `${request.aggregateType}/${request.aggregateId}`;
    const remote = rows.get(key);
    const versionMatches = request.expectedVersion === remote?.syncVersion;

    if (request.operation === 'DELETE') {
      if (!remote) return { status: 'ABSENT' };
      if (remote.deleted) return { status: 'APPLIED', syncVersion: remote.syncVersion };
      if (!versionMatches) return { status: 'CONFLICT', remoteVersion: remote.syncVersion };
      const tombstone = { ...remote, deleted: true, syncVersion: remote.syncVersion + 1, updatedAt: tick() };
      rows.set(key, tombstone);
      return { status: 'APPLIED', syncVersion: tombstone.syncVersion };
    }

    if (request.payload === undefined) throw new SyncRemoteError('REJECTED', '22023');
    if (!remote) {
      if (request.expectedVersion !== undefined) return { status: 'CONFLICT', remoteVersion: undefined };
      const rejected = referenceError(rows, request);
      if (rejected) throw rejected;
      const createdAt = tick();
      rows.set(key, { payload: clone(request.payload), syncVersion: 1, deleted: false, createdAt, updatedAt: createdAt });
      return { status: 'APPLIED', syncVersion: 1 };
    }
    const identical =
      !remote.deleted && JSON.stringify(remote.payload) === JSON.stringify(request.payload);
    if (identical) return { status: 'APPLIED', syncVersion: remote.syncVersion };
    if (!versionMatches) return { status: 'CONFLICT', remoteVersion: remote.syncVersion };
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
          .map(([key, row]) => toWireAggregate(key, row));
      return {
        pulled_at: toWireInstant(tick()),
        clients: family('CLIENT'),
        services: family('SERVICE'),
        products: family('PRODUCT'),
        appointments: family('APPOINTMENT'),
        sales: family('SALE'),
      };
    },

    async pushAggregate(request) {
      requests.push(request);
      hook?.(request);
      const failure = failures.shift();
      if (failure) throw failure;
      const result = apply(request);
      if (loseResponse) {
        loseResponse = false;
        throw new SyncRemoteError('NETWORK');
      }
      return result;
    },
  };
}
