// Souris — first sync of a bound Business (Cloud Sync V1C, CLOUD_SYNC.md §11)
//
// Before anything is pushed, the device decides what the first sync of its
// Business is, from the population of BOTH sides:
//
//   acknowledged remote state already on the device → ALREADY_SYNCED                    push
//   local empty      remote empty                   → EMPTY                             push (nothing to upload)
//   local populated  remote empty   NOT approved    → INITIAL_UPLOAD_REQUIRES_APPROVAL  STOP — nothing enqueued,
//                                                                                        nothing pushed
//   local populated  remote empty   approved        → INITIAL_UPLOAD                    enqueue everything, push
//   local empty      remote populated               → RESTORE_REQUIRED                  STOP — V1D restore
//   local populated  remote populated               → RECONCILIATION_REQUIRED           STOP — never local-wins
//                                                                                        or remote-wins silently
//
// Uploading a device's EXISTING data into an empty Business is never
// automatic: a development device full of fixtures bound to a fresh Business
// looks exactly like the pilot device. It needs ONE explicit approval for
// that exact Business UUID (`approveInitialUpload`), persisted locally,
// consumed by the run that enqueues the aggregates, never valid for another
// Business, and cleared by the development reset. Classification itself is
// automatic and harmless: it reads one remote count and writes no data.
//
// The decision is stored in `souris_metadata`, but a stored decision is a
// push licence ONLY while what justified it still holds
// (`isStoredPushDecisionCurrent`):
//
//   INITIAL_UPLOAD   the explicit approval for this Business — durable: an
//                    interrupted upload resumes without a second approval
//   ALREADY_SYNCED   only while `sync_state` really holds an acknowledged
//                    revision for this Business
//   EMPTY            only while there is still NOTHING to push. EMPTY means
//                    "both sides held nothing when we looked"; it is NOT an
//                    acknowledgement that the device is synchronized and it
//                    never authorizes uploading data created afterwards. The
//                    first local aggregate (or outbox entry) makes it stale:
//                    the next run classifies again, and — with no acknowledged
//                    state — lands on INITIAL_UPLOAD_REQUIRES_APPROVAL
//
// Only actual acknowledged state, or the explicit approval, ever lets data
// leave the device. A pending outbox proves nothing about synchronization.
//
// A STOP decision is stored for diagnosis but RE-EVALUATED on the next
// explicit run: the way out is an explicit action (the approval, a V1D
// restore, an explicit reconciliation, or an explicit cleanup of a test
// Business), after which the classification changes.
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
  /** An explicit, unconsumed initial-upload approval exists for THIS Business. */
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

const AGGREGATE_TABLES = ['clients', 'services', 'products', 'appointments', 'sales'] as const;

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
 * The ONE explicit gate of an initial upload: authorizes uploading the
 * existing local data of `businessId` into its EMPTY remote Business.
 *
 * It records the approval and nothing else — no aggregate is enqueued, no
 * request is made. The next sync run classifies both sides again and, only
 * if the device is still "local populated + remote empty" for that same
 * Business, enqueues every aggregate and consumes the approval in ONE
 * transaction. A populated remote stays a STOP whatever was approved.
 *
 * Never called by the application on its own: there is no UI yet, and the
 * pilot transfer invokes it during the supervised migration.
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
