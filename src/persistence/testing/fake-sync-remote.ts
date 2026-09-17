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
}

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
  /** Forgets the request log (not the rows): lets a test start counting after its setup. */
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
      const tombstone = { ...remote, deleted: true, syncVersion: remote.syncVersion + 1 };
      rows.set(key, tombstone);
      return { status: 'APPLIED', syncVersion: tombstone.syncVersion };
    }

    if (request.payload === undefined) throw new SyncRemoteError('REJECTED', '22023');
    if (!remote) {
      if (request.expectedVersion !== undefined) return { status: 'CONFLICT', remoteVersion: undefined };
      const rejected = referenceError(rows, request);
      if (rejected) throw rejected;
      rows.set(key, { payload: clone(request.payload), syncVersion: 1, deleted: false });
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
      const syncVersion = (rows.get(key)?.syncVersion ?? 0) + 1;
      rows.set(key, { payload: clone(payload), syncVersion, deleted: false });
      return syncVersion;
    },
    clearRequests() {
      requests.length = 0;
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
