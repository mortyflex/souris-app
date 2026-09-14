// Souris — Cloud Sync V1B: acknowledged remote revisions round trip

import { bootstrapPersistence } from '../bootstrap';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import {
  loadSyncState,
  readAcknowledgedRemoteVersion,
  writeAcknowledgedRemoteVersion,
  type SyncStateEntry,
} from '../sync/state';
import { createTestSeed, REMOTE_BUSINESS_ID, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const clientRef = { aggregateType: 'CLIENT', aggregateId: 'client-lea' } as const;

const acknowledged: SyncStateEntry = {
  businessId: REMOTE_BUSINESS_ID,
  ...clientRef,
  remoteVersion: 3,
  lastSyncedAt: new Date('2026-09-14T10:15:30.250Z'),
};

function openBoundDatabase() {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

describe('sync_state', () => {
  it('starts empty: a local-only aggregate has no acknowledged remote revision', () => {
    const db = openBoundDatabase();

    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, clientRef)).toBeUndefined();
  });

  it('round-trips the exact version and instant, survives a restart, and upserts on re-acknowledgement', () => {
    const db = openBoundDatabase();

    writeAcknowledgedRemoteVersion(db, acknowledged);
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, clientRef)).toEqual(acknowledged);

    bootstrapPersistence(db, createTestSeed);
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, clientRef)).toEqual(acknowledged);

    const later = { ...acknowledged, remoteVersion: 4, lastSyncedAt: new Date('2026-09-14T11:00:00.000Z') };
    writeAcknowledgedRemoteVersion(db, later);
    writeAcknowledgedRemoteVersion(db, { ...acknowledged, aggregateType: 'SALE', aggregateId: 'sale-1', remoteVersion: 1 });

    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([
      later,
      { ...acknowledged, aggregateType: 'SALE', aggregateId: 'sale-1', remoteVersion: 1 },
    ]);
    expect(
      db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_state')?.count,
    ).toBe(2);
  });

  it('is scoped by Business', () => {
    const db = openBoundDatabase();
    writeAcknowledgedRemoteVersion(db, acknowledged);

    expect(loadSyncState(db, 'another-business')).toEqual([]);
    expect(readAcknowledgedRemoteVersion(db, 'another-business', clientRef)).toBeUndefined();
  });

  it('refuses a fabricated or non-positive remote version, in code and in the schema', () => {
    const db = openBoundDatabase();

    expect(() => writeAcknowledgedRemoteVersion(db, { ...acknowledged, remoteVersion: 0 })).toThrow(RangeError);
    expect(() => writeAcknowledgedRemoteVersion(db, { ...acknowledged, remoteVersion: 1.5 })).toThrow(RangeError);
    expect(() =>
      db.runSync(
        "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'CLIENT', 'c', 0, 'x')",
        [REMOTE_BUSINESS_ID],
      ),
    ).toThrow();
    expect(() =>
      db.runSync(
        "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'PHASE', 'c', 1, 'x')",
        [REMOTE_BUSINESS_ID],
      ),
    ).toThrow();
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
  });
});
