// BeautIzzy — new-device restore (Cloud Sync V1D)
//
// Rebuilds the EMPTY local database of a bound device from the remote data of
// its Business. It runs only from the sync worker, only when the first-sync
// classification is RESTORE_REQUIRED (local empty + remote populated) AND an
// `approveInitialRestore` exists for that exact Business (recorded by the
// cloud sync runner since V1D.1 — CLOUD_SYNC.md §17).
//
//   1. fetch the COMPLETE remote dataset            one consistent remote snapshot
//   2. validate ALL of it                           remote-snapshot.ts — before any write
//   3. ONE SQLite transaction:
//        re-verify the preconditions                bound to this Business, still empty,
//                                                   no acknowledged state, approval present
//        write every live aggregate                 CLIENT, SERVICE, PRODUCT, APPOINTMENT, SALE,
//                                                   CALENDAR_BLOCK, APPOINTMENT_DEPOSIT
//                                                   (children with their parent; tombstones skipped)
//        sync_state ← each remote sync_version      tombstones included: they are known revisions
//        sync_outbox emptied                        nothing restored is ever pushed back
//        pull cursor ← the snapshot's server time
//        sync_bootstrap ← ALREADY_SYNCED
//        the approval is consumed
//
// Anything that throws — before or inside the transaction — leaves SQLite
// exactly as it was: still empty, still RESTORE_REQUIRED, approval still
// pending. The next run simply tries again; there is no partial restore and
// no restore state to repair.
//
// Outbox: with empty tables and no acknowledged state, a pending entry can
// only describe an aggregate that no longer exists locally and was never
// uploaded by this device (nothing is pushed under a STOP decision, and EMPTY
// never uploads). Such intents mean nothing to the restored dataset and are
// dropped with the restore.

import { runInTransaction, type SourisDatabase } from '../database';

import { readBoundBusinessId } from './aggregate';
import {
  clearInitialRestoreApproval,
  isLocalDatabasePopulated,
  readInitialRestoreApproval,
  writeSyncBootstrapRecord,
} from './bootstrap';
import { writeSyncPullCursor } from './pull-cursor';
import { applyRemoteAggregate } from './remote-apply';
import { SyncRemoteError, type RemoteBusinessSnapshot, type SyncRemoteFailureCode, type SyncRemoteGateway } from './remote-gateway';
import {
  assertSnapshotReferences,
  listSnapshotEntries,
  parseRemoteBusinessSnapshot,
  RemoteSnapshotInvalidError,
} from './remote-snapshot';
import { hasAcknowledgedRemoteState, writeAcknowledgedRemoteVersion } from './state';

export type RestorePrecondition = 'NOT_BOUND' | 'NOT_APPROVED' | 'LOCAL_NOT_EMPTY' | 'ALREADY_SYNCED';

/** The device is no longer an empty, approved, unsynchronized device of this Business. Nothing was written. */
export class RestorePreconditionError extends Error {
  constructor(readonly precondition: RestorePrecondition) {
    super(`Restore refused: ${precondition}`);
    this.name = 'RestorePreconditionError';
  }
}

export interface RestoreCounts {
  readonly clients: number;
  readonly services: number;
  readonly products: number;
  readonly appointments: number;
  readonly sales: number;
  readonly calendarBlocks: number;
  readonly appointmentDeposits: number;
  /** Remote tombstones: acknowledged, never written as rows. */
  readonly tombstones: number;
}

const COUNT_KEY = {
  CLIENT: 'clients',
  SERVICE: 'services',
  PRODUCT: 'products',
  APPOINTMENT: 'appointments',
  SALE: 'sales',
  CALENDAR_BLOCK: 'calendarBlocks',
  APPOINTMENT_DEPOSIT: 'appointmentDeposits',
} as const;

/**
 * Step 3 — the local half of the restore, in ONE transaction. `snapshot` must
 * be the validated COMPLETE dataset. Throws `RestorePreconditionError` (or
 * whatever SQLite raises) with the database untouched.
 */
export function restoreBusinessSnapshot(
  db: SourisDatabase,
  businessId: string,
  snapshot: RemoteBusinessSnapshot,
  now: Date,
): RestoreCounts {
  const counts = {
    clients: 0,
    services: 0,
    products: 0,
    appointments: 0,
    sales: 0,
    calendarBlocks: 0,
    appointmentDeposits: 0,
    tombstones: 0,
  };
  runInTransaction(db, () => {
    // Facts are read INSIDE the transaction: the fetch was awaited, and the
    // device may have changed meanwhile (a first record, a reset, a rebind).
    if (readBoundBusinessId(db) !== businessId) throw new RestorePreconditionError('NOT_BOUND');
    if (readInitialRestoreApproval(db, businessId) === undefined) {
      throw new RestorePreconditionError('NOT_APPROVED');
    }
    if (hasAcknowledgedRemoteState(db, businessId)) throw new RestorePreconditionError('ALREADY_SYNCED');
    if (isLocalDatabasePopulated(db)) throw new RestorePreconditionError('LOCAL_NOT_EMPTY');

    for (const entry of listSnapshotEntries(snapshot)) {
      if (entry.aggregate.payload === undefined) {
        counts.tombstones += 1;
      } else {
        applyRemoteAggregate(db, businessId, entry);
        counts[COUNT_KEY[entry.aggregateType]] += 1;
      }
      writeAcknowledgedRemoteVersion(db, {
        businessId,
        aggregateType: entry.aggregateType,
        aggregateId: entry.aggregate.id,
        remoteVersion: entry.aggregate.syncVersion,
        lastSyncedAt: now,
      });
    }

    db.runSync('DELETE FROM sync_outbox WHERE business_id = ?', [businessId]);
    writeSyncPullCursor(db, businessId, snapshot.pulledAt);
    writeSyncBootstrapRecord(db, { businessId, decision: 'ALREADY_SYNCED', decidedAt: now });
    clearInitialRestoreApproval(db);
  });
  return counts;
}

export type RestoreOutcome =
  | { readonly status: 'RESTORED'; readonly restored: RestoreCounts }
  | {
      readonly status: 'FAILED';
      /**
       * A remote failure code; INVALID_REMOTE_DATA when the dataset was refused
       * by validation; RESTORE_REFUSED when the device stopped being restorable
       * while the dataset was fetched; LOCAL for a SQLite failure. In every
       * case SQLite is unchanged and the approval is still pending.
       */
      readonly reason: SyncRemoteFailureCode | 'INVALID_REMOTE_DATA' | 'RESTORE_REFUSED' | 'LOCAL';
    };

/** Steps 1 → 3. Never rejects. */
export async function restoreBusinessFromRemote(options: {
  readonly database: SourisDatabase;
  readonly gateway: SyncRemoteGateway;
  readonly businessId: string;
  readonly now: () => Date;
}): Promise<RestoreOutcome> {
  const { database: db, gateway, businessId, now } = options;
  let snapshot: RemoteBusinessSnapshot;
  try {
    snapshot = parseRemoteBusinessSnapshot(await gateway.pullBusinessAggregates(businessId, undefined));
    assertSnapshotReferences(snapshot);
  } catch (error) {
    if (error instanceof RemoteSnapshotInvalidError) return { status: 'FAILED', reason: 'INVALID_REMOTE_DATA' };
    return { status: 'FAILED', reason: error instanceof SyncRemoteError ? error.code : 'UNKNOWN' };
  }
  try {
    return { status: 'RESTORED', restored: restoreBusinessSnapshot(db, businessId, snapshot, now()) };
  } catch (error) {
    return {
      status: 'FAILED',
      reason: error instanceof RestorePreconditionError ? 'RESTORE_REFUSED' : 'LOCAL',
    };
  }
}
