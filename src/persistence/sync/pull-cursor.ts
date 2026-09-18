// Souris — incremental pull cursor (Cloud Sync V1D)
//
// The SERVER time of the last remote read this device fully applied, stored
// in `souris_metadata` as `{ businessId, pulledAt }`. It is a server clock
// value end to end — the device clock never takes part in it.
//
// The remote stamps `updated_at` with the START time of the writing
// transaction, so a write that began before a pull and committed after it is
// invisible to that pull yet older than its `pulledAt`. The next pull
// therefore asks for `pulledAt - PULL_OVERLAP_MS`: rows inside the overlap
// are simply fetched again and skipped by their acknowledged version
// (CLOUD_SYNC.md §7). The overlap is far larger than any remote transaction
// can last.
//
// A cursor written for another Business id is ignored, never inherited. The
// development reset clears it with the rest of the sync bookkeeping.

import type { SourisDatabase } from '../database';
import { readMetadata, writeMetadata } from '../metadata';
import { fromSqlInstant, toSqlInstant } from '../values';

export const SYNC_PULL_CURSOR_KEY = 'sync_pull_cursor';

/** Re-read window before the stored cursor; idempotent by acknowledged version. */
export const PULL_OVERLAP_MS = 5 * 60_000;

export function readSyncPullCursor(db: SourisDatabase, businessId: string): Date | undefined {
  const raw = readMetadata(db, SYNC_PULL_CURSOR_KEY);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { businessId: storedId, pulledAt } = parsed as Record<string, unknown>;
    if (storedId !== businessId || typeof pulledAt !== 'string') return undefined;
    return fromSqlInstant(pulledAt);
  } catch {
    return undefined;
  }
}

export function writeSyncPullCursor(db: SourisDatabase, businessId: string, pulledAt: Date): void {
  writeMetadata(db, SYNC_PULL_CURSOR_KEY, JSON.stringify({ businessId, pulledAt: toSqlInstant(pulledAt) }));
}

/** The `since` of the next incremental read: undefined (everything) until a first pull completed. */
export function nextPullSince(db: SourisDatabase, businessId: string): Date | undefined {
  const cursor = readSyncPullCursor(db, businessId);
  return cursor === undefined ? undefined : new Date(cursor.getTime() - PULL_OVERLAP_MS);
}
