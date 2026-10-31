// BeautIzzy — first sync of a bound Business (Cloud Sync V1C–V1D.1, CLOUD_SYNC.md §11)
//
// Before anything is pushed, the device decides what the first sync of its
// Business is, from the population of BOTH sides:
//
//   acknowledged remote state already on the device → ALREADY_SYNCED                    push
//   local empty      remote empty                   → EMPTY                             push (nothing to upload)
//   local populated  remote empty   NOT approved    → INITIAL_UPLOAD_REQUIRES_APPROVAL  STOP — nothing enqueued,
//                                                                                        nothing pushed
//   local populated  remote empty   approved        → INITIAL_UPLOAD                    enqueue everything, push
//   local empty      remote populated               → RESTORE_REQUIRED                  STOP — until the restore is
//                                                                                        approved (V1D)
//   local populated  remote populated               → RECONCILIATION_REQUIRED           STOP — never local-wins
//                                                                                        or remote-wins silently
//
// At THIS level, uploading a device's EXISTING data into an empty Business
// always needs ONE approval for that exact Business UUID
// (`approveInitialUpload`), persisted locally, consumed by the run that
// enqueues the aggregates, never valid for another Business, and cleared by
// the development reset. The approval is an internal safety primitive, not a
// user decision: since V1D.1 its single caller is the cloud sync runner, which
// gives it automatically — only under a LIVE session bound to that Business —
// so the user never sees the first sync. Classification itself is harmless:
// it reads one remote count and writes no data.
//
// The decision is stored in `souris_metadata`, but a stored decision is a
// push licence ONLY while what justified it still holds
// (`isStoredPushDecisionCurrent`):
//
//   INITIAL_UPLOAD   the recorded approval for this Business — durable: an
//                    interrupted upload resumes without a second approval
//   ALREADY_SYNCED   only while `sync_state` really holds an acknowledged
//                    revision for this Business
//   EMPTY            only while there is still NOTHING to push. EMPTY means
//                    "both sides held nothing when we looked"; it is NOT an
//                    acknowledgement that the device is synchronized and it
//                    never authorizes uploading data created afterwards. The
//                    first local aggregate (or outbox entry) makes it stale:
//                    the next run classifies again, and — with no acknowledged
//                    state — lands on INITIAL_UPLOAD_REQUIRES_APPROVAL. The
//                    periodic check sees that too (`isSyncBootstrapPending`),
//                    so the first data of a new account leaves on its own
//
// Only actual acknowledged state, or the recorded approval, ever lets data
// leave the device. A pending outbox proves nothing about synchronization.
//
// A STOP decision is stored for diagnosis but RE-EVALUATED on the next run.
// The two one-sided STOPs are answered by the runner's automatic approval;
// RECONCILIATION_REQUIRED is answered by nothing automatic — its way out is
// an explicit reconciliation (or an explicit cleanup of a test Business).
//
// Rebuilding an EMPTY device from a populated Business follows the same
// pattern (V1D): RESTORE_REQUIRED stays a STOP until `approveInitialRestore`
// was called for that exact Business UUID. The approval is persisted and KEPT
// until a restore actually commits (restore.ts clears it inside the restore
// transaction), so a failed or interrupted restore is simply retried by the
// next run. A restore never runs over local data: local populated + remote
// populated stays RECONCILIATION_REQUIRED whatever was approved.
//
// "Local populated" means at least one operational aggregate row; the seed
// marker, the account binding and the sync bookkeeping do not count.
// Tombstones count as remote rows.

import { runInTransaction, type SourisDatabase } from '../database';
import { deleteMetadata, readMetadata, writeMetadata } from '../metadata';
import { fromSqlInstant, toSqlInstant } from '../values';

import { readBoundBusinessId } from './aggregate';
import { hasPendingSyncOutbox } from './outbox';
import { hasAcknowledgedRemoteState } from './state';

export type SyncBootstrapDecision =
  | 'ALREADY_SYNCED'
  | 'EMPTY'
  | 'INITIAL_UPLOAD_REQUIRES_APPROVAL'
  | 'INITIAL_UPLOAD'
  | 'RESTORE_REQUIRED'
  | 'RECONCILIATION_REQUIRED';

export type SyncBootstrapStopDecision = Extract<
  SyncBootstrapDecision,
  'INITIAL_UPLOAD_REQUIRES_APPROVAL' | 'RESTORE_REQUIRED' | 'RECONCILIATION_REQUIRED'
>;

export interface SyncBootstrapFacts {
  /** At least one operational aggregate row exists in SQLite. */
  readonly localPopulated: boolean;
  /** Top-level aggregate rows the remote holds for the Business, tombstones included. */
  readonly remoteAggregateCount: number;
  /** `sync_state` holds at least one acknowledged revision for the Business. */
  readonly hasAcknowledgedState: boolean;
  /** An unconsumed initial-upload approval exists for THIS Business. */
  readonly initialUploadApproved: boolean;
}

export function classifySyncBootstrap(facts: SyncBootstrapFacts): SyncBootstrapDecision {
  if (!Number.isInteger(facts.remoteAggregateCount) || facts.remoteAggregateCount < 0) {
    throw new RangeError(`classifySyncBootstrap: invalid remote count ${facts.remoteAggregateCount}`);
  }
  if (facts.hasAcknowledgedState) return 'ALREADY_SYNCED';
  const remotePopulated = facts.remoteAggregateCount > 0;
  if (!facts.localPopulated) return remotePopulated ? 'RESTORE_REQUIRED' : 'EMPTY';
  if (remotePopulated) return 'RECONCILIATION_REQUIRED';
  // The approval authorizes THIS transition only; it never overrides a STOP above.
  return facts.initialUploadApproved ? 'INITIAL_UPLOAD' : 'INITIAL_UPLOAD_REQUIRES_APPROVAL';
}

/**
 * Whether a FRESH classification lets the run continue to the outbox. For
 * EMPTY that is harmless by construction — the local tables are empty, so
 * the only possible entries are deletions of aggregates the remote never
 * held — and the worker additionally refuses any UPSERT under EMPTY.
 */
export function isPushEnabled(decision: SyncBootstrapDecision): boolean {
  return decision === 'ALREADY_SYNCED' || decision === 'EMPTY' || decision === 'INITIAL_UPLOAD';
}

const AGGREGATE_TABLES = [
  'clients',
  'services',
  'products',
  'appointments',
  'sales',
  'calendar_blocks',
  'appointment_deposits',
  'service_categories',
  'sale_adjustments',
] as const;

export function isLocalDatabasePopulated(db: SourisDatabase): boolean {
  return AGGREGATE_TABLES.some(
    (table) =>
      db.getFirstSync<{ readonly found: number }>(`SELECT 1 AS found FROM ${table} LIMIT 1`) !== null,
  );
}

/**
 * Whether a STORED decision may still be trusted without asking the remote
 * again (see the module header). Anything else is re-classified by the next
 * run. This is the single place that decides it — the worker, the periodic
 * check and the approval all go through it.
 */
export function isStoredPushDecisionCurrent(
  db: SourisDatabase,
  businessId: string,
  decision: SyncBootstrapDecision,
): boolean {
  switch (decision) {
    case 'INITIAL_UPLOAD':
      return true;
    case 'ALREADY_SYNCED':
      return hasAcknowledgedRemoteState(db, businessId);
    case 'EMPTY':
      return !isLocalDatabasePopulated(db) && !hasPendingSyncOutbox(db, businessId);
    default:
      return false;
  }
}

/**
 * Cheap LOCAL check: the first sync of this Business is not settled yet AND a
 * run can settle it without anyone's help — so a periodic caller should run.
 *
 *   never classified                    the launch run failed before deciding
 *   EMPTY / ALREADY_SYNCED, stale       classify again (the first aggregate
 *                                       created after an EMPTY lands here)
 *   INITIAL_UPLOAD_REQUIRES_APPROVAL    the automatic upload or restore did not
 *   RESTORE_REQUIRED                    complete (a failure): retry it
 *
 * RECONCILIATION_REQUIRED is NOT pending in that sense: no run resolves it, so
 * a device in that state never polls the remote from a timer.
 */
export function isSyncBootstrapPending(db: SourisDatabase, businessId: string): boolean {
  const stored = readSyncBootstrapRecord(db, businessId);
  if (!stored) return true;
  if (stored.decision === 'RECONCILIATION_REQUIRED') return false;
  return !isStoredPushDecisionCurrent(db, businessId, stored.decision);
}

/** `souris_metadata` key of the stored decision; cleared by the development reset. */
export const SYNC_BOOTSTRAP_KEY = 'sync_bootstrap';

export interface SyncBootstrapRecord {
  readonly businessId: string;
  readonly decision: SyncBootstrapDecision;
  readonly decidedAt: Date;
}

const DECISIONS: readonly string[] = [
  'ALREADY_SYNCED',
  'EMPTY',
  'INITIAL_UPLOAD_REQUIRES_APPROVAL',
  'INITIAL_UPLOAD',
  'RESTORE_REQUIRED',
  'RECONCILIATION_REQUIRED',
] satisfies readonly SyncBootstrapDecision[];

/**
 * The decision stored for THIS Business, or undefined. A record written for
 * another Business id, or an unreadable value, is ignored — the decision is
 * then simply taken again; it is never inherited across Businesses.
 */
export function readSyncBootstrapRecord(
  db: SourisDatabase,
  businessId: string,
): SyncBootstrapRecord | undefined {
  const raw = readMetadata(db, SYNC_BOOTSTRAP_KEY);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { businessId: storedId, decision, decidedAt } = parsed as Record<string, unknown>;
    if (storedId !== businessId) return undefined;
    if (typeof decision !== 'string' || !DECISIONS.includes(decision)) return undefined;
    if (typeof decidedAt !== 'string') return undefined;
    return {
      businessId,
      decision: decision as SyncBootstrapDecision,
      decidedAt: fromSqlInstant(decidedAt),
    };
  } catch {
    return undefined;
  }
}

export function writeSyncBootstrapRecord(db: SourisDatabase, record: SyncBootstrapRecord): void {
  writeMetadata(
    db,
    SYNC_BOOTSTRAP_KEY,
    JSON.stringify({
      businessId: record.businessId,
      decision: record.decision,
      decidedAt: toSqlInstant(record.decidedAt),
    }),
  );
}

// ---------------------------------------------------------------------------
// Explicit initial-upload approval
// ---------------------------------------------------------------------------

/** `souris_metadata` key of the pending approval; cleared by the development reset. */
export const SYNC_INITIAL_UPLOAD_APPROVAL_KEY = 'sync_initial_upload_approval';

export interface InitialUploadApproval {
  readonly businessId: string;
  readonly approvedAt: Date;
}

export type InitialUploadApprovalResult =
  | { readonly status: 'APPROVED'; readonly approval: InitialUploadApproval }
  | {
      readonly status: 'REFUSED';
      /**
       * NOT_BOUND / BUSINESS_MISMATCH: the database is not bound to that exact
       * Business. NOT_REQUIRED: a push decision is stored for it AND still
       * current (incremental sync is running, or there is nothing to upload) —
       * there is no initial upload to approve. A stale EMPTY does not count.
       */
      readonly reason: 'NOT_BOUND' | 'BUSINESS_MISMATCH' | 'NOT_REQUIRED';
    };

/**
 * The pending approval for THIS Business, or undefined. An approval recorded
 * for another Business id, or an unreadable value, authorizes nothing.
 */
export function readInitialUploadApproval(
  db: SourisDatabase,
  businessId: string,
): InitialUploadApproval | undefined {
  const raw = readMetadata(db, SYNC_INITIAL_UPLOAD_APPROVAL_KEY);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { businessId: storedId, approvedAt } = parsed as Record<string, unknown>;
    if (storedId !== businessId || typeof approvedAt !== 'string') return undefined;
    return { businessId, approvedAt: fromSqlInstant(approvedAt) };
  } catch {
    return undefined;
  }
}

/** Consumes (or withdraws) the approval. Call inside the transaction that enqueues the upload. */
export function clearInitialUploadApproval(db: SourisDatabase): void {
  deleteMetadata(db, SYNC_INITIAL_UPLOAD_APPROVAL_KEY);
}

/**
 * The ONE gate of an initial upload: authorizes uploading the
 * existing local data of `businessId` into its EMPTY remote Business.
 *
 * It records the approval and nothing else — no aggregate is enqueued, no
 * request is made. The next sync run classifies both sides again and, only
 * if the device is still "local populated + remote empty" for that same
 * Business, enqueues every aggregate and consumes the approval in ONE
 * transaction. A populated remote stays a STOP whatever was approved.
 *
 * An internal safety primitive, never a user action: its single caller is the
 * cloud sync runner (V1D.1), after a run answered
 * INITIAL_UPLOAD_REQUIRES_APPROVAL for the Business of its LIVE session.
 */
export function approveInitialUpload(
  db: SourisDatabase,
  businessId: string,
  now: Date = new Date(),
): InitialUploadApprovalResult {
  let result: InitialUploadApprovalResult = { status: 'REFUSED', reason: 'NOT_BOUND' };
  runInTransaction(db, () => {
    const boundBusinessId = readBoundBusinessId(db);
    if (boundBusinessId === undefined) return;
    if (boundBusinessId !== businessId) {
      result = { status: 'REFUSED', reason: 'BUSINESS_MISMATCH' };
      return;
    }
    const stored = readSyncBootstrapRecord(db, businessId);
    if (stored && isStoredPushDecisionCurrent(db, businessId, stored.decision)) {
      result = { status: 'REFUSED', reason: 'NOT_REQUIRED' };
      return;
    }
    const approval: InitialUploadApproval = { businessId, approvedAt: now };
    writeMetadata(
      db,
      SYNC_INITIAL_UPLOAD_APPROVAL_KEY,
      JSON.stringify({ businessId, approvedAt: toSqlInstant(now) }),
    );
    result = { status: 'APPROVED', approval };
  });
  return result;
}

// ---------------------------------------------------------------------------
// Explicit initial-restore approval (Cloud Sync V1D)
// ---------------------------------------------------------------------------

/** `souris_metadata` key of the pending restore approval; cleared by the restore and by the development reset. */
export const SYNC_INITIAL_RESTORE_APPROVAL_KEY = 'sync_initial_restore_approval';

export interface InitialRestoreApproval {
  readonly businessId: string;
  readonly approvedAt: Date;
}

export type InitialRestoreApprovalResult =
  | { readonly status: 'APPROVED'; readonly approval: InitialRestoreApproval }
  | {
      readonly status: 'REFUSED';
      /**
       * NOT_BOUND / BUSINESS_MISMATCH: the database is not bound to that exact
       * Business. NOT_REQUIRED: the device already synchronizes (a current push
       * decision or acknowledged state exists). LOCAL_NOT_EMPTY: the device
       * holds operational data — a restore never runs over local data.
       */
      readonly reason: 'NOT_BOUND' | 'BUSINESS_MISMATCH' | 'NOT_REQUIRED' | 'LOCAL_NOT_EMPTY';
    };

/**
 * The pending restore approval for THIS Business, or undefined. An approval
 * recorded for another Business id, or an unreadable value, authorizes nothing.
 */
export function readInitialRestoreApproval(
  db: SourisDatabase,
  businessId: string,
): InitialRestoreApproval | undefined {
  const raw = readMetadata(db, SYNC_INITIAL_RESTORE_APPROVAL_KEY);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { businessId: storedId, approvedAt } = parsed as Record<string, unknown>;
    if (storedId !== businessId || typeof approvedAt !== 'string') return undefined;
    return { businessId, approvedAt: fromSqlInstant(approvedAt) };
  } catch {
    return undefined;
  }
}

/** Consumes (or withdraws) the restore approval. Call inside the restore transaction. */
export function clearInitialRestoreApproval(db: SourisDatabase): void {
  deleteMetadata(db, SYNC_INITIAL_RESTORE_APPROVAL_KEY);
}

/**
 * The ONE gate of a new-device restore: authorizes rebuilding the
 * EMPTY local database of this device from the remote data of `businessId`.
 *
 * It records the approval and nothing else — no request is made, no row is
 * written. The next sync run classifies both sides again and restores only if
 * the device is still "local empty + remote populated" for that same
 * Business. The restore re-verifies every precondition inside its own
 * transaction (restore.ts) and clears the approval only when it commits.
 *
 * An internal safety primitive, never a user action: its single caller is the
 * cloud sync runner (V1D.1), after a run answered RESTORE_REQUIRED for the
 * Business of its LIVE session.
 */
export function approveInitialRestore(
  db: SourisDatabase,
  businessId: string,
  now: Date = new Date(),
): InitialRestoreApprovalResult {
  let result: InitialRestoreApprovalResult = { status: 'REFUSED', reason: 'NOT_BOUND' };
  runInTransaction(db, () => {
    const boundBusinessId = readBoundBusinessId(db);
    if (boundBusinessId === undefined) return;
    if (boundBusinessId !== businessId) {
      result = { status: 'REFUSED', reason: 'BUSINESS_MISMATCH' };
      return;
    }
    const stored = readSyncBootstrapRecord(db, businessId);
    if (
      hasAcknowledgedRemoteState(db, businessId) ||
      (stored && isStoredPushDecisionCurrent(db, businessId, stored.decision))
    ) {
      result = { status: 'REFUSED', reason: 'NOT_REQUIRED' };
      return;
    }
    if (isLocalDatabasePopulated(db)) {
      result = { status: 'REFUSED', reason: 'LOCAL_NOT_EMPTY' };
      return;
    }
    const approval: InitialRestoreApproval = { businessId, approvedAt: now };
    writeMetadata(
      db,
      SYNC_INITIAL_RESTORE_APPROVAL_KEY,
      JSON.stringify({ businessId, approvedAt: toSqlInstant(now) }),
    );
    result = { status: 'APPROVED', approval };
  });
  return result;
}
