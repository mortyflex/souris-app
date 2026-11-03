// BeautIzzy — secure account switching (AUTH.md §6): a device bound to account
// A, signed into account B, changes hands WITHOUT a reinstall and without losing
// or mixing anything. Real runner, real root navigator, real SQLite, the
// contract-faithful fake remote.

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { Client } from '@/domain/clients';
import type { Product } from '@/domain/products';
import type { AuthUser, RestoredSession } from '@/features/auth/gateway';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import {
  ACCOUNT_CONFLICT_HANDOVER_MESSAGE,
  ACCOUNT_CONFLICT_UNSENT_MESSAGE,
} from '@/features/business/AccountConflictScreen';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import {
  createFakeBusinessGateway,
  createRemoteBusiness,
  REMOTE_BUSINESS_ID,
} from '@/features/business/testing/fake-business-gateway';
import { releaseDeviceFromAccount } from '@/persistence/account-handover';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { readMetadata } from '@/persistence/metadata';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { insertClient } from '@/persistence/stores/clients';
import { insertProduct } from '@/persistence/stores/products';
import { approveInitialRestore, approveInitialUpload, readSyncBootstrapRecord } from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { clientLea, createTestSeed, productSerum } from '@/persistence/testing/fixtures';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { CloudSyncRunner } from '../CloudSyncRunner';
import { RootNavigator } from '../RootNavigator';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
  const Screen = ({ name }: { readonly name: string }) =>
    React.createElement(RNText, { testID: `route-${name}` }, name);
  const Protected = ({ guard, children }: { readonly guard: boolean; readonly children?: React.ReactNode }) =>
    guard ? React.createElement(React.Fragment, null, children) : null;
  const Stack = ({ children }: { readonly children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return { Stack };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const A_BUSINESS_ID = REMOTE_BUSINESS_ID;
const B_BUSINESS_ID = '2c9d7e41-5a6b-4f80-9c3e-7d1a2b3c4d5e';
const userA: AuthUser = fakeUser;
const userB: AuthUser = { id: 'user-bea', email: 'bea@example.com' };
const businessA = createRemoteBusiness();
const businessB = createRemoteBusiness({ id: B_BUSINESS_ID, ownerUserId: userB.id, ownerFirstName: 'Béa', name: 'Atelier Béa' });

const clientBea: Client = { id: 'client-bea', firstName: 'Béa', lastName: 'Dupont' };
const productOil: Product = { ...productSerum, id: 'product-oil', businessId: B_BUSINESS_ID, name: 'Huile Béa' };
const clientLate: Client = { id: 'client-late', firstName: 'Tardive' };

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });
/** A's fixture data, with the legacy device-only image of the mask replaced by a shared photo. */
const seedA = () => createTestSeed({ products: [{ ...createTestSeed().products[0]!, imageUri: undefined, photoPath: 'photos/mask.jpg' }, productSerum] });
const seedB = () => createTestSeed({ clients: [clientBea], services: [], products: [productOil], appointments: [] });

const TECHNICAL_VOCABULARY = /sync|bootstrap|outbox|cloud|remote|distant|restaur|serveur|supabase|base de données|%/i;

function openBoundDevice(seed: () => ReturnType<typeof createTestSeed>, business: typeof businessA): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, seed);
  bindLocalDatabaseToBusiness(database, business);
  return database;
}

/** A device of `business` that uploaded `seed` and was acknowledged. */
async function uploadFromDevice(remote: FakeSyncRemote, seed: () => ReturnType<typeof createTestSeed>, business: typeof businessA) {
  const database = openBoundDevice(seed, business);
  expect(approveInitialUpload(database, business.id).status).toBe('APPROVED');
  const result = await createSyncPushWorker({ database, gateway: remote }).run(business.id);
  expect(result.status).toBe('PUSHED');
  expect(countSyncOutboxRows(database)).toBe(0);
  return database;
}

/** The world: the remote holds A (6 aggregates) and B (2); the DEVICE is A's, fully acknowledged. */
async function createWorld() {
  const remote = createFakeSyncRemote([A_BUSINESS_ID, B_BUSINESS_ID]);
  const device = await uploadFromDevice(remote, seedA, businessA);
  await uploadFromDevice(remote, seedB, businessB);
  expect(remote.list(A_BUSINESS_ID)).toHaveLength(6);
  expect(remote.list(B_BUSINESS_ID)).toHaveLength(2);
  remote.clearRequests();
  return { remote, device, remoteA: JSON.stringify(remote.list(A_BUSINESS_ID)) };
}

/** `session.current` is what the stored session restores to — a relaunch after a sign-in reads it. */
async function renderApp(database: SourisDatabase, remote: FakeSyncRemote, restore: RestoredSession) {
  const session = { current: restore };
  const auth = createFakeAuthGateway({ restore: async () => session.current });
  const files = createMemoryLocalFiles();
  files.addFile('file:///app/Documents/products/legacy-of-a.jpg');
  files.addFile('file:///app/Documents/client-photos/a-client-photo.jpg');
  const view = await render(
    <TestPersistenceProvider createSeed={emptySeed} database={database} files={files}>
      <AuthProvider
        gateway={auth}
        resolveLocalOwner={() => {
          const profile = readBusinessProfile(database);
          return profile ? { id: profile.ownerUserId } : undefined;
        }}
      >
        <BusinessSessionProvider gateway={createFakeBusinessGateway([businessA, businessB])}>
          <CloudSyncRunner gateway={remote}>
            <RootNavigator />
          </CloudSyncRunner>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, auth, files, session };
}

const asB: RestoredSession = { kind: 'authenticated', user: userB };
const asA: RestoredSession = { kind: 'authenticated', user: userA };

function expectOnlyBusinessB(database: SourisDatabase) {
  const profile = readBusinessProfile(database);
  expect(profile?.id).toBe(B_BUSINESS_ID);
  expect(profile?.ownerUserId).toBe(userB.id);
  const snapshot = loadSnapshot(database);
  expect(snapshot.clients.map((client) => client.id)).toEqual(['client-bea']);
  expect(snapshot.products.map((product) => product.id)).toEqual(['product-oil']);
  expect(snapshot.services).toEqual([]);
  expect(snapshot.appointments).toEqual([]);
  expect(snapshot.sales).toEqual([]);
  expect(countSyncOutboxRows(database)).toBe(0);
  expect(database.getFirstSync<{ readonly count: number }>('SELECT COUNT(*) AS count FROM sync_state WHERE business_id = ?', [A_BUSINESS_ID])?.count).toBe(0);
  expect(readSyncBootstrapRecord(database, A_BUSINESS_ID)).toBeUndefined();
  expect(readSyncBootstrapRecord(database, B_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
}

describe('secure account switching', () => {
  it('A → B, everything sent: the conflict explains, asks for one confirmation, releases the device and restores B', async () => {
    const { remote, device, remoteA } = await createWorld();
    device.runSync("INSERT INTO souris_metadata (key, value) VALUES ('business_access_evidence', 'proof-of-A')");
    const { view, files } = await renderApp(device, remote, asB);

    // Nothing of A is shown; the hand-over is offered in plain words.
    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(view.getByText(ACCOUNT_CONFLICT_HANDOVER_MESSAGE)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(TECHNICAL_VOCABULARY);
    expect(readBusinessProfile(device)?.id).toBe(A_BUSINESS_ID);

    // One explicit confirmation; nothing happened before it.
    await act(async () => fireEvent.press(view.getByTestId('account-conflict-prepare')));
    expect(view.getByTestId('account-conflict-dialog')).toBeTruthy();
    expect(readBusinessProfile(device)?.id).toBe(A_BUSINESS_ID);
    expect(loadSnapshot(device).clients).toHaveLength(1);
    await act(async () => fireEvent.press(view.getByTestId('cancel-prepare-device')));
    expect(readBusinessProfile(device)?.id).toBe(A_BUSINESS_ID);
    await act(async () => fireEvent.press(view.getByTestId('account-conflict-prepare')));
    await act(async () => fireEvent.press(view.getByTestId('confirm-prepare-device')));

    // The device is B's now: bound, restored, open — no reinstall.
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('account-conflict-screen')).toBeNull();
    expectOnlyBusinessB(device);
    expect(readMetadata(device, 'business_access_evidence')).toBeUndefined();
    // A's owned images are gone from the device; nothing else was touched.
    expect(files.listFiles()).toEqual([]);
    // Nothing was pushed: B's data came down, A's data never went anywhere under B.
    expect(remote.requests).toEqual([]);
    expect(JSON.stringify(remote.list(A_BUSINESS_ID))).toBe(remoteA);
    expect(remote.pulls).toEqual([undefined]);

    // A's data is all still on its Business: another device of A restores it whole.
    const anotherOfA = openBoundDevice(emptySeed, businessA);
    expect(approveInitialRestore(anotherOfA, A_BUSINESS_ID).status).toBe('APPROVED');
    const restored = await createSyncPushWorker({ database: anotherOfA, gateway: remote }).run(A_BUSINESS_ID);
    expect(restored).toMatchObject({ status: 'RESTORED', restored: { clients: 1, services: 2, products: 2, appointments: 1 } });
  });

  it('A → B with something not yet sent: no hand-over is offered, signing out keeps everything of A', async () => {
    const { remote, device } = await createWorld();
    insertProduct(device, { ...productSerum, id: 'product-new', businessId: A_BUSINESS_ID, name: 'Nouveau' });
    expect(countSyncOutboxRows(device)).toBe(1);
    const before = JSON.stringify(loadSnapshot(device));
    const { view } = await renderApp(device, remote, asB);

    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    expect(view.queryByTestId('account-conflict-prepare')).toBeNull();
    expect(view.getByText(ACCOUNT_CONFLICT_UNSENT_MESSAGE)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(TECHNICAL_VOCABULARY);
    expect(view.queryByTestId('route-(app)')).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('account-conflict-sign-out')));
    await waitFor(() => expect(view.getByTestId('route-(auth)')).toBeTruthy());
    expect(readBusinessProfile(device)?.id).toBe(A_BUSINESS_ID);
    expect(JSON.stringify(loadSnapshot(device))).toBe(before);
    expect(countSyncOutboxRows(device)).toBe(1);
    expect(remote.requests).toEqual([]);
  });

  it('a device whose data was never uploaded offers no hand-over either', async () => {
    const remote = createFakeSyncRemote([A_BUSINESS_ID, B_BUSINESS_ID]);
    await uploadFromDevice(remote, seedB, businessB);
    const device = openBoundDevice(seedA, businessA);
    const { view } = await renderApp(device, remote, asB);

    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    expect(view.queryByTestId('account-conflict-prepare')).toBeNull();
    expect(view.getByText(ACCOUNT_CONFLICT_UNSENT_MESSAGE)).toBeTruthy();
    expect(loadSnapshot(device).clients).toHaveLength(1);
  });

  it('B → A afterwards: the same path brings A back, B having been sent', async () => {
    const { remote, device } = await createWorld();
    // The device changed hands once already (A → B) and B synchronizes from it.
    releaseDeviceFromAccount(device, A_BUSINESS_ID);
    bindLocalDatabaseToBusiness(device, businessB);
    expect(approveInitialRestore(device, B_BUSINESS_ID).status).toBe('APPROVED');
    expect((await createSyncPushWorker({ database: device, gateway: remote }).run(B_BUSINESS_ID)).status).toBe('RESTORED');
    expectOnlyBusinessB(device);
    remote.clearRequests();

    // A signs in on it.
    const { view } = await renderApp(device, remote, asA);
    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    expect(view.getByText(ACCOUNT_CONFLICT_HANDOVER_MESSAGE)).toBeTruthy();
    await act(async () => fireEvent.press(view.getByTestId('account-conflict-prepare')));
    await act(async () => fireEvent.press(view.getByTestId('confirm-prepare-device')));
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());

    expect(readBusinessProfile(device)?.id).toBe(A_BUSINESS_ID);
    const snapshot = loadSnapshot(device);
    expect(snapshot.clients.map((client) => client.id)).toEqual([clientLea.id]);
    expect(snapshot.products.map((product) => product.id).sort()).toEqual(['product-mask', 'product-serum']);
    expect(snapshot.services).toHaveLength(2);
    expect(countSyncOutboxRows(device)).toBe(0);
    expect(remote.requests).toEqual([]);
    expect(remote.list(B_BUSINESS_ID)).toHaveLength(2);
  });

  it('the first fetch of B fails after the hand-over: recoverable, nothing can be created, « Réessayer » restores', async () => {
    const { remote, device } = await createWorld();
    const { view } = await renderApp(device, remote, asB);
    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    remote.failNext(new SyncRemoteError('NETWORK'));

    await act(async () => fireEvent.press(view.getByTestId('account-conflict-prepare')));
    await act(async () => fireEvent.press(view.getByTestId('confirm-prepare-device')));

    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(view.queryByTestId('account-conflict-screen')).toBeNull();
    // Released and bound to B, still empty: no A row, no B row yet, nothing pending.
    expect(readBusinessProfile(device)?.id).toBe(B_BUSINESS_ID);
    expect(loadSnapshot(device).clients).toEqual([]);
    expect(countSyncOutboxRows(device)).toBe(0);

    await act(async () => fireEvent.press(view.getByTestId('data-unavailable-retry')));
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expectOnlyBusinessB(device);
  });

  it('a run of A still in flight when B confirms: the release waits for it, and nothing of A lands in B’s database', async () => {
    const { remote, device } = await createWorld();
    // Another device of A adds a client: the device's next pull will apply it.
    const anotherOfA = openBoundDevice(emptySeed, businessA);
    expect(approveInitialRestore(anotherOfA, A_BUSINESS_ID).status).toBe('APPROVED');
    expect((await createSyncPushWorker({ database: anotherOfA, gateway: remote }).run(A_BUSINESS_ID)).status).toBe('RESTORED');
    insertClient(anotherOfA, clientLate);
    expect((await createSyncPushWorker({ database: anotherOfA, gateway: remote }).run(A_BUSINESS_ID)).status).toBe('PUSHED');
    remote.clearRequests();

    // A's pull is held in flight; B's pulls go through.
    let releasePull: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const gateway = {
      ...remote,
      pullBusinessAggregates: async (businessId: string, since: Date | undefined) => {
        if (businessId === A_BUSINESS_ID) await held;
        return remote.pullBusinessAggregates(businessId, since);
      },
    } as FakeSyncRemote;

    const { view, auth, session } = await renderApp(device, gateway, asA);
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(remote.pulls).toEqual([]); // held

    // A signs out, B signs in while A's run is still in flight.
    await act(async () => auth.emitSession(null));
    await waitFor(() => expect(view.getByTestId('route-(auth)')).toBeTruthy());
    session.current = asB;
    await act(async () => auth.emitSession(userB));
    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    await act(async () => fireEvent.press(view.getByTestId('account-conflict-prepare')));
    await act(async () => fireEvent.press(view.getByTestId('confirm-prepare-device')));
    await act(async () => {});

    // Nothing released yet: the run in flight is awaited.
    expect(view.getByTestId('account-conflict-screen')).toBeTruthy();
    expect(readBusinessProfile(device)?.id).toBe(A_BUSINESS_ID);
    expect(loadSnapshot(device).clients.map((client) => client.id)).toEqual([clientLea.id]);

    await act(async () => releasePull());
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    // A's incremental pull completed (and applied, into A's database) BEFORE the release; then B's complete restore.
    expect(remote.pulls).toHaveLength(2);
    expect(remote.pulls[0]).toBeInstanceOf(Date);
    expect(remote.pulls[1]).toBeUndefined();
    expectOnlyBusinessB(device);
    expect(loadSnapshot(device).clients.map((client) => client.id)).not.toContain(clientLate.id);
    expect(remote.requests).toEqual([]);
  });
});
