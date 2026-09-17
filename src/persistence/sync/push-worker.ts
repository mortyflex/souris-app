// Souris — sync push worker (Cloud Sync V1C)
//
// Uploads local SQLite state to the remote, one aggregate at a time. It is
// INVOKED explicitly (`run`) — no timer, no background task lives here — and
// it never touches operational rows: SQLite stays the source of truth, the
// worker only reads aggregates and writes the sync bookkeeping.
//
//   run(businessId)
//     1. the database must be bound to exactly this Business UUID
//     2. bootstrap decision (bootstrap.ts) — a stored decision is trusted only
//        while it is still current: a stored EMPTY stops being one as soon as
//        anything exists locally, and the run classifies again. STOP states
//        push nothing, and
//        "local populated + remote empty" IS a STOP until an explicit approval
//        exists for this exact Business (approveInitialUpload). An approved
//        INITIAL_UPLOAD enqueues every existing aggregate, consumes the
//        approval and stores the decision in ONE transaction, WITHOUT writing
//        any acknowledged version
//     3. for each eligible outbox entry, in dependency order:
//          re-read the entry            (id, revision) observed NOW
//          read the CURRENT aggregate   never an outbox snapshot; a missing
//                                       row turns an UPSERT into a DELETE
//          conditional remote push      expected = sync_state.remote_version
//          APPLIED  → ONE transaction: acknowledge the returned server version
//                     + settle the entry ONLY at the observed revision (a
//                     mutation coalesced during the upload keeps it pending)
//          ABSENT   → the remote never held a locally deleted aggregate: settle,
//                     no tombstone, no acknowledged version
//          CONFLICT → nothing was written remotely; the entry stays pending
//                     with a backoff and the conflict is reported
//          failure  → the entry stays pending (attempt_count / last_error /
//                     next_attempt_at); a rejection of this one aggregate moves
//                     on to the next entry, anything else stops the run
//
// Every step is idempotent: a push whose answer was lost is simply pushed
// again, and the remote acknowledges an identical state without rewriting it.
// `last_error` holds stable machine codes only — never row values.

import { runInTransaction, type SourisDatabase } from '../database';

import { readBoundBusinessId, type SyncAggregateRef, type SyncOperation } from './aggregate';
import { readAggregatePayload } from './aggregate-payload';
import {
  classifySyncBootstrap,
  clearInitialUploadApproval,
  isLocalDatabasePopulated,
  isStoredPushDecisionCurrent,
  readInitialUploadApproval,
  readSyncBootstrapRecord,
  writeSyncBootstrapRecord,
  type SyncBootstrapDecision,
  type SyncBootstrapStopDecision,
} from './bootstrap';
import {
  enqueueInitialUpload,
  findSyncOutboxEntry,
  loadEligibleSyncOutbox,
  recordSyncOutboxFailure,
  settleSyncOutboxEntry,
  type SyncOutboxEntry,
} from './outbox';
import {
  SyncRemoteError,
  type RemoteAggregatePayload,
  type RemotePushResult,
  type SyncRemoteFailureCode,
  type SyncRemoteGateway,
} from './remote-gateway';
import {
  clearAcknowledgedRemoteVersion,
  hasAcknowledgedRemoteState,
  readAcknowledgedRemoteVersion,
  writeAcknowledgedRemoteVersion,
} from './state';

export interface SyncConflict extends SyncAggregateRef {
  readonly operation: SyncOperation;
  /** The version this device had acknowledged (undefined = never). */
  readonly acknowledgedVersion: number | undefined;
  /** The version the remote reported (undefined = the remote holds no such row). */
  readonly remoteVersion: number | undefined;
}

export type SyncRunResult =
  | {
      readonly status: 'SKIPPED';
      readonly reason: 'NOT_BOUND' | 'BUSINESS_MISMATCH' | 'INVALID_BUSINESS_ID' | 'ALREADY_RUNNING';
    }
  /** The first sync needs an explicit decision (upload approval / V1D restore / reconciliation). Nothing was pushed. */
  | { readonly status: 'BLOCKED'; readonly decision: SyncBootstrapStopDecision }
  /** The run could not start (remote unreachable while deciding, or a local read failure). */
  | { readonly status: 'FAILED'; readonly reason: SyncRemoteFailureCode | 'LOCAL' }
  | {
      readonly status: 'PUSHED';
      readonly bootstrap: SyncBootstrapDecision;
      /** Entries created by an initial upload decided in THIS run. */
      readonly initialUploadEnqueued: number;
      readonly pushed: number;
      readonly failed: number;
      readonly conflicts: readonly SyncConflict[];
      /**
       * Set when the run ended early: anything but a rejection of ONE aggregate
       * (transport, authorization, unexpected server answer) is a run-level
       * problem, and the remaining entries are not thrown at it.
       */
      readonly stoppedBy?: Exclude<SyncRemoteFailureCode, 'REJECTED'>;
    };

export interface SyncPushWorker {
  /** Never rejects. A second call while one is in flight returns SKIPPED / ALREADY_RUNNING. */
  run(businessId: string): Promise<SyncRunResult>;
}

export interface SyncPushWorkerOptions {
  readonly database: SourisDatabase;
  readonly gateway: SyncRemoteGateway;
  readonly now?: () => Date;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

/** Bounded exponential backoff: 1, 2, 4 … 60 minutes, from the attempts already made. */
export function nextSyncAttemptAt(now: Date, previousAttempts: number): Date {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** Math.min(previousAttempts, 10), BACKOFF_MAX_MS);
  return new Date(now.getTime() + delay);
}

function toFailure(error: unknown): { readonly code: SyncRemoteFailureCode; readonly label: string } {
  if (error instanceof SyncRemoteError) {
    return { code: error.code, label: error.detail ? `${error.code}:${error.detail}` : error.code };
  }
  return { code: 'UNKNOWN', label: 'UNKNOWN' };
}

/**
 * Cheap LOCAL check for a periodic caller: true only when a stored decision
 * STILL licenses pushing (a stale EMPTY does not) AND an entry is eligible
 * now. No network, no write — an idle or blocked device never polls the remote.
 */
export function hasEligiblePushWork(db: SourisDatabase, businessId: string, now: Date): boolean {
  const stored = readSyncBootstrapRecord(db, businessId);
  if (!stored || !isStoredPushDecisionCurrent(db, businessId, stored.decision)) return false;
  return loadEligibleSyncOutbox(db, businessId, now).length > 0;
}

export function createSyncPushWorker({
  database: db,
  gateway,
  now = () => new Date(),
}: SyncPushWorkerOptions): SyncPushWorker {
  let running = false;

  /** Step 2. Resolves to the push-enabling decision, or to the result that ends the run. */
  async function resolveBootstrap(
    businessId: string,
  ): Promise<
    | { readonly decision: SyncBootstrapDecision; readonly enqueued: number }
    | Extract<SyncRunResult, { status: 'BLOCKED' | 'FAILED' }>
  > {
    const stored = readSyncBootstrapRecord(db, businessId);
    if (stored && isStoredPushDecisionCurrent(db, businessId, stored.decision)) {
      return { decision: stored.decision, enqueued: 0 };
    }

    let remoteAggregateCount: number;
    try {
      remoteAggregateCount = await gateway.countBusinessAggregates(businessId);
    } catch (error) {
      return { status: 'FAILED', reason: toFailure(error).code };
    }

    // Local facts are read AFTER the await, in the same synchronous turn as
    // the enqueue below, so nothing can slip between the two.
    const decision = classifySyncBootstrap({
      localPopulated: isLocalDatabasePopulated(db),
      remoteAggregateCount,
      hasAcknowledgedState: hasAcknowledgedRemoteState(db, businessId),
      initialUploadApproved: readInitialUploadApproval(db, businessId) !== undefined,
    });
    let enqueued = 0;
    runInTransaction(db, () => {
      const decidedAt = now();
      if (decision === 'INITIAL_UPLOAD') {
        // One-time: the approval is consumed with the enqueue it authorized.
        enqueued = enqueueInitialUpload(db, businessId, decidedAt);
        clearInitialUploadApproval(db);
      }
      writeSyncBootstrapRecord(db, { businessId, decision, decidedAt });
    });

    if (
      decision === 'INITIAL_UPLOAD_REQUIRES_APPROVAL' ||
      decision === 'RESTORE_REQUIRED' ||
      decision === 'RECONCILIATION_REQUIRED'
    ) {
      return { status: 'BLOCKED', decision };
    }
    return { decision, enqueued };
  }

  function fail(entry: SyncOutboxEntry, label: string, retryAt: Date | undefined): void {
    recordSyncOutboxFailure(db, entry.id, label, retryAt, entry.revision);
  }

  async function pushEntries(
    businessId: string,
    decision: SyncBootstrapDecision,
  ): Promise<Pick<Extract<SyncRunResult, { status: 'PUSHED' }>, 'pushed' | 'failed' | 'conflicts' | 'stoppedBy'>> {
    let pushed = 0;
    let failed = 0;
    const conflicts: SyncConflict[] = [];

    for (const listed of loadEligibleSyncOutbox(db, businessId, now())) {
      // The list is a snapshot; the entry may have been coalesced or settled since.
      const entry = findSyncOutboxEntry(db, businessId, listed);
      if (!entry) continue;

      let payload: RemoteAggregatePayload | undefined;
      try {
        payload = entry.operation === 'UPSERT' ? readAggregatePayload(db, businessId, entry) : undefined;
      } catch {
        failed += 1;
        fail(entry, 'LOCAL_INVALID', nextSyncAttemptAt(now(), entry.attemptCount));
        continue;
      }
      // An UPSERT whose row is gone is a deletion (CLOUD_SYNC.md §10.8).
      const operation: SyncOperation = payload === undefined ? 'DELETE' : 'UPSERT';
      // EMPTY never uploads data. It was decided with empty local tables, so an
      // aggregate that exists NOW was created during this very run: leave it
      // pending — the next run finds EMPTY stale and asks for the approval.
      if (decision === 'EMPTY' && operation === 'UPSERT') continue;
      const acknowledgedVersion = readAcknowledgedRemoteVersion(db, businessId, entry)?.remoteVersion;

      let result: RemotePushResult;
      try {
        result = await gateway.pushAggregate({
          businessId,
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          operation,
          expectedVersion: acknowledgedVersion,
          payload,
        });
      } catch (error) {
        failed += 1;
        const failure = toFailure(error);
        if (failure.code === 'REJECTED') {
          // The remote refused THIS aggregate (constraint, foreign key): back off, move on.
          fail(entry, failure.label, nextSyncAttemptAt(now(), entry.attemptCount));
          continue;
        }
        // NETWORK / FORBIDDEN are not this aggregate's fault: eligible again at
        // the next run. UNKNOWN might be, so it backs off and lets the others
        // go first next time. Either way the run stops here.
        fail(
          entry,
          failure.label,
          failure.code === 'UNKNOWN' ? nextSyncAttemptAt(now(), entry.attemptCount) : undefined,
        );
        return { pushed, failed, conflicts, stoppedBy: failure.code };
      }

      if (result.status === 'CONFLICT') {
        conflicts.push({
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          operation,
          acknowledgedVersion,
          remoteVersion: result.remoteVersion,
        });
        fail(entry, 'CONFLICT', nextSyncAttemptAt(now(), entry.attemptCount));
        continue;
      }

      // APPLIED carries the server-assigned version; ABSENT means no remote row exists at all.
      const syncVersion = result.status === 'APPLIED' ? result.syncVersion : undefined;
      runInTransaction(db, () => {
        if (syncVersion !== undefined) {
          writeAcknowledgedRemoteVersion(db, {
            businessId,
            aggregateType: entry.aggregateType,
            aggregateId: entry.aggregateId,
            remoteVersion: syncVersion,
            lastSyncedAt: now(),
          });
        } else {
          clearAcknowledgedRemoteVersion(db, businessId, entry);
        }
        // Conditional: a newer local revision keeps the entry pending.
        settleSyncOutboxEntry(db, entry.id, entry.revision);
      });
      pushed += 1;
    }

    return { pushed, failed, conflicts };
  }

  async function runOnce(businessId: string): Promise<SyncRunResult> {
    if (!UUID_PATTERN.test(businessId)) return { status: 'SKIPPED', reason: 'INVALID_BUSINESS_ID' };
    const boundBusinessId = readBoundBusinessId(db);
    if (boundBusinessId === undefined) return { status: 'SKIPPED', reason: 'NOT_BOUND' };
    if (boundBusinessId !== businessId) return { status: 'SKIPPED', reason: 'BUSINESS_MISMATCH' };

    const bootstrap = await resolveBootstrap(businessId);
    if ('status' in bootstrap) return bootstrap;

    const summary = await pushEntries(businessId, bootstrap.decision);
    return {
      status: 'PUSHED',
      bootstrap: bootstrap.decision,
      initialUploadEnqueued: bootstrap.enqueued,
      ...summary,
    };
  }

  return {
    async run(businessId) {
      if (running) return { status: 'SKIPPED', reason: 'ALREADY_RUNNING' };
      running = true;
      try {
        return await runOnce(businessId);
      } catch {
        // A local SQLite failure (closed database after a reset, disk error).
        return { status: 'FAILED', reason: 'LOCAL' };
      } finally {
        running = false;
      }
    },
  };
}
