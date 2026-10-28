// BeautIzzy — service categories and descriptions through the existing aggregate sync
// (docs/architecture/CLOUD_SYNC.md §27): real stores, the real worker, the contract-faithful
// in-memory remote — migrated, or predating the catalogue fields.

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { readMetadata, writeMetadata } from '../metadata';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { deleteServiceCategory, insertServiceCategory, loadServiceCategories } from '../stores/service-categories';
import { loadServices, updateService } from '../stores/services';
import { approveInitialRestore, approveInitialUpload } from '../sync/bootstrap';
import { findSyncOutboxEntry, loadSyncOutbox } from '../sync/outbox';
import { createSyncPushWorker } from '../sync/push-worker';
import type { RemoteServicePayload } from '../sync/remote-gateway';
import { parseRemoteBusinessSnapshot } from '../sync/remote-snapshot';
import {
  REMOTE_SCHEMA_PENDING_ERROR,
  SERVICE_CATALOGUE_REFRESH_KEY,
  SERVICE_CATALOGUE_REMOTE_KEY,
} from '../sync/service-catalogue-sync';
import { readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import { createTestSeed, REMOTE_BUSINESS_ID, remoteBusinessProfile, serviceCut } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const NOW = new Date('2026-10-28T09:00:00.000Z');
const SERVICE_REF = { aggregateType: 'SERVICE', aggregateId: serviceCut.id } as const;
const gel = { id: 'cat-gel', businessId: REMOTE_BUSINESS_ID, name: 'Extensions et poses en gel', position: 0 };

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

function worker(db: SourisDatabase, remote: FakeSyncRemote, now = () => NOW) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

async function openSyncedSource(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const run = worker(db, remote);
  expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', failed: 0 });
  remote.clearRequests();
  return { db, run };
}

async function openRestoredDevice(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, emptySeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  const run = worker(db, remote);
  await run();
  expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const restored = await run();
  expect(restored).toMatchObject({ status: 'RESTORED' });
  remote.clearRequests();
  return { db, run, restored };
}

const cut = (db: SourisDatabase) => loadServices(db).find((service) => service.id === serviceCut.id)!;

describe('service catalogue sync — migrated remote', () => {
  it('pushes a category, then the Service that names it, with both fields; the other device receives them', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    // The first run's pull proved the remote knows the fields.
    expect(readMetadata(source.db, SERVICE_CATALOGUE_REMOTE_KEY)).toBe('1');

    insertServiceCategory(source.db, gel);
    updateService(source.db, { ...cut(source.db), categoryId: 'cat-gel', description: 'Inclus : limage.\nExclu : nail art.' });
    expect(await source.run()).toMatchObject({ status: 'PUSHED', pushed: 2, failed: 0 });
    // The category goes first: Services name it.
    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['SERVICE_CATEGORY', 'SERVICE']);
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE_CATEGORY', 'cat-gel')?.payload).toEqual({
      name: 'Extensions et poses en gel',
      description: null,
      position: 0,
    });
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id)?.payload).toMatchObject({
      category_id: 'cat-gel',
      description: 'Inclus : limage.\nExclu : nail art.',
    });

    const other = await openRestoredDevice(remote);
    expect(other.restored).toMatchObject({ restored: { serviceCategories: 1 } });
    expect(loadServiceCategories(other.db)).toEqual([gel]);
    expect(cut(other.db)).toMatchObject({ categoryId: 'cat-gel', description: 'Inclus : limage.\nExclu : nail art.' });
    expect(readMetadata(other.db, SERVICE_CATALOGUE_REMOTE_KEY)).toBe('1');
  });

  it('a category deleted on one device: tombstone + detached Services reach the other one', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    insertServiceCategory(source.db, gel);
    updateService(source.db, { ...cut(source.db), categoryId: 'cat-gel' });
    await source.run();
    const other = await openRestoredDevice(remote);

    deleteServiceCategory(source.db, 'cat-gel');
    expect(await source.run()).toMatchObject({ pushed: 2, failed: 0 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE_CATEGORY', 'cat-gel')?.deleted).toBe(true);

    expect(await other.run()).toMatchObject({ pull: { status: 'PULLED', failed: 0 } });
    expect(loadServiceCategories(other.db)).toEqual([]);
    expect(cut(other.db)).not.toHaveProperty('categoryId');
  });

  it('a pulled Service whose remote predates the fields keeps the local values', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    updateService(source.db, { ...cut(source.db), description: 'Gardée.' });
    await source.run();
    const acknowledged = readAcknowledgedRemoteVersion(source.db, REMOTE_BUSINESS_ID, SERVICE_REF)!.remoteVersion;

    // Another device running an OLD build edits the price: no catalogue keys at all.
    const { category_id: _c, description: _d, ...legacy } = remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id)!
      .payload as RemoteServicePayload;
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id, { ...legacy, price_cents: 5100 });
    remote.setServiceCatalogue(false); // and the pull answers like an old remote
    expect(await source.run()).toMatchObject({ pull: { applied: 1 } });

    expect(cut(source.db)).toMatchObject({ price: 51, description: 'Gardée.' });
    expect(readAcknowledgedRemoteVersion(source.db, REMOTE_BUSINESS_ID, SERVICE_REF)!.remoteVersion).toBe(acknowledged + 1);
  });

  it('parses absent catalogue keys as "unknown" and explicit nulls as "cleared"', () => {
    const wire = (service: Record<string, unknown>) => ({
      pulled_at: '2026-10-28T09:00:00.000Z',
      clients: [],
      services: [{ id: 's', sync_version: 1, deleted_at: null, name: 'Coupe', type: 'SERVICE', price_cents: 0, active: true, phases: [], ...service }],
      products: [],
      appointments: [],
      sales: [],
    });
    const legacy = parseRemoteBusinessSnapshot(wire({}));
    expect(legacy.serviceCatalogue).toBe(false);
    expect(legacy.services[0]!.payload).not.toHaveProperty('category_id');
    expect(legacy.services[0]!.payload).not.toHaveProperty('description');
    const cleared = parseRemoteBusinessSnapshot({ ...wire({ category_id: null, description: null }), service_categories: [] });
    expect(cleared.serviceCatalogue).toBe(true);
    expect(cleared.services[0]!.payload).toMatchObject({ category_id: null, description: null });
    expect(() =>
      parseRemoteBusinessSnapshot({ ...wire({}), service_categories: [{ id: 'c', sync_version: 1, deleted_at: null, name: ' ', description: null, position: 0 }] }),
    ).toThrow(/service_categories/);
  });
});

describe('service catalogue sync — remote not migrated yet', () => {
  it('defers every write the old functions would lose; ordinary catalogue edits keep syncing', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID], { serviceCatalogue: false });
    const source = await openSyncedSource(remote);
    expect(readMetadata(source.db, SERVICE_CATALOGUE_REMOTE_KEY)).toBeUndefined();

    insertServiceCategory(source.db, gel);
    updateService(source.db, { ...cut(source.db), price: 49, description: 'Inclus : limage.' });
    const result = await source.run();
    expect(result).toMatchObject({ status: 'PUSHED', pushed: 0, failed: 0 });
    // Nothing was sent, nothing acknowledged: both entries wait with the stable code.
    expect(remote.requests).toEqual([]);
    expect(loadSyncOutbox(source.db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.lastError])).toEqual([
      ['SERVICE_CATEGORY', REMOTE_SCHEMA_PENDING_ERROR],
      ['SERVICE', REMOTE_SCHEMA_PENDING_ERROR],
    ]);
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id)?.payload).not.toHaveProperty('description');

    // A Service edit WITHOUT the new fields is not held back by an unmigrated remote.
    const { serviceColor } = jest.requireActual('../testing/fixtures') as typeof import('../testing/fixtures');
    const color = loadServices(source.db).find((service) => service.id === serviceColor.id)!;
    updateService(source.db, { ...color, price: 99 });
    expect(await worker(source.db, remote, () => new Date(NOW.getTime() + 1))()).toMatchObject({ pushed: 1 });
    expect((remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceColor.id)?.payload as RemoteServicePayload).price_cents).toBe(9900);
  });

  it('pushes the deferred writes, complete, as soon as a pull proves the migration', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID], { serviceCatalogue: false });
    const source = await openSyncedSource(remote);
    insertServiceCategory(source.db, gel);
    updateService(source.db, { ...cut(source.db), categoryId: 'cat-gel', description: 'Inclus : limage.' });
    await source.run();
    expect(remote.requests).toEqual([]);

    remote.setServiceCatalogue(true); // the migration is applied by hand
    const proving = await source.run(); // its pull carries `service_categories`
    expect(proving).toMatchObject({ pushed: 0, pull: { status: 'PULLED' } });
    expect(readMetadata(source.db, SERVICE_CATALOGUE_REMOTE_KEY)).toBe('1');
    // The proof cleared the backoff: the very next run pushes both.
    expect(await source.run()).toMatchObject({ pushed: 2, failed: 0 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE_CATEGORY', 'cat-gel')?.payload).toMatchObject({ name: 'Extensions et poses en gel' });
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id)?.payload).toMatchObject({
      category_id: 'cat-gel',
      description: 'Inclus : limage.',
    });
    expect(loadSyncOutbox(source.db, REMOTE_BUSINESS_ID)).toEqual([]);
  });
});

describe('service catalogue sync — the one-time refresh of schema v17', () => {
  /** A device whose previous build acknowledged a Service revision without storing its description. */
  async function upgradedDevice() {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    updateService(source.db, { ...cut(source.db), description: 'Écrite ailleurs.' });
    await source.run();
    const other = await openRestoredDevice(remote);
    // Simulate the old build: the column was empty although the revision is acknowledged.
    other.db.runSync('UPDATE services SET description = NULL');
    writeMetadata(other.db, SERVICE_CATALOGUE_REFRESH_KEY, '1');
    other.db.runSync("DELETE FROM souris_metadata WHERE key = 'sync_pull_cursor'");
    return { remote, source, other };
  }

  it('re-applies the acknowledged revision once, adopting the field, then disarms', async () => {
    const { other, remote } = await upgradedDevice();
    expect(cut(other.db)).not.toHaveProperty('description');

    expect(await other.run()).toMatchObject({ pull: { status: 'PULLED', failed: 0 } });
    expect(cut(other.db)).toMatchObject({ description: 'Écrite ailleurs.' });
    expect(readMetadata(other.db, SERVICE_CATALOGUE_REFRESH_KEY)).toBeUndefined();
    expect(remote.requests).toEqual([]); // nothing echoed back
    expect(loadSyncOutbox(other.db, REMOTE_BUSINESS_ID)).toEqual([]);
  });

  it('never overwrites a pending local change', async () => {
    const { other } = await upgradedDevice();
    updateService(other.db, { ...cut(other.db), price: 77 });
    // The pending entry is pushed first (and acknowledged); the refresh never touches it.
    await other.run();
    expect(cut(other.db)).toMatchObject({ price: 77 });
    expect(findSyncOutboxEntry(other.db, REMOTE_BUSINESS_ID, SERVICE_REF)).toBeUndefined();
  });

  it('leaves the snapshot otherwise identical', async () => {
    const { other } = await upgradedDevice();
    const before = loadSnapshot(other.db);
    await other.run();
    const after = loadSnapshot(other.db);
    expect({ ...after, services: after.services.map(({ description: _d, ...rest }) => rest) }).toEqual({
      ...before,
      services: before.services.map(({ description: _d, ...rest }) => rest),
    });
  });
});
