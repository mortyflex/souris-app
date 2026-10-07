// BeautIzzy — sync worker (Cloud Sync V1C push, V1D restore + pull, V1D.1 seamless bootstrap)
//
// Uploads local SQLite state to the remote, one aggregate at a time, then
// downloads what changed remotely. It is INVOKED explicitly (`run`) — no
// timer, no background task lives here. The PUSH half never touches
// operational rows; the only writers of operational rows on behalf of the
// remote are restore.ts (an approved new-device restore) and pull-worker.ts
// (clean aggregates only). SQLite stays the source of truth throughout.
//
//   run(businessId)
//     1. the database must be bound to exactly this Business UUID
//     2. bootstrap decision (bootstrap.ts) — a stored decision is trusted only
//        while it is still current: a stored EMPTY stops being one as soon as
//        anything exists locally, and the run classifies again. STOP states
//        push nothing, and
//        "local populated + remote empty" IS a STOP until an approval exists
//        for this exact Business (approveInitialUpload — given automatically
//        by the cloud sync runner since V1D.1, never by this worker). An approved
//        INITIAL_UPLOAD enqueues every existing aggregate, consumes the
//        approval and stores the decision in ONE transaction, WITHOUT writing
//        any acknowledged version. "local empty + remote populated" is a STOP
//        too (RESTORE_REQUIRED) until approveInitialRestore exists for this
//        exact Business: the run then performs the transactional restore
//        (restore.ts) and ends — RESTORED, or FAILED with SQLite unchanged and
//        the approval kept for the next run.
//        A stored EMPTY is ALWAYS classified again: "the remote was empty when
//        we looked" says nothing about now, and a device that kept trusting it
//        would never discover that its Business was populated meanwhile (from
//        another device) and needs a restore
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
//     4. incremental pull (pull-worker.ts) — only for a Business that really
//        synchronizes (ALREADY_SYNCED / INITIAL_UPLOAD) and only when the push
//        pass was not stopped by a run-level failure. Push goes FIRST so that
//        a push whose answer was lost is acknowledged before the pull looks at
//        it (it would otherwise read as "remote newer + local dirty")
//
// Every step is idempotent: a push whose answer was lost is simply pushed
// again, and the remote acknowledges an identical state without rewriting it.
// `last_error` holds stable machine codes only — never row values.

import { runInTransaction, type SourisDatabase } from '../database';

import {
  readBoundBusinessId,
  type SyncConflict,
  type SyncFinancialConflict,
  type SyncOperation,
} from './aggregate';
import { readAggregatePayload } from './aggregate-payload';
import {
  classifySyncBootstrap,
  clearInitialUploadApproval,
  isLocalDatabasePopulated,
  isStoredPushDecisionCurrent,
  isSyncBootstrapPending,
  readInitialRestoreApproval,
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
import { pullRemoteChanges, type SyncPullSummary } from './pull-worker';
import {
  SyncRemoteError,
  type RemoteAggregatePayload,
  type RemotePushResult,
  type SyncRemoteFailureCode,
  type SyncRemoteGateway,
} from './remote-gateway';
import { restoreBusinessFromRemote, type RestoreCounts, type RestoreOutcome } from './restore';
import {
  clearAcknowledgedRemoteVersion,
  hasAcknowledgedRemoteState,
  readAcknowledgedRemoteVersion,
  writeAcknowledgedRemoteVersion,
} from './state';

export type { SyncConflict, SyncFinancialConflict } from './aggregate';
export type { SyncPullSummary } from './pull-worker';

export type SyncRunResult =
  | {
      readonly status: 'SKIPPED';
      readonly reason: 'NOT_BOUND' | 'BUSINESS_MISMATCH' | 'INVALID_BUSINESS_ID' | 'ALREADY_RUNNING';
    }
  /** The first sync needs an approval (upload / restore — the runner's, V1D.1) or a reconciliation. Nothing moved. */
  | { readonly status: 'BLOCKED'; readonly decision: SyncBootstrapStopDecision }
  /**
   * The run could not start (remote unreachable while deciding, a local read
   * failure), or an approved restore failed — SQLite is then unchanged and the
   * approval still pending (restore.ts).
   */
  | { readonly status: 'FAILED'; readonly reason: Extract<RestoreOutcome, { status: 'FAILED' }>['reason'] }
  /** The approved new-device restore committed: SQLite was rebuilt from the remote Business. */
  | { readonly status: 'RESTORED'; readonly restored: RestoreCounts }
  | {
      readonly status: 'PUSHED';
      readonly bootstrap: SyncBootstrapDecision;
      /** Entries created by an initial upload decided in THIS run. */
      readonly initialUploadEnqueued: number;
      readonly pushed: number;
      readonly failed: number;
      readonly conflicts: readonly SyncConflict[];
      /**
       * Financial writes the remote refused because they would break the
       * deposit invariant of an Appointment (CLOUD_SYNC.md §21.2). Absent when
       * there was none. Nothing was written on either side.
       */
      readonly financialConflicts?: readonly SyncFinancialConflict[];
      /**
       * Set when the run ended early: anything but a rejection of ONE aggregate
       * (transport, authorization, unexpected server answer) is a run-level
       * problem, and the remaining entries are not thrown at it.
       */
      readonly stoppedBy?: Exclude<SyncRemoteFailureCode, 'REJECTED'>;
      /**
       * The incremental pull that followed the push pass. Absent under EMPTY
       * (the remote was just counted empty) and when the push pass was stopped.
       */
      readonly pull?: SyncPullSummary;
    };

/**
 * Whether the run wrote OPERATIONAL rows (a restore, or a pull that applied
 * or removed something). The caller then re-hydrates whatever it keeps in
 * memory from SQLite; a push-only run never needs it.
 */
export function didSyncRunChangeLocalData(result: SyncRunResult): boolean {
  if (result.status === 'RESTORED') return true;
  return (
    result.status === 'PUSHED' &&
    result.pull?.status === 'PULLED' &&
    result.pull.applied + result.pull.deleted > 0
  );
}

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
 * Cheap LOCAL check, the push half of `isSyncRunDue`: true only when a stored
 * decision STILL licenses pushing (a stale EMPTY does not) AND an entry is
 * eligible now. No network, no write.
 */
export function hasEligiblePushWork(db: SourisDatabase, businessId: string, now: Date): boolean {
  const stored = readSyncBootstrapRecord(db, businessId);
  if (!stored || !isStoredPushDecisionCurrent(db, businessId, stored.decision)) return false;
  return loadEligibleSyncOutbox(db, businessId, now).length > 0;
}

/**
 * THE periodic check: whether a run would do something useful right now —
 * settle a first sync that is still pending (bootstrap.ts), or push an
 * eligible entry. Local reads only. A device that is idle, backing off, or
 * waiting for a reconciliation answers false and never polls the remote.
 */
export function isSyncRunDue(db: SourisDatabase, businessId: string, now: Date): boolean {
  return isSyncBootstrapPending(db, businessId) || hasEligiblePushWork(db, businessId, now);
}

/**
 * Whether this device already synchronizes with the Business under a CURRENT
 * push decision (ALREADY_SYNCED / INITIAL_UPLOAD) — the only state in which a
 * run is a plain incremental exchange: push the outbox (nothing when idle),
 * then pull what changed since the stored cursor. Never true while the first
 * sync is pending, for an EMPTY device, or while a reconciliation is required.
 * Local reads only.
 */
export function isIncrementalPullAvailable(db: SourisDatabase, businessId: string): boolean {
  const stored = readSyncBootstrapRecord(db, businessId);
  if (!stored || (stored.decision !== 'ALREADY_SYNCED' && stored.decision !== 'INITIAL_UPLOAD')) {
    return false;
  }
  return isStoredPushDecisionCurrent(db, businessId, stored.decision);
}

/**
 * THE rule of the foreground sync tick (CLOUD_SYNC.md §17.2): a run is due
 * (`isSyncRunDue`: a pending first sync, or eligible local writes) OR the
 * device synchronizes and may pull what other devices changed — so an idle,
 * open device receives remote changes within one tick. Local reads only; the
 * tick itself stays foreground-only and at its existing cadence.
 */
export function isForegroundSyncTickDue(db: SourisDatabase, businessId: string, now: Date): boolean {
  return isSyncRunDue(db, businessId, now) || isIncrementalPullAvailable(db, businessId);
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
    | Extract<SyncRunResult, { status: 'BLOCKED' | 'FAILED' | 'RESTORED' }>
  > {
    const stored = readSyncBootstrapRecord(db, businessId);
    // EMPTY is asked again at every run (one count): the Business may have been
    // populated from another device since, which makes this one RESTORE_REQUIRED.
    if (
      stored &&
      stored.decision !== 'EMPTY' &&
      isStoredPushDecisionCurrent(db, businessId, stored.decision)
    ) {
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

    if (decision === 'RESTORE_REQUIRED' && readInitialRestoreApproval(db, businessId) !== undefined) {
      // Approved for THIS Business. Success stores ALREADY_SYNCED in
      // the restore transaction; failure changes nothing and keeps the approval.
      return restoreBusinessFromRemote({ database: db, gateway, businessId, now });
    }
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
    const financialConflicts: SyncFinancialConflict[] = [];
    // Reported only when there is one, like `stoppedBy` and `pull`.
    const summarize = () => (financialConflicts.length > 0 ? { financialConflicts } : {});

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
      // pending — the next run finds EMPTY stale and goes through the initial upload.
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
        return { pushed, failed, conflicts, ...summarize(), stoppedBy: failure.code };
      }

      if (result.status === 'FINANCIAL_CONFLICT') {
        // The remote is the authority on the Appointment's financial state and
        // refused this write. Keep the entry pending with the ordinary backoff:
        // voiding a deposit or raising the total makes it pushable again.
        financialConflicts.push({
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          appointmentId: result.appointmentId,
          expectedTotalCents: result.expectedTotalCents,
          activeDepositTotalCents: result.activeDepositTotalCents,
        });
        failed += 1;
        fail(entry, 'FINANCIAL_CONFLICT', nextSyncAttemptAt(now(), entry.attemptCount));
        continue;
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

    return { pushed, failed, conflicts, ...summarize() };
  }

  async function runOnce(businessId: string): Promise<SyncRunResult> {
    if (!UUID_PATTERN.test(businessId)) return { status: 'SKIPPED', reason: 'INVALID_BUSINESS_ID' };
    const boundBusinessId = readBoundBusinessId(db);
    if (boundBusinessId === undefined) return { status: 'SKIPPED', reason: 'NOT_BOUND' };
    if (boundBusinessId !== businessId) return { status: 'SKIPPED', reason: 'BUSINESS_MISMATCH' };

    const bootstrap = await resolveBootstrap(businessId);
    if ('status' in bootstrap) return bootstrap;

    const summary = await pushEntries(businessId, bootstrap.decision);
    // Pull only for a Business that really synchronizes, and not through a
    // remote that just failed the push pass.
    const pull =
      bootstrap.decision !== 'EMPTY' && summary.stoppedBy === undefined
        ? await pullRemoteChanges({ database: db, gateway, businessId, now })
        : undefined;
    return {
      status: 'PUSHED',
      bootstrap: bootstrap.decision,
      initialUploadEnqueued: bootstrap.enqueued,
      ...summary,
      ...(pull ? { pull } : {}),
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
