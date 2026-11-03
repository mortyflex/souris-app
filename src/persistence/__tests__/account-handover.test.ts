// BeautIzzy — handing the device over to another account (account-handover.ts)
//
// The release of the local database is refused while the bound account holds
// anything here the remote never acknowledged, and otherwise leaves the device
// EMPTY, UNBOUND and never seeded again — in one transaction, remote untouched.

import {
  assessLocalAccountData,
  DeviceHandoverRefusedError,
  hasUnsentLocalData,
  releaseDeviceFromAccount,
} from '../account-handover';
import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { readSchemaVersion } from '../migrations';
import { CURRENT_SCHEMA_VERSION, SOURIS_TABLES, SYNC_TABLES } from '../schema';
import { readSeedVersion } from '../seed';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '../stores/business-profile';
import { deleteProduct, insertProduct } from '../stores/products';
import { approveInitialRestore, approveInitialUpload, isLocalDatabasePopulated } from '../sync/bootstrap';
import { countSyncOutboxRows } from '../sync/outbox';
import { createSyncPushWorker } from '../sync/push-worker';
import { hasAcknowledgedRemoteState } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import { createTestSeed, productSerum, REMOTE_BUSINESS_ID, remoteBusinessProfile } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const OTHER_BUSINESS_ID = '2c9d7e41-5a6b-4f80-9c3e-7d1a2b3c4d5e';

function countRows(db: SourisDatabase, table: string): number {
  return db.getFirstSync<{ readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? -1;
}

function listMetadataKeys(db: SourisDatabase): readonly string[] {
  return db.getAllSync<{ readonly key: string }>('SELECT key FROM souris_metadata ORDER BY key').map((row) => row.key);
}

/** Everything a release could change, for before/after comparisons. */
function fingerprint(db: SourisDatabase) {
  return {
    snapshot: JSON.stringify(loadSnapshot(db)),
    profile: readBusinessProfile(db),
    counts: Object.fromEntries([...SOURIS_TABLES, ...SYNC_TABLES, 'business_profile'].map((table) => [table, countRows(db, table)])),
    metadata: listMetadataKeys(db),
  };
}

/** A device bound to the fixture Business, seeded with the fixture data, nothing uploaded yet. */
function openBoundDevice(seed = createTestSeed): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, seed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

/** The same device once its data was uploaded and acknowledged by the remote. */
async function openUploadedDevice(remote: FakeSyncRemote): Promise<SourisDatabase> {
  const db = openBoundDevice();
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
  const result = await createSyncPushWorker({ database: db, gateway: remote }).run(REMOTE_BUSINESS_ID);
  expect(result.status).toBe('PUSHED');
  expect(countSyncOutboxRows(db)).toBe(0);
  expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
  return db;
}

describe('assessLocalAccountData', () => {
  it('finds nothing unsent on an unbound, never-seeded database', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
    const assessment = assessLocalAccountData(db, REMOTE_BUSINESS_ID);
    expect(assessment).toEqual({ pendingOutboxEntries: 0, unacknowledgedAggregates: 0, localOnlyProductImages: 0 });
    expect(hasUnsentLocalData(assessment)).toBe(false);
  });

  it('counts every row the remote never acknowledged — data created before any upload is unsent', () => {
    const db = openBoundDevice();
    const assessment = assessLocalAccountData(db, REMOTE_BUSINESS_ID);
    // 1 client + 2 services + 2 products + 1 appointment; the seed enqueues nothing (unbound at the time).
    expect(assessment).toEqual({ pendingOutboxEntries: 0, unacknowledgedAggregates: 6, localOnlyProductImages: 1 });
    expect(hasUnsentLocalData(assessment)).toBe(true);
  });

  it('finds nothing unsent once every row was acknowledged and no intent is pending', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    // The fixture mask holds a legacy device-only image: give it a shared photo so nothing is device-only.
    db.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    const assessment = assessLocalAccountData(db, REMOTE_BUSINESS_ID);
    expect(assessment).toEqual({ pendingOutboxEntries: 0, unacknowledgedAggregates: 0, localOnlyProductImages: 0 });
    expect(hasUnsentLocalData(assessment)).toBe(false);
  });

  it('a change made after the upload is unsent until it is acknowledged', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    db.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    insertProduct(db, { ...productSerum, id: 'product-new', businessId: REMOTE_BUSINESS_ID, name: 'Nouveau' });
    expect(assessLocalAccountData(db, REMOTE_BUSINESS_ID)).toEqual({
      pendingOutboxEntries: 1,
      unacknowledgedAggregates: 1,
      localOnlyProductImages: 0,
    });

    await createSyncPushWorker({ database: db, gateway: remote }).run(REMOTE_BUSINESS_ID);
    expect(hasUnsentLocalData(assessLocalAccountData(db, REMOTE_BUSINESS_ID))).toBe(false);
  });

  it('a pending deletion is unsent although the row itself is gone', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    db.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    deleteProduct(db, 'product-serum');
    expect(assessLocalAccountData(db, REMOTE_BUSINESS_ID)).toEqual({
      pendingOutboxEntries: 1,
      unacknowledgedAggregates: 0,
      localOnlyProductImages: 0,
    });
    expect(hasUnsentLocalData(assessLocalAccountData(db, REMOTE_BUSINESS_ID))).toBe(true);
  });

  it('a legacy Product image that exists on this device only is unsent — nothing can ever send it', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    // The fixture mask: image_uri set, no shared photo.
    expect(assessLocalAccountData(db, REMOTE_BUSINESS_ID).localOnlyProductImages).toBe(1);
    expect(hasUnsentLocalData(assessLocalAccountData(db, REMOTE_BUSINESS_ID))).toBe(true);
    db.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    expect(assessLocalAccountData(db, REMOTE_BUSINESS_ID).localOnlyProductImages).toBe(0);
  });

  it('an acknowledgement for another Business never covers this one', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    expect(assessLocalAccountData(db, OTHER_BUSINESS_ID).unacknowledgedAggregates).toBe(6);
  });
});

describe('releaseDeviceFromAccount', () => {
  it('refuses an unbound database', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const before = fingerprint(db);
    expect(() => releaseDeviceFromAccount(db, REMOTE_BUSINESS_ID)).toThrow(DeviceHandoverRefusedError);
    expect(() => releaseDeviceFromAccount(db, REMOTE_BUSINESS_ID)).toThrow(/NOT_BOUND/);
    expect(fingerprint(db)).toEqual(before);
  });

  it('refuses another Business than the bound one, changing nothing', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    const before = fingerprint(db);
    expect(() => releaseDeviceFromAccount(db, OTHER_BUSINESS_ID)).toThrow(/BUSINESS_MISMATCH/);
    expect(fingerprint(db)).toEqual(before);
  });

  it('refuses while anything is unsent, changing nothing', async () => {
    const neverUploaded = openBoundDevice();
    const beforeNever = fingerprint(neverUploaded);
    expect(() => releaseDeviceFromAccount(neverUploaded, REMOTE_BUSINESS_ID)).toThrow(/UNSENT_LOCAL_DATA/);
    expect(fingerprint(neverUploaded)).toEqual(beforeNever);

    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const pending = await openUploadedDevice(remote);
    pending.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    deleteProduct(pending, 'product-serum');
    const beforePending = fingerprint(pending);
    expect(() => releaseDeviceFromAccount(pending, REMOTE_BUSINESS_ID)).toThrow(/UNSENT_LOCAL_DATA/);
    expect(fingerprint(pending)).toEqual(beforePending);
    expect(countSyncOutboxRows(pending)).toBe(1);
  });

  it('releases a fully acknowledged device: empty, unbound, schema kept, never seeded again, remote untouched', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    db.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('business_access_evidence', 'proof-of-A')");
    const remoteBefore = JSON.stringify(remote.list(REMOTE_BUSINESS_ID));
    const requestsBefore = remote.requests.length;

    releaseDeviceFromAccount(db, REMOTE_BUSINESS_ID);

    for (const table of [...SOURIS_TABLES, ...SYNC_TABLES, 'business_profile']) {
      expect({ table, rows: countRows(db, table) }).toEqual({ table, rows: 0 });
    }
    expect(readBusinessProfile(db)).toBeUndefined();
    expect(isLocalDatabasePopulated(db)).toBe(false);
    expect(hasAcknowledgedRemoteState(db, REMOTE_BUSINESS_ID)).toBe(false);
    expect(listMetadataKeys(db)).toEqual(['seed_version']);
    expect(readSeedVersion(db)).toBe(1);
    expect(readSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    // The remote was never asked anything.
    expect(JSON.stringify(remote.list(REMOTE_BUSINESS_ID))).toBe(remoteBefore);
    expect(remote.requests).toHaveLength(requestsBefore);

    // The next bootstrap seeds NOTHING: the device waits for its next account's data.
    const snapshot = bootstrapPersistence(db, createTestSeed);
    expect(snapshot).toEqual(loadSnapshot(db));
    expect(isLocalDatabasePopulated(db)).toBe(false);

    // …and the released account's data is all still on its Business: another device restores it whole.
    const another = openTestDatabase();
    bootstrapPersistence(another, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
    bindLocalDatabaseToBusiness(another, remoteBusinessProfile);
    expect(approveInitialRestore(another, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
    const restored = await createSyncPushWorker({ database: another, gateway: remote }).run(REMOTE_BUSINESS_ID);
    expect(restored.status).toBe('RESTORED');
    expect(loadSnapshot(another).clients).toHaveLength(1);
    expect(loadSnapshot(another).products).toHaveLength(2);
  });

  it('is atomic: a failure half-way leaves the device exactly as it was', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = await openUploadedDevice(remote);
    db.runSync("UPDATE products SET photo_path = 'photos/mask.jpg' WHERE id = 'product-mask'");
    const before = fingerprint(db);
    const failing: SourisDatabase = {
      ...db,
      runSync: (sql, params) => {
        if (sql.startsWith('DELETE FROM business_profile')) throw new Error('disk I/O error');
        return db.runSync(sql, params);
      },
    };

    expect(() => releaseDeviceFromAccount(failing, REMOTE_BUSINESS_ID)).toThrow('disk I/O error');
    expect(fingerprint(db)).toEqual(before);
    expect(countRows(db, 'clients')).toBe(1);
  });
});
