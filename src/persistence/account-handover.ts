// BeautIzzy — handing the device over to another account
//
// The local database is bound to ONE account (`business_profile`,
// PERSISTENCE.md §4b). When another account signs in, the root gate shows the
// account conflict (AUTH.md §6). This module is what lets that device change
// hands WITHOUT a reinstall, under one rule:
//
//   nothing the bound account holds on this device may be lost.
//
// `assessLocalAccountData` says what the bound account still holds here that
// the remote never acknowledged — without asking the remote (the other
// account's session could not ask about this Business anyway):
//
//   pendingOutboxEntries      an intent the push worker has not settled: a
//                             change, a deletion, a refused or held write
//                             (whatever Business id it names)
//   unacknowledgedAggregates  a row of an aggregate table with NO acknowledged
//                             revision for the bound Business in `sync_state`:
//                             created before any upload, never uploaded, or
//                             stamped with another Business id
//   localOnlyProductImages    a legacy Product image that exists on this
//                             device only (`products.image_uri` without a
//                             shared photo): nothing can ever send it
//
// `sync_state` holds versions the SERVER returned (CLOUD_SYNC.md §10.7): it is
// the one durable local proof that a row reached the account's Business. A
// stored first-sync decision proves nothing here and is not consulted.
//
// `releaseDeviceFromAccount` is the hand-over itself: ONE transaction that
// assesses again INSIDE it, then deletes every operational row, the sync
// bookkeeping, every metadata entry and the binding — and writes the seed
// marker back, so the device is EMPTY and UNBOUND, exactly like a fresh
// install that will never be seeded: the next account binds and restores
// through the ordinary first sync (CLOUD_SYNC.md §17). Anything refused or
// failing leaves the database exactly as it was. The schema is kept.
//
// Nothing here touches the remote: the released account's data stays on its
// Business, where its own devices find it.

import { runInTransaction, type SourisDatabase } from './database';
import { writeMetadata } from './metadata';
import { SOURIS_TABLES, SYNC_TABLES } from './schema';
import { CURRENT_SEED_VERSION, SEED_VERSION_KEY } from './seed';
import { readBusinessProfile } from './stores/business-profile';
import type { SyncAggregateType } from './sync/aggregate';

export interface LocalAccountDataAssessment {
  readonly pendingOutboxEntries: number;
  readonly unacknowledgedAggregates: number;
  readonly localOnlyProductImages: number;
}

const AGGREGATE_SOURCES: readonly (readonly [SyncAggregateType, string])[] = [
  ['CLIENT', 'clients'],
  ['SERVICE', 'services'],
  ['PRODUCT', 'products'],
  ['APPOINTMENT', 'appointments'],
  ['SALE', 'sales'],
  ['CALENDAR_BLOCK', 'calendar_blocks'],
  ['APPOINTMENT_DEPOSIT', 'appointment_deposits'],
  ['SERVICE_CATEGORY', 'service_categories'],
  ['SALE_ADJUSTMENT', 'sale_adjustments'],
];

interface CountRow {
  readonly count: number;
}

function count(db: SourisDatabase, sql: string, params: readonly string[] = []): number {
  return db.getFirstSync<CountRow>(sql, params)?.count ?? 0;
}

/** What the bound Business still holds on this device that the remote never acknowledged. Reads only. */
export function assessLocalAccountData(
  db: SourisDatabase,
  businessId: string,
): LocalAccountDataAssessment {
  let unacknowledgedAggregates = 0;
  for (const [aggregateType, table] of AGGREGATE_SOURCES) {
    unacknowledgedAggregates += count(
      db,
      `SELECT COUNT(*) AS count FROM ${table} AS source
       WHERE NOT EXISTS (
         SELECT 1 FROM sync_state
         WHERE sync_state.business_id = ? AND sync_state.aggregate_type = ? AND sync_state.aggregate_id = source.id
       )`,
      [businessId, aggregateType],
    );
  }
  return {
    pendingOutboxEntries: count(db, 'SELECT COUNT(*) AS count FROM sync_outbox'),
    unacknowledgedAggregates,
    localOnlyProductImages: count(
      db,
      'SELECT COUNT(*) AS count FROM products WHERE image_uri IS NOT NULL AND photo_path IS NULL',
    ),
  };
}

/** True when releasing the device would lose something only this device holds. */
export function hasUnsentLocalData(assessment: LocalAccountDataAssessment): boolean {
  return (
    assessment.pendingOutboxEntries > 0 ||
    assessment.unacknowledgedAggregates > 0 ||
    assessment.localOnlyProductImages > 0
  );
}

export type DeviceHandoverRefusal =
  /** The database is not bound to any account. */
  | 'NOT_BOUND'
  /** The database is bound to another Business than the one named. */
  | 'BUSINESS_MISMATCH'
  /** The bound account still holds something here the remote never acknowledged. */
  | 'UNSENT_LOCAL_DATA';

/** The release was refused; the database is exactly as it was. */
export class DeviceHandoverRefusedError extends Error {
  readonly reason: DeviceHandoverRefusal;

  constructor(reason: DeviceHandoverRefusal) {
    super(`Device hand-over refused: ${reason}`);
    this.name = 'DeviceHandoverRefusedError';
    this.reason = reason;
  }
}

/**
 * Releases the device from the Business it is bound to, in ONE transaction:
 * every operational row, the sync bookkeeping, every metadata entry and the
 * binding are deleted, and the seed marker is written back so the empty
 * device is never seeded. Refused — throwing `DeviceHandoverRefusedError`
 * with nothing changed — unless the binding still names `businessId` and the
 * assessment, taken inside the transaction, finds nothing unsent.
 */
export function releaseDeviceFromAccount(db: SourisDatabase, businessId: string): void {
  runInTransaction(db, () => {
    const bound = readBusinessProfile(db);
    if (!bound) throw new DeviceHandoverRefusedError('NOT_BOUND');
    if (bound.id !== businessId) throw new DeviceHandoverRefusedError('BUSINESS_MISMATCH');
    if (hasUnsentLocalData(assessLocalAccountData(db, businessId))) {
      throw new DeviceHandoverRefusedError('UNSENT_LOCAL_DATA');
    }
    for (const table of [...SOURIS_TABLES, ...SYNC_TABLES]) {
      db.runSync(`DELETE FROM ${table}`);
    }
    db.runSync('DELETE FROM business_profile');
    db.runSync('DELETE FROM souris_metadata');
    // Never seeded again: an empty device waits for the next account's data (CLOUD_SYNC.md §17.3).
    writeMetadata(db, SEED_VERSION_KEY, String(CURRENT_SEED_VERSION));
  });
}
