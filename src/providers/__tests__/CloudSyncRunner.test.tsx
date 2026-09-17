import { act, render, waitFor } from '@testing-library/react-native';
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
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { insertProduct } from '@/persistence/stores/products';
import { approveInitialUpload } from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { createFakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed, productSerum } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { CloudSyncRunner, SYNC_FOREGROUND_TICK_MS } from '../CloudSyncRunner';

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
