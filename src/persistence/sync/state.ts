// Souris — acknowledged remote revisions (Cloud Sync V1B)
//
// `sync_state` records, per aggregate, the remote `sync_version` this device
// last acknowledged (after a successful push or an applied pull) and when.
// It is NOT UI state and is NEVER written by a local business mutation: a
// local-only aggregate simply has no row, which means "no acknowledged remote
// revision". Only a future sync worker (V1C/V1D) writes here, with the
// server-assigned version it actually observed — never a fabricated value.
// V1E conflict detection compares this acknowledged version with the current
// remote one (docs/architecture/CLOUD_SYNC.md §9).

import type { SourisDatabase } from '../database';
import { fromSqlInstant, toSqlInstant } from '../values';

import type { SyncAggregateRef, SyncAggregateType } from './aggregate';

export interface SyncStateEntry extends SyncAggregateRef {
  readonly businessId: string;
  /** Server-assigned `sync_version` last acknowledged locally (>= 1). */
  readonly remoteVersion: number;
  readonly lastSyncedAt: Date;
}

interface SyncStateRow {
  readonly business_id: string;
  readonly aggregate_type: SyncAggregateType;
  readonly aggregate_id: string;
  readonly remote_version: number;
  readonly last_synced_at: string;
}

const SELECT_STATE =
  'SELECT business_id, aggregate_type, aggregate_id, remote_version, last_synced_at FROM sync_state';

function toEntry(row: SyncStateRow): SyncStateEntry {
  return {
    businessId: row.business_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    remoteVersion: row.remote_version,
    lastSyncedAt: fromSqlInstant(row.last_synced_at),
  };
}

/** Upserts the acknowledged remote revision of one aggregate. */
export function writeAcknowledgedRemoteVersion(db: SourisDatabase, entry: SyncStateEntry): void {
  if (!Number.isInteger(entry.remoteVersion) || entry.remoteVersion < 1) {
    throw new RangeError(
      `sync_state: remote_version must be a positive integer, got ${entry.remoteVersion}`,
    );
  }
  db.runSync(
    `INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(business_id, aggregate_type, aggregate_id) DO UPDATE SET
       remote_version = excluded.remote_version,
       last_synced_at = excluded.last_synced_at`,
    [
      entry.businessId,
      entry.aggregateType,
      entry.aggregateId,
      entry.remoteVersion,
      toSqlInstant(entry.lastSyncedAt),
    ],
  );
}

/** The acknowledged remote revision of one aggregate, or undefined when none was ever acknowledged. */
export function readAcknowledgedRemoteVersion(
  db: SourisDatabase,
  businessId: string,
  ref: SyncAggregateRef,
): SyncStateEntry | undefined {
  const row = db.getFirstSync<SyncStateRow>(
    `${SELECT_STATE} WHERE business_id = ? AND aggregate_type = ? AND aggregate_id = ?`,
    [businessId, ref.aggregateType, ref.aggregateId],
  );
  return row ? toEntry(row) : undefined;
}

/** Every acknowledged revision of the Business, in stable key order. */
export function loadSyncState(db: SourisDatabase, businessId: string): readonly SyncStateEntry[] {
  return db
    .getAllSync<SyncStateRow>(
      `${SELECT_STATE} WHERE business_id = ? ORDER BY aggregate_type, aggregate_id`,
      [businessId],
    )
    .map(toEntry);
}
