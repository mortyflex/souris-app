// BeautIzzy — first-sync gate: an EMPTY device never becomes operational before
// BeautIzzy knows what its account already holds (CLOUD_SYNC.md §17.3). The real
// runner, the real root navigator, real SQLite and a contract-faithful remote.

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import type { RestoredSession } from '@/features/auth/gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import {
  createFakeBusinessGateway,
  createRemoteBusiness,
  REMOTE_BUSINESS_ID,
} from '@/features/business/testing/fake-business-gateway';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { deleteProduct, insertProduct } from '@/persistence/stores/products';
import { approveInitialUpload, readSyncBootstrapRecord, writeSyncBootstrapRecord } from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { hasAcknowledgedRemoteState } from '@/persistence/sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed, productSerum } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { CloudSyncRunner, SYNC_FOREGROUND_TICK_MS } from '../CloudSyncRunner';
import { RootNavigator } from '../RootNavigator';

// A faithful-enough Stack: Protected groups render their screens only while
// their guard is true; a Screen renders its route name.
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

const live: RestoredSession = { kind: 'authenticated', user: fakeUser };
const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });
const EMPTY_SNAPSHOT = { clients: [], services: [], products: [], appointments: [], sales: [], calendarBlocks: [], appointmentDeposits: [], serviceCategories: [] };

function openBoundDevice(seed: typeof createTestSeed): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, seed);
  bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  return database;
}

/** Another device that already uploaded the Business to `remote`. */
async function uploadFromAnotherDevice(remote: FakeSyncRemote) {
  const source = openBoundDevice(createTestSeed);
  expect(approveInitialUpload(source, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
  await createSyncPushWorker({ database: source, gateway: remote }).run(REMOTE_BUSINESS_ID);
  expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
  remote.clearRequests();
}

async function renderApp(database: SourisDatabase, remote: FakeSyncRemote | undefined, restore: RestoredSession = live) {
  const auth = createFakeAuthGateway({ restore: async () => restore });
  const view = await render(
    <TestPersistenceProvider createSeed={emptySeed} database={database}>
      <AuthProvider
        gateway={auth}
        resolveLocalOwner={() => {
          const profile = readBusinessProfile(database);
          return profile ? { id: profile.ownerUserId } : undefined;
        }}
      >
        <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
          <CloudSyncRunner gateway={remote}>
            <RootNavigator />
          </CloudSyncRunner>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, auth };
}

/** `remote` behind a count that waits until released: the first check stays "in flight" on demand. */
function holdFirstCheck(remote: FakeSyncRemote) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gateway = {
    ...remote,
    countBusinessAggregates: async (businessId: string) => {
      await held;
      return remote.countBusinessAggregates(businessId);
    },
  } as FakeSyncRemote;
  return { gateway, release: () => act(async () => release()) };
}

const TECHNICAL_VOCABULARY = /sync|bootstrap|outbox|cloud|remote|distant|restaur|serveur|supabase|%/i;

function captureTriggers() {
  const triggers: { appState?: (state: AppStateStatus) => void; tick?: () => void } = {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    triggers.appState = listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  const realSetInterval = globalThis.setInterval;
  jest.spyOn(globalThis, 'setInterval').mockImplementation(((handler: () => void, ms?: number) => {
    if (ms === SYNC_FOREGROUND_TICK_MS) {
      triggers.tick = handler;
      return 0 as unknown as ReturnType<typeof setInterval>;
    }
    return realSetInterval(handler, ms);
  }) as typeof setInterval);
  return triggers;
}

describe('first-sync gate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('empty device, first check fails: no application, nothing can be created; « Réessayer » restores the account and opens the app', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    remote.failNext(new SyncRemoteError('NETWORK'));

    const database = openBoundDevice(emptySeed);
    const { view } = await renderApp(database, remote);

    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
    expect(view.getByText('Impossible de récupérer vos données')).toBeTruthy();
    // The protected group — every screen that creates a record — is not mounted at all.
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(loadSnapshot(database)).toEqual(EMPTY_SNAPSHOT);
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)).toBeUndefined();

    await act(async () => {
      fireEvent.press(view.getByTestId('data-unavailable-retry'));
    });

    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('data-unavailable-screen')).toBeNull();
    const restored = loadSnapshot(database);
    expect([restored.clients.length, restored.services.length, restored.products.length]).toEqual([1, 2, 2]);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(remote.requests).toEqual([]); // nothing pushed back
  });

  it('empty device, the restore itself fails: same state, never RECONCILIATION_REQUIRED; the periodic check restores on its own', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    remote.beforePull(() => {
      throw new SyncRemoteError('NETWORK');
    });

    const database = openBoundDevice(emptySeed);
    const { view } = await renderApp(database, remote);

    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(loadSnapshot(database)).toEqual(EMPTY_SNAPSHOT);

    remote.beforePull(undefined);
    await act(async () => triggers.tick?.());

    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(loadSnapshot(database).clients).toHaveLength(1);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
    expect(countSyncOutboxRows(database)).toBe(0);
  });

  it('empty device, empty account: the gate opens, the first record is created and leaves with the periodic check', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const database = openBoundDevice(emptySeed);
    const { view } = await renderApp(database, remote);

    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('data-unavailable-screen')).toBeNull();
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');

    insertProduct(database, { ...productSerum, id: 'product-first', businessId: REMOTE_BUSINESS_ID });
    await act(async () => triggers.tick?.());

    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-first')?.syncVersion).toBe(1));
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    expect(view.getByTestId('route-(app)')).toBeTruthy();
  });

  it('waiting state: an activity indicator and plain wording, no action, no business route — then the app replaces it at once', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { gateway, release } = holdFirstCheck(remote);
    const { view } = await renderApp(openBoundDevice(emptySeed), gateway);

    expect(view.getByTestId('data-loading-screen')).toBeTruthy();
    expect(view.getByTestId('data-loading-indicator')).toBeTruthy();
    expect(view.getByText('Récupération de vos données…')).toBeTruthy();
    expect(view.getByText('Cela peut prendre quelques instants.')).toBeTruthy();
    expect(view.queryByRole('button')).toBeNull();
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(view.queryByTestId('data-unavailable-screen')).toBeNull();
    expect(JSON.stringify(view.toJSON())).not.toMatch(TECHNICAL_VOCABULARY);

    await release();
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('data-loading-screen')).toBeNull();
  });

  it('waiting state: a failure replaces it with the recoverable state, never with the app', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    remote.failNext(new SyncRemoteError('NETWORK'));
    const { gateway, release } = holdFirstCheck(remote);
    const { view } = await renderApp(openBoundDevice(emptySeed), gateway);
    expect(view.getByTestId('data-loading-screen')).toBeTruthy();

    await release();
    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
    expect(view.queryByTestId('data-loading-screen')).toBeNull();
    expect(view.queryByTestId('route-(app)')).toBeNull();
  });

  it('waiting state while a restore is running: the app appears only once the data is there', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    const database = openBoundDevice(emptySeed);
    // Observed from INSIDE the fetch of the dataset: the restore is really in progress.
    const seen: { loading?: boolean; app?: boolean } = {};
    let view: Awaited<ReturnType<typeof renderApp>>['view'] | undefined;
    remote.beforePull(() => {
      if (seen.loading !== undefined) return; // the restore's fetch only — later pulls run with the app open
      seen.loading = view?.queryByTestId('data-loading-screen') !== null;
      seen.app = view?.queryByTestId('route-(app)') !== null;
    });
    const { gateway, release } = holdFirstCheck(remote);
    ({ view } = await renderApp(database, gateway));

    await release();
    await waitFor(() => expect(view?.getByTestId('route-(app)')).toBeTruthy());
    expect(seen).toEqual({ loading: true, app: false });
    expect(view.queryByTestId('data-loading-screen')).toBeNull();
    expect(loadSnapshot(database).clients).toHaveLength(1);
  });

  it('never holds back a device that has its data: unreachable remote, offline session and RECONCILIATION_REQUIRED all open the app', async () => {
    // Unreachable remote.
    const unreachable = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    unreachable.failNext(new SyncRemoteError('NETWORK'), 10);
    const failing = await renderApp(openBoundDevice(createTestSeed), unreachable);
    await waitFor(() => expect(failing.view.getByTestId('route-(app)')).toBeTruthy());

    // Offline session fallback: no run at all.
    const silent = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const offline = await renderApp(openBoundDevice(createTestSeed), silent, { kind: 'unavailable' });
    await waitFor(() => expect(offline.view.getByTestId('route-(app)')).toBeTruthy());
    expect(silent.countCalls).toBe(0);

    // Both sides populated: blocked for sync, never for work — and never resolved automatically.
    const populated = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(populated);
    const device = openBoundDevice(createTestSeed);
    const both = await renderApp(device, populated);
    await waitFor(() => expect(both.view.getByTestId('route-(app)')).toBeTruthy());
    await waitFor(() =>
      expect(readSyncBootstrapRecord(device, REMOTE_BUSINESS_ID)?.decision).toBe('RECONCILIATION_REQUIRED'),
    );
    expect(populated.requests).toEqual([]);
    expect(populated.pulls).toEqual([]);
    expect(both.view.queryByTestId('data-unavailable-screen')).toBeNull();
  });

  it('empty device on the offline session: no application either, and « Réessayer » starts with the session', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const database = openBoundDevice(emptySeed);
    const { view, auth } = await renderApp(database, remote, { kind: 'unavailable' });

    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(remote.countCalls).toBe(0);

    const restoredBefore = auth.calls.restoreSession;
    await act(async () => {
      fireEvent.press(view.getByTestId('data-unavailable-retry'));
    });
    expect(auth.calls.restoreSession).toBe(restoredBefore + 1);
    expect(remote.countCalls).toBe(0); // still offline: still nothing sent
    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
  });

  describe('a decision stored by an earlier session never opens an empty device', () => {
    /** Session 1: empty device, empty account → EMPTY, app open. Then ANOTHER device populates the account. */
    async function firstSessionThenPopulatedElsewhere() {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const database = openBoundDevice(emptySeed);
      const first = await renderApp(database, remote);
      await waitFor(() => expect(first.view.getByTestId('route-(app)')).toBeTruthy());
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');
      await first.view.unmount();

      await uploadFromAnotherDevice(remote);
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY'); // still stored
      return { remote, database };
    }

    it('A — new session online: the account is checked again, restored on its own, and the data is there', async () => {
      const { remote, database } = await firstSessionThenPopulatedElsewhere();
      const { gateway, release } = holdFirstCheck(remote);

      const { view } = await renderApp(database, gateway);
      // The stored EMPTY opened nothing: the app waits for THIS session's check.
      expect(view.getByTestId('data-loading-screen')).toBeTruthy();
      expect(view.queryByTestId('route-(app)')).toBeNull();

      await release();
      await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
      const restored = loadSnapshot(database);
      expect([restored.clients.length, restored.services.length, restored.products.length]).toEqual([1, 2, 2]);
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
      expect(countSyncOutboxRows(database)).toBe(0);
      expect(remote.requests).toEqual([]);
    });

    it('B + C — new session offline: no application, nothing can be created; back online, « Réessayer » restores and opens the app', async () => {
      const { remote, database } = await firstSessionThenPopulatedElsewhere();
      const countsBefore = remote.countCalls;

      // B. Offline relaunch: the session falls back to the local owner, no request is possible.
      let session: RestoredSession = { kind: 'unavailable' };
      const auth = createFakeAuthGateway({ restore: async () => session });
      const view = await render(
        <TestPersistenceProvider createSeed={emptySeed} database={database}>
          <AuthProvider
            gateway={auth}
            resolveLocalOwner={() => {
              const profile = readBusinessProfile(database);
              return profile ? { id: profile.ownerUserId } : undefined;
            }}
          >
            <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
              <CloudSyncRunner gateway={remote}>
                <RootNavigator />
              </CloudSyncRunner>
            </BusinessSessionProvider>
          </AuthProvider>
        </TestPersistenceProvider>,
      );
      await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
      expect(view.queryByTestId('route-(app)')).toBeNull(); // no screen that creates a record exists
      expect(remote.countCalls).toBe(countsBefore);
      expect(loadSnapshot(database)).toEqual(EMPTY_SNAPSHOT);
      expect(countSyncOutboxRows(database)).toBe(0);

      // C. The network is back.
      session = live;
      await act(async () => {
        fireEvent.press(view.getByTestId('data-unavailable-retry'));
      });

      await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
      expect(view.queryByTestId('data-unavailable-screen')).toBeNull();
      expect(loadSnapshot(database).clients).toHaveLength(1);
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
      expect(countSyncOutboxRows(database)).toBe(0);
      expect(remote.requests).toEqual([]);
    });

    it('an empty device whose account is STILL empty opens again after this session\'s own check — never before it', async () => {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const database = openBoundDevice(emptySeed);
      await createSyncPushWorker({ database, gateway: remote }).run(REMOTE_BUSINESS_ID);
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');

      const { gateway, release } = holdFirstCheck(remote);
      const { view } = await renderApp(database, gateway);
      expect(view.queryByTestId('route-(app)')).toBeNull();
      await release();
      await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    });
  });

  it('a stored EMPTY whose new check fails is retried by the periodic check, although nothing else is due', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const database = openBoundDevice(emptySeed);
    await createSyncPushWorker({ database, gateway: remote }).run(REMOTE_BUSINESS_ID);
    remote.failNext(new SyncRemoteError('NETWORK'));

    const { view } = await renderApp(database, remote);
    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());

    await act(async () => triggers.tick?.());
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
  });

  describe('an empty device that ALREADY synchronizes is not a fresh install', () => {
    it('synchronized, then everything deleted and the deletions acknowledged: opens at once on an offline relaunch', async () => {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const database = openBoundDevice(emptySeed);
      const run = () => createSyncPushWorker({ database, gateway: remote }).run(REMOTE_BUSINESS_ID);

      // A real history: first record uploaded, then deleted, the deletion acknowledged by the server.
      insertProduct(database, { ...productSerum, id: 'product-only', businessId: REMOTE_BUSINESS_ID });
      expect(approveInitialUpload(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
      expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
      deleteProduct(database, 'product-only');
      expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
      expect(loadSnapshot(database)).toEqual(EMPTY_SNAPSHOT);
      expect(countSyncOutboxRows(database)).toBe(0);
      expect(hasAcknowledgedRemoteState(database, REMOTE_BUSINESS_ID)).toBe(true); // the tombstone's version
      const countsBefore = remote.countCalls;

      const { view } = await renderApp(database, remote, { kind: 'unavailable' });
      await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
      expect(view.queryByTestId('data-loading-screen')).toBeNull();
      expect(view.queryByTestId('data-unavailable-screen')).toBeNull();
      expect(remote.countCalls).toBe(countsBefore); // offline: nothing was asked
    });

    it('only a stored EMPTY and no acknowledged state, offline relaunch: no application', async () => {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const database = openBoundDevice(emptySeed);
      await createSyncPushWorker({ database, gateway: remote }).run(REMOTE_BUSINESS_ID);
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');
      expect(hasAcknowledgedRemoteState(database, REMOTE_BUSINESS_ID)).toBe(false);

      const { view } = await renderApp(database, remote, { kind: 'unavailable' });
      await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
      expect(view.queryByTestId('route-(app)')).toBeNull();
      expect(countSyncOutboxRows(database)).toBe(0);
    });

    it('an initial upload interrupted before any acknowledgement proves nothing: no application offline', async () => {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const database = openBoundDevice(emptySeed);
      insertProduct(database, { ...productSerum, id: 'product-only', businessId: REMOTE_BUSINESS_ID });
      expect(approveInitialUpload(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
      // The upload is decided and queued, then the very first push never gets an answer.
      remote.beforePush(() => {
        throw new SyncRemoteError('NETWORK');
      });
      expect(await createSyncPushWorker({ database, gateway: remote }).run(REMOTE_BUSINESS_ID)).toMatchObject({
        status: 'PUSHED',
        bootstrap: 'INITIAL_UPLOAD',
        pushed: 0,
        stoppedBy: 'NETWORK',
      });
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD');
      expect(hasAcknowledgedRemoteState(database, REMOTE_BUSINESS_ID)).toBe(false);
      // The user then removes that record: the device is empty, with a stored INITIAL_UPLOAD and no ACK.
      deleteProduct(database, 'product-only');
      expect(loadSnapshot(database)).toEqual(EMPTY_SNAPSHOT);

      const { view } = await renderApp(database, remote, { kind: 'unavailable' });
      await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
      expect(view.queryByTestId('route-(app)')).toBeNull();
    });

    it('a forged or leftover decision without acknowledged state opens nothing either', async () => {
      const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
      const database = openBoundDevice(emptySeed);
      writeSyncBootstrapRecord(database, { businessId: REMOTE_BUSINESS_ID, decision: 'ALREADY_SYNCED', decidedAt: new Date() });

      const { view } = await renderApp(database, remote, { kind: 'unavailable' });
      await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());
      expect(view.queryByTestId('route-(app)')).toBeNull();
    });
  });

  it('D — a device that holds its data stays usable offline, and stays open for the whole session', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const database = openBoundDevice(createTestSeed);
    const { view } = await renderApp(database, remote, { kind: 'unavailable' });

    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('data-loading-screen')).toBeNull();
    expect(view.queryByTestId('data-unavailable-screen')).toBeNull();
    expect(remote.countCalls).toBe(0);

    // Working offline is untouched: mutations land in SQLite and wait in the outbox.
    insertProduct(database, { ...productSerum, id: 'product-offline', businessId: REMOTE_BUSINESS_ID });
    expect(loadSnapshot(database).products.some((product) => product.id === 'product-offline')).toBe(true);
    expect(countSyncOutboxRows(database)).toBe(1);
    expect(view.getByTestId('route-(app)')).toBeTruthy();
  });

  it('without Supabase there is nothing to wait for: the app opens', async () => {
    const { view } = await renderApp(openBoundDevice(emptySeed), undefined);
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
  });

  it('uses no synchronization vocabulary', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    remote.failNext(new SyncRemoteError('NETWORK'));
    const { view } = await renderApp(openBoundDevice(emptySeed), remote);
    await waitFor(() => expect(view.getByTestId('data-unavailable-screen')).toBeTruthy());

    expect(JSON.stringify(view.toJSON())).not.toMatch(TECHNICAL_VOCABULARY);
  });
});
