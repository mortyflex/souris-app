import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import type { RestoredSession } from '@/features/auth/gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import {
  createFakeBusinessGateway,
  createRemoteBusiness,
  REMOTE_BUSINESS_ID,
} from '@/features/business/testing/fake-business-gateway';
import { useClientSession, ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { insertProduct } from '@/persistence/stores/products';
import { updateClient } from '@/persistence/stores/clients';
import { approveInitialRestore, approveInitialUpload, readSyncBootstrapRecord } from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { createFakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { clientLea, createTestSeed, productSerum } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { CloudSyncRunner, SYNC_FOREGROUND_TICK_MS, useCloudSyncControl, type CloudSyncControl } from '../CloudSyncRunner';

function openDatabase({
  bound,
  approved = false,
}: {
  readonly bound: boolean;
  /** The explicit initial-upload approval of the supervised pilot transfer. */
  readonly approved?: boolean;
}): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, createTestSeed);
  if (bound) bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  if (approved) {
    expect(approveInitialUpload(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
  }
  return database;
}

interface Harness {
  readonly database: SourisDatabase;
  readonly restore: RestoredSession;
  readonly sync: SyncRemoteGateway | undefined;
}

async function renderRunner({ database, restore, sync }: Harness) {
  const auth = createFakeAuthGateway({ restore: async () => restore });
  const view = await render(
    <TestPersistenceProvider createSeed={createTestSeed} database={database}>
      <AuthProvider
        gateway={auth}
        resolveLocalOwner={() => {
          const profile = readBusinessProfile(database);
          return profile ? { id: profile.ownerUserId } : undefined;
        }}
      >
        <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
          <CloudSyncRunner gateway={sync} />
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

const live: RestoredSession = { kind: 'authenticated', user: fakeUser };

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

/** Another device that already uploaded the Business to `remote`. */
async function uploadFromAnotherDevice(remote: ReturnType<typeof createFakeSyncRemote>) {
  const source = openDatabase({ bound: true, approved: true });
  const worker = createSyncPushWorker({ database: source, gateway: remote });
  await worker.run(REMOTE_BUSINESS_ID);
  expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
  return { source, run: () => worker.run(REMOTE_BUSINESS_ID) };
}

function openFreshBoundDevice(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, emptySeed);
  bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  return database;
}

/** What a screen sees: the Client session, hydrated from the persisted snapshot. */
function ClientNamesProbe({
  onControl,
  onMount,
}: {
  readonly onControl: (control: CloudSyncControl) => void;
  readonly onMount: () => void;
}) {
  const { clients } = useClientSession();
  const control = useCloudSyncControl();
  useEffect(() => onControl(control), [control, onControl]);
  useEffect(() => onMount(), [onMount]);
  return <Text testID="client-names">{clients.map((client) => client.firstName).join(',')}</Text>;
}

async function renderApp(database: SourisDatabase, remote: SyncRemoteGateway) {
  let control: CloudSyncControl = { runNow: undefined, restoreRequired: false };
  let mountCount = 0;
  const onControl = (next: CloudSyncControl) => {
    control = next;
  };
  const onMount = () => {
    mountCount += 1;
  };
  const auth = createFakeAuthGateway({ restore: async () => live });
  const view = await render(
    <TestPersistenceProvider createSeed={emptySeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
          <CloudSyncRunner gateway={remote}>
            <ClientSessionProvider>
              <ClientNamesProbe onControl={onControl} onMount={onMount} />
            </ClientSessionProvider>
          </CloudSyncRunner>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return {
    view,
    mounts: () => mountCount,
    runNow: () =>
      act(async () => {
        await control.runNow?.();
      }),
  };
}

describe('CloudSyncRunner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cannot upload existing local data before the explicit approval — launch, foreground and tick included', async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppStateChange = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    let tick: (() => void) | undefined;
    const realSetInterval = globalThis.setInterval;
    jest.spyOn(globalThis, 'setInterval').mockImplementation(((handler: () => void, ms?: number) => {
      if (ms === SYNC_FOREGROUND_TICK_MS) {
        tick = handler;
        return 0 as unknown as ReturnType<typeof setInterval>;
      }
      return realSetInterval(handler, ms);
    }) as typeof setInterval);

    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database, restore: live, sync: remote });

    // The run happened (it classified) and stopped there.
    await waitFor(() => expect(remote.countCalls).toBe(1));
    await act(async () => onAppStateChange?.('active'));
    await waitFor(() => expect(remote.countCalls).toBe(2));
    const classified = remote.countCalls;
    await act(async () => tick?.());

    expect(remote.countCalls).toBe(classified); // a blocked device never polls from the tick
    expect(remote.requests).toEqual([]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
    expect(countSyncOutboxRows(database)).toBe(0);
  });

  it('uploads the existing local data once approved, with the live session bound to its Business', async () => {
    const database = openDatabase({ bound: true, approved: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);

    await renderRunner({ database, restore: live, sync: remote });

    await waitFor(() => expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6));
    expect(remote.requests.every((request) => request.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
  });

  it('never restores an empty device on its own — launch and foreground included; once approved, the next run rebuilds SQLite and the screens re-hydrate', async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppStateChange = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    remote.clearRequests();

    const database = openFreshBoundDevice();
    const { view, runNow } = await renderApp(database, remote);
    await waitFor(() => expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED'));
    await act(async () => onAppStateChange?.('active'));
    await runNow();

    expect(remote.pulls).toEqual([]); // the dataset was never fetched
    expect(loadSnapshot(database).clients).toEqual([]);
    expect(view.getByTestId('client-names').props.children).toBe('');

    expect(approveInitialRestore(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
    await runNow();

    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa'));
    expect(loadSnapshot(database).services).toHaveLength(2);
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(remote.requests).toEqual([]); // restored data is never pushed back
  });

  it('re-hydrates the screens after a pull applied a remote change — and never remounts them for a push-only run', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const other = await uploadFromAnotherDevice(remote);
    const database = openFreshBoundDevice();
    // Approved before launch: the very first run restores.
    expect(approveInitialRestore(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
    const { view, runNow, mounts } = await renderApp(database, remote);
    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa'));

    // A run with nothing to pull, then a push-only run: the screens are left alone.
    await runNow();
    updateClient(database, { ...clientLea, phone: '07 00 00 00 00' });
    await runNow();
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    const mountedBefore = mounts();

    // The other device first receives that phone number (editing a stale copy would be a real
    // conflict), then renames the Client; this one pulls it and shows it.
    expect(await other.run()).toMatchObject({ pull: { status: 'PULLED', applied: 1 } });
    updateClient(other.source, { ...clientLea, phone: '07 00 00 00 00', firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1, conflicts: [] });
    expect(view.getByTestId('client-names').props.children).toBe('Léa');
    await runNow();
    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa-Rose'));
    expect(mounts()).toBe(mountedBefore + 1);
    expect(countSyncOutboxRows(database)).toBe(0); // no echo

    await runNow();
    expect(mounts()).toBe(mountedBefore + 1);
  });

  it('never runs on the offline session fallback: no valid token, no request', async () => {
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);

    await renderRunner({ database, restore: { kind: 'unavailable' }, sync: remote });

    expect(remote.countCalls).toBe(0);
    expect(remote.requests).toEqual([]);
  });

  it('never runs while signed out', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database: openDatabase({ bound: true }), restore: { kind: 'unauthenticated' }, sync: remote });
    expect(remote.countCalls).toBe(0);
  });

  it('renders nothing and does nothing without a sync gateway', async () => {
    const view = await renderRunner({ database: openDatabase({ bound: true }), restore: live, sync: undefined });
    expect(view.toJSON()).toBeNull();
  });

  it('runs again when the app returns to the foreground, and the slow tick only fires for eligible pending work', async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppStateChange = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    let tick: (() => void) | undefined;
    const realSetInterval = globalThis.setInterval;
    jest.spyOn(globalThis, 'setInterval').mockImplementation(((handler: () => void, ms?: number) => {
      if (ms === SYNC_FOREGROUND_TICK_MS) {
        tick = handler;
        return 0 as unknown as ReturnType<typeof setInterval>;
      }
      return realSetInterval(handler, ms);
    }) as typeof setInterval);

    const database = openDatabase({ bound: true, approved: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database, restore: live, sync: remote });
    await waitFor(() => expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6));
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    const settled = remote.requests.length;

    // Idle tick: a local check only — no request.
    await act(async () => tick?.());
    expect(remote.requests).toHaveLength(settled);

    insertProduct(database, { ...productSerum, id: 'product-new', businessId: REMOTE_BUSINESS_ID });
    await act(async () => tick?.());
    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-new')?.syncVersion).toBe(1));

    // In the background the tick stays silent; returning to the foreground runs at once.
    insertProduct(database, { ...productSerum, id: 'product-later', businessId: REMOTE_BUSINESS_ID });
    await act(async () => onAppStateChange?.('background'));
    const beforeBackgroundTick = remote.requests.length;
    await act(async () => tick?.());
    expect(remote.requests).toHaveLength(beforeBackgroundTick);
    await act(async () => onAppStateChange?.('active'));
    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-later')?.syncVersion).toBe(1));
  });
});
