// Souris — local sync outbox (Cloud Sync V1B)
//
// ONE current pending record per aggregate, written INSIDE the transaction
// of the business mutation it describes (the stores call `markAggregate…`
// from within their own `runInTransaction`). Mutation and outbox row commit
// or roll back together; nothing is ever enqueued after a commit.
//
// Coalescing (deterministic, per `(business_id, aggregate_type, aggregate_id)`):
//
//   no row            + UPSERT → new row, operation UPSERT, revision 1
//   no row            + DELETE → new row, operation DELETE, revision 1
//   UPSERT pending    + UPSERT → same row, revision + 1, updated_at refreshed
//   UPSERT pending    + DELETE → same row, operation DELETE (delete overrides)
//   DELETE pending    + UPSERT → same row, operation UPSERT (the aggregate was
//                                recreated with the same id: the current local
//                                state is "exists", so that is what is pushed)
//   DELETE pending    + DELETE → same row, revision + 1
//
// Retry metadata belongs to the revision that failed: every coalesced
// mutation resets `attempt_count = 0`, `last_error = NULL` and
// `next_attempt_at = NULL`, so a newer local revision never inherits a stale
// failure or backoff. `id` and `created_at` never change: the entry keeps
// its place.
//
// A DELETE row holds only the aggregate identity. It survives the local row
// (which is gone by the time it commits) so V1C can send a remote tombstone
// without reading anything local.
//
// The outbox is bookkeeping: not part of the hydrated snapshot, never uploaded.

import { runInTransaction, type SourisDatabase } from '../database';
import { fromSqlInstant, fromSqlOptional, toSqlInstant } from '../values';

import {
  readBoundBusinessId,
  type SyncAggregateRef,
  type SyncAggregateType,
  type SyncOperation,
} from './aggregate';

export interface SyncOutboxEntry extends SyncAggregateRef {
  readonly id: number;
  readonly businessId: string;
  readonly operation: SyncOperation;
  /** Increases on every coalesced mutation; the settle token of a worker. */
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attemptCount: number;
  readonly lastError?: string;
  /** NULL means eligible now. */
  readonly nextAttemptAt?: Date;
}

interface SyncOutboxRow {
  readonly id: number;
  readonly business_id: string;
  readonly aggregate_type: SyncAggregateType;
  readonly aggregate_id: string;
  readonly operation: SyncOperation;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly attempt_count: number;
  readonly last_error: string | null;
  readonly next_attempt_at: string | null;
}

const SELECT_ENTRY =
  'SELECT id, business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at FROM sync_outbox';

function toEntry(row: SyncOutboxRow): SyncOutboxEntry {
  const lastError = fromSqlOptional(row.last_error);
  const nextAttemptAt =
    row.next_attempt_at === null ? undefined : fromSqlInstant(row.next_attempt_at);
  return {
    id: row.id,
    businessId: row.business_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    operation: row.operation,
    revision: row.revision,
    createdAt: fromSqlInstant(row.created_at),
    updatedAt: fromSqlInstant(row.updated_at),
    attemptCount: row.attempt_count,
    ...(lastError !== undefined ? { lastError } : {}),
    ...(nextAttemptAt !== undefined ? { nextAttemptAt } : {}),
  };
}

function enqueue(
  db: SourisDatabase,
  ref: SyncAggregateRef,
  operation: SyncOperation,
  now: Date,
): void {
  if (ref.aggregateId.trim().length === 0) {
    throw new RangeError(`sync_outbox: empty aggregate id for ${ref.aggregateType}`);
  }
  const businessId = readBoundBusinessId(db);
  if (businessId === undefined) return;

  const instant = toSqlInstant(now);
  db.runSync(
    `INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(business_id, aggregate_type, aggregate_id) DO UPDATE SET
       operation = excluded.operation,
       revision = sync_outbox.revision + 1,
       updated_at = excluded.updated_at,
       attempt_count = 0,
       last_error = NULL,
       next_attempt_at = NULL`,
    [businessId, ref.aggregateType, ref.aggregateId, operation, instant, instant],
  );
}

/**
 * Records that the current local state of the aggregate must reach the
 * remote. Call INSIDE the mutation's transaction (`runInTransaction` joins
 * it). A no-op while the database is unbound.
 */
export function markAggregateUpserted(
  db: SourisDatabase,
  aggregateType: SyncAggregateType,
  aggregateId: string,
  now: Date = new Date(),
): void {
  runInTransaction(db, () => enqueue(db, { aggregateType, aggregateId }, 'UPSERT', now));
}

/**
 * Records that the aggregate was permanently deleted locally and needs a
 * remote tombstone. Same transaction rule as `markAggregateUpserted`.
 */
export function markAggregateDeleted(
  db: SourisDatabase,
  aggregateType: SyncAggregateType,
  aggregateId: string,
  now: Date = new Date(),
): void {
  runInTransaction(db, () => enqueue(db, { aggregateType, aggregateId }, 'DELETE', now));
}

/** Every pending entry of the Business, oldest first (`id` order). */
export function loadSyncOutbox(db: SourisDatabase, businessId: string): readonly SyncOutboxEntry[] {
  return db
    .getAllSync<SyncOutboxRow>(`${SELECT_ENTRY} WHERE business_id = ? ORDER BY id`, [businessId])
    .map(toEntry);
}

export function findSyncOutboxEntry(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): SyncOutboxEntry | undefined {
  const row = db.getFirstSync<SyncOutboxRow>(
    `${SELECT_ENTRY} WHERE business_id = ? AND aggregate_type = ? AND aggregate_id = ?`,
    [businessId, ref.aggregateType, ref.aggregateId],
  );
  return row ? toEntry(row) : undefined;
}

/**
 * Removes an entry ONLY if it is still at the revision the caller observed
 * when it read the aggregate. Returns whether the entry was removed. A
 * mutation coalesced meanwhile keeps the entry (with its newer revision) so
 * the fresh local state is pushed on the next attempt — the single-record
 * model is safe because settling is conditional.
 */
export function settleSyncOutboxEntry(
  db: SourisDatabase,
  entryId: number,
  observedRevision: number,
): boolean {
  return (
    db.runSync('DELETE FROM sync_outbox WHERE id = ? AND revision = ?', [entryId, observedRevision])
      .changes === 1
  );
}

/**
 * Records one failed attempt: count, a STABLE machine code (never a server
 * message — it may quote row values), and when the entry becomes eligible
 * again. Conditional on the revision the worker observed: a mutation
 * coalesced during the attempt already reset the retry metadata, and the
 * newer revision must stay eligible at once. Returns whether it was recorded.
 */
export function recordSyncOutboxFailure(
  db: SourisDatabase,
  entryId: number,
  error: string,
  nextAttemptAt: Date | undefined,
  observedRevision?: number,
): boolean {
  const next = nextAttemptAt === undefined ? null : toSqlInstant(nextAttemptAt);
  const result =
    observedRevision === undefined
      ? db.runSync(
          'UPDATE sync_outbox SET attempt_count = attempt_count + 1, last_error = ?, next_attempt_at = ? WHERE id = ?',
          [error, next, entryId],
        )
      : db.runSync(
          'UPDATE sync_outbox SET attempt_count = attempt_count + 1, last_error = ?, next_attempt_at = ? WHERE id = ? AND revision = ?',
          [error, next, entryId, observedRevision],
        );
  return result.changes === 1;
}

/**
 * Push order of the worker (CLOUD_SYNC.md §10.8): remote foreign keys make a
 * Client precede its Appointments and Sales, and an Appointment precede its
 * linked Sale; inside one type the FIFO `id` order is kept.
 */
const PUSH_ORDER_SQL = `CASE aggregate_type
  WHEN 'CLIENT' THEN 0 WHEN 'SERVICE' THEN 1 WHEN 'PRODUCT' THEN 2 WHEN 'APPOINTMENT' THEN 3 ELSE 4 END`;

/** Entries of the Business whose backoff elapsed (`next_attempt_at` NULL or <= now), in push order. */
export function loadEligibleSyncOutbox(
  db: SourisDatabase,
  businessId: string,
  now: Date,
): readonly SyncOutboxEntry[] {
  return db
    .getAllSync<SyncOutboxRow>(
      `${SELECT_ENTRY} WHERE business_id = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY ${PUSH_ORDER_SQL}, id`,
      [businessId, toSqlInstant(now)],
    )
    .map(toEntry);
}

/**
 * Initial upload (CLOUD_SYNC.md §11): records an UPSERT intent for EVERY
 * local aggregate of the bound Business that has neither a pending entry
 * nor an acknowledged remote revision. Existing entries are left exactly as
 * they are (no revision bump, no operation change), nothing is written to
 * `sync_state`: the aggregates are queued, not declared synchronized.
 * Business-scoped rows stamped with another id are NOT enqueued. Returns the
 * number of entries created. Called ONLY by the push worker, inside the
 * transaction that consumes the approval (CLOUD_SYNC.md §11.1).
 */
export function enqueueInitialUpload(db: SourisDatabase, businessId: string, now: Date): number {
  const instant = toSqlInstant(now);
  const sources: readonly (readonly [SyncAggregateType, string, boolean])[] = [
    ['CLIENT', 'clients', false],
    ['SERVICE', 'services', true],
    ['PRODUCT', 'products', true],
    ['APPOINTMENT', 'appointments', true],
    ['SALE', 'sales', true],
  ];
  let created = 0;
  runInTransaction(db, () => {
    for (const [aggregateType, table, scoped] of sources) {
      created += db.runSync(
        `INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at)
         SELECT ?, ?, source.id, 'UPSERT', 1, ?, ?
         FROM ${table} AS source
         WHERE NOT EXISTS (
             SELECT 1 FROM sync_state
             WHERE sync_state.business_id = ? AND sync_state.aggregate_type = ? AND sync_state.aggregate_id = source.id
           )${scoped ? ' AND source.business_id = ?' : ''}
         ORDER BY source.rowid
         ON CONFLICT(business_id, aggregate_type, aggregate_id) DO NOTHING`,
        [
          businessId,
          aggregateType,
          instant,
          instant,
          businessId,
          aggregateType,
          ...(scoped ? [businessId] : []),
        ],
      ).changes;
    }
  });
  return created;
}

/** Whether the Business has ANY pending entry, eligible or not (one indexed SELECT). */
export function hasPendingSyncOutbox(db: SourisDatabase, businessId: string): boolean {
  return (
    db.getFirstSync<{ readonly found: number }>(
      'SELECT 1 AS found FROM sync_outbox WHERE business_id = ? LIMIT 1',
      [businessId],
    ) !== null
  );
}

/** Test-oriented helper: the number of outbox rows regardless of Business (must equal the scoped count). */
export function countSyncOutboxRows(db: SourisDatabase): number {
  return db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_outbox')?.count ?? 0;
}
