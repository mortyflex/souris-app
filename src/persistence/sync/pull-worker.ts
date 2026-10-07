// BeautIzzy — incremental pull (Cloud Sync V1D)
//
// Downloads what changed remotely for a Business that ALREADY synchronizes and
// applies it to SQLite under the conservative contract of CLOUD_SYNC.md §9.
// Invoked by the sync worker AFTER its push pass, never on its own.
//
//   1. read the aggregates changed since the pull cursor (minus an overlap;
//      no cursor yet = everything) — one consistent remote snapshot
//   2. validate ALL of it before any write (remote-snapshot.ts)
//   3. per aggregate, decided and applied in ONE synchronous turn — local
//      facts are read after the await, so no local mutation slips in between:
//
//        remote version <= acknowledged          known revision → skipped
//        local DIRTY (a pending outbox entry)    CONFLICT — neither side is touched; the entry
//                                                stays pending, the conflict is reported (V1E)
//        local clean, live remote aggregate      ONE transaction: row + complete child set
//                                                + sync_state ← the remote version
//        local clean, remote tombstone           ONE transaction: local permanent deletion
//                                                (guarded like a user deletion) + sync_state
//
//      live aggregates are written in dependency order (CLIENT … SALE), then
//      tombstones are applied in the reverse order, so references resolve and
//      deletion guards can be satisfied inside one pull;
//   4. the cursor advances to the snapshot's server time ONLY when nothing
//      was left unapplied. A conflict does not hold it — the pending outbox
//      entry keeps that aggregate's story; an aggregate that could not be
//      applied (missing reference, guarded tombstone) does, so it is fetched
//      again by the next pull.
//
// No echo: remote-apply.ts writes rows, never an outbox entry, so nothing that
// came from the remote is pushed back. Every step is idempotent — an
// interrupted pull is simply repeated and already-acknowledged revisions are
// skipped.

import { runInTransaction, type SourisDatabase } from '../database';

import { readBoundBusinessId, type SyncAggregateRef, type SyncConflict } from './aggregate';
import { findSyncOutboxEntry } from './outbox';
import { nextPullSince, readSyncPullCursor, writeSyncPullCursor } from './pull-cursor';
import { applyRemoteAggregate, applyRemoteTombstone } from './remote-apply';
import {
  SyncRemoteError,
  type RemoteBusinessSnapshot,
  type SyncRemoteFailureCode,
  type SyncRemoteGateway,
} from './remote-gateway';
import {
  listSnapshotEntries,
  parseRemoteBusinessSnapshot,
  RemoteSnapshotInvalidError,
  type RemotePulledEntry,
} from './remote-snapshot';
import { readAcknowledgedRemoteVersion, writeAcknowledgedRemoteVersion } from './state';

export type SyncPullSummary =
  | {
      readonly status: 'FAILED';
      /** Nothing was applied and the cursor did not move. */
      readonly reason: SyncRemoteFailureCode | 'INVALID_REMOTE_DATA' | 'LOCAL';
    }
  | {
      readonly status: 'PULLED';
      /** Aggregates the remote returned (overlap re-reads included). */
      readonly fetched: number;
      /** Live remote aggregates written to SQLite. */
      readonly applied: number;
      /** Local aggregates removed by a remote tombstone. */
      readonly deleted: number;
      /** Already-acknowledged revisions, and tombstones of aggregates this device does not hold. */
      readonly skipped: number;
      /** Could not be applied (missing reference, guarded tombstone, local scope); fetched again next time. */
      readonly failed: number;
      /** Remote newer AND local dirty: neither side was touched. */
      readonly conflicts: readonly SyncConflict[];
      readonly cursorAdvanced: boolean;
    };

type Outcome = 'APPLIED' | 'DELETED' | 'SKIPPED' | 'FAILED' | SyncConflict;

function settle(db: SourisDatabase, businessId: string, entry: RemotePulledEntry, now: Date): Outcome {
  const ref: SyncAggregateRef = { aggregateType: entry.aggregateType, aggregateId: entry.aggregate.id };
  const acknowledgedVersion = readAcknowledgedRemoteVersion(db, businessId, ref)?.remoteVersion;
  if (acknowledgedVersion !== undefined && entry.aggregate.syncVersion <= acknowledgedVersion) return 'SKIPPED';

  const pending = findSyncOutboxEntry(db, businessId, ref);
  if (pending) {
    return {
      ...ref,
      operation: pending.operation,
      acknowledgedVersion,
      remoteVersion: entry.aggregate.syncVersion,
    };
  }

  let outcome: Outcome = 'FAILED';
  try {
    runInTransaction(db, () => {
      if (entry.aggregate.payload === undefined) {
        const removal = applyRemoteTombstone(db, ref);
        // A guarded tombstone writes nothing: the revision stays unacknowledged.
        if (removal === 'BLOCKED') return;
        outcome = removal === 'DELETED' ? 'DELETED' : 'SKIPPED';
      } else {
        applyRemoteAggregate(db, businessId, entry);
        outcome = 'APPLIED';
      }
      writeAcknowledgedRemoteVersion(db, {
        businessId,
        ...ref,
        remoteVersion: entry.aggregate.syncVersion,
        lastSyncedAt: now,
      });
    });
  } catch {
    // Rolled back: this aggregate is untouched and will be fetched again.
    return 'FAILED';
  }
  return outcome;
}

/** Never rejects. */
export async function pullRemoteChanges(options: {
  readonly database: SourisDatabase;
  readonly gateway: SyncRemoteGateway;
  readonly businessId: string;
  readonly now: () => Date;
}): Promise<SyncPullSummary> {
  const { database: db, gateway, businessId, now } = options;
  let snapshot: RemoteBusinessSnapshot;
  try {
    snapshot = parseRemoteBusinessSnapshot(
      await gateway.pullBusinessAggregates(businessId, nextPullSince(db, businessId)),
    );
  } catch (error) {
    if (error instanceof RemoteSnapshotInvalidError) return { status: 'FAILED', reason: 'INVALID_REMOTE_DATA' };
    return { status: 'FAILED', reason: error instanceof SyncRemoteError ? error.code : 'LOCAL' };
  }

  try {
    // The read was awaited: the device may have been reset or rebound meanwhile.
    if (readBoundBusinessId(db) !== businessId) return { status: 'FAILED', reason: 'LOCAL' };

    const entries = listSnapshotEntries(snapshot);
    const live = entries.filter((entry) => entry.aggregate.payload !== undefined);
    const tombstones = entries.filter((entry) => entry.aggregate.payload === undefined).reverse();

    let applied = 0;
    let deleted = 0;
    let skipped = 0;
    let failed = 0;
    const conflicts: SyncConflict[] = [];
    for (const entry of [...live, ...tombstones]) {
      const outcome = settle(db, businessId, entry, now());
      if (outcome === 'APPLIED') applied += 1;
      else if (outcome === 'DELETED') deleted += 1;
      else if (outcome === 'SKIPPED') skipped += 1;
      else if (outcome === 'FAILED') failed += 1;
      else conflicts.push(outcome);
    }

    const cursor = readSyncPullCursor(db, businessId);
    const cursorAdvanced = failed === 0 && (cursor === undefined || snapshot.pulledAt > cursor);
    if (cursorAdvanced) writeSyncPullCursor(db, businessId, snapshot.pulledAt);

    return { status: 'PULLED', fetched: entries.length, applied, deleted, skipped, failed, conflicts, cursorAdvanced };
  } catch {
    return { status: 'FAILED', reason: 'LOCAL' };
  }
}
