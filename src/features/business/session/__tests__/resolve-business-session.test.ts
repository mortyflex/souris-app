import { migrateDatabase } from '@/persistence/migrations';
import { insertProduct } from '@/persistence/stores/products';
import { bindLocalDatabaseToBusiness, listLocalBusinessIds, readBusinessProfile } from '@/persistence/stores/business-profile';
import { createTestSeed, productSerum } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { seedDatabaseIfNeeded } from '@/persistence/seed';

import { createFakeBusinessGateway, createRemoteBusiness, REMOTE_BUSINESS_ID } from '../../testing/fake-business-gateway';
import { resolveBusinessSession } from '../resolve-business-session';

function openSeededDatabase() {
  const database = openTestDatabase();
  migrateDatabase(database);
  seedDatabaseIfNeeded(database, createTestSeed);
  return database;
}

describe('resolveBusinessSession', () => {
  it('requires setup when the owner has no Business anywhere', async () => {
    const database = openSeededDatabase();
    const gateway = createFakeBusinessGateway();

    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });

    expect(resolved).toEqual({ status: 'setup-required' });
    expect(readBusinessProfile(database)).toBeUndefined();
    expect(gateway.calls.list).toBe(1);
  });

  it('binds an existing remote Business locally and adopts the existing rows', async () => {
    const database = openSeededDatabase();
    const gateway = createFakeBusinessGateway([createRemoteBusiness()]);

    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });

    expect(resolved).toEqual({ status: 'ready', business: createRemoteBusiness() });
    expect(readBusinessProfile(database)?.id).toBe(REMOTE_BUSINESS_ID);
    expect(listLocalBusinessIds(database)).toEqual([REMOTE_BUSINESS_ID]);
  });

  it('opens from the local binding without any remote call, online or offline', async () => {
    const database = openSeededDatabase();
    bindLocalDatabaseToBusiness(database, createRemoteBusiness());
    const gateway = createFakeBusinessGateway();

    const online = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });
    const offline = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: true });

    expect(online.status).toBe('ready');
    expect(offline.status).toBe('ready');
    expect(gateway.calls.list).toBe(0);
  });

  it('reports DEVICE_ACCOUNT_CONFLICT for another owner, exposing nothing and rebinding nothing', async () => {
    const database = openSeededDatabase();
    bindLocalDatabaseToBusiness(database, createRemoteBusiness());
    const gateway = createFakeBusinessGateway([createRemoteBusiness({ id: 'business-b', ownerUserId: 'user-b', name: 'Studio B' })]);

    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-b', offline: false });

    expect(resolved.status).toBe('device-account-conflict');
    expect(readBusinessProfile(database)?.ownerUserId).toBe('user-lea');
    expect(listLocalBusinessIds(database)).toEqual([REMOTE_BUSINESS_ID]);
    expect(gateway.calls.list).toBe(0);
  });

  it('needs the network for a first connection on an unbound device', async () => {
    const database = openSeededDatabase();
    const gateway = createFakeBusinessGateway([createRemoteBusiness()]);

    const offline = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: true });
    expect(offline).toEqual({ status: 'error', failure: { code: 'NETWORK' } });

    gateway.failNext('NETWORK');
    const failed = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });
    expect(failed).toEqual({ status: 'error', failure: { code: 'NETWORK' } });
    expect(readBusinessProfile(database)).toBeUndefined();
  });

  it('refuses to choose between several remote Businesses', async () => {
    const database = openSeededDatabase();
    const gateway = createFakeBusinessGateway([createRemoteBusiness(), createRemoteBusiness({ id: 'business-2' })]);

    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });

    expect(resolved).toEqual({ status: 'error', failure: { code: 'MULTIPLE_REMOTE_BUSINESSES' } });
    expect(readBusinessProfile(database)).toBeUndefined();
  });

  it('blocks a remote Business whose owner is not the signed-in user', async () => {
    const database = openSeededDatabase();
    const gateway = createFakeBusinessGateway([createRemoteBusiness({ ownerUserId: 'user-lea' })]);
    // A gateway that (wrongly) returns another owner's row must still be refused locally.
    gateway.listOwnedBusinesses = async () => [createRemoteBusiness({ ownerUserId: 'someone-else' })];

    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });

    expect(resolved).toEqual({ status: 'error', failure: { code: 'OWNER_MISMATCH' } });
    expect(readBusinessProfile(database)).toBeUndefined();
  });

  it('surfaces a local multi-business conflict instead of merging rows', async () => {
    const database = openSeededDatabase();
    insertProduct(database, { ...productSerum, id: 'product-foreign', businessId: 'another-business' });
    const gateway = createFakeBusinessGateway([createRemoteBusiness()]);

    const resolved = await resolveBusinessSession({ database, gateway, ownerUserId: 'user-lea', offline: false });

    expect(resolved).toEqual({ status: 'error', failure: { code: 'LOCAL_DATA_CONFLICT' } });
    expect(readBusinessProfile(database)).toBeUndefined();
  });
});
