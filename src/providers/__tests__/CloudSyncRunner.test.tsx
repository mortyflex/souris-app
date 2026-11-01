import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import type { SubscriptionVerification } from '@/domain/access';
import { BusinessAccessProvider } from '@/features/access/session/BusinessAccessProvider';
import { createFakeSubscriptionSource, type FakeSubscriptionSource } from '@/features/access/testing/fake-subscription-source';
import { readSyncEntitlementHold } from '@/persistence/sync/entitlement-hold';
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
import { updateClient } from '@/persistence/stores/clients';
import {
  approveInitialUpload,
  readInitialRestoreApproval,
  readInitialUploadApproval,
  readSyncBootstrapRecord,
  writeSyncBootstrapRecord,
} from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { SyncRemoteError, type SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { createFakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { clientLea, createTestSeed, productMask, productSerum } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { useProductImageUri } from '@/features/products/images/use-product-image-uri';
import { PRODUCT_PHOTO_CACHE_DIRECTORY } from '@/features/products/images/product-photo-storage';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { getMediaCacheUri } from '@/persistence/media/business-media';
import { findProduct, insertProduct, updateProduct } from '@/persistence/stores/products';
import { createFakeBusinessMediaRemote } from '@/persistence/testing/fake-business-media-remote';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { CloudSyncRunner, SYNC_FOREGROUND_TICK_MS, useCloudSyncControl, type CloudSyncControl } from '../CloudSyncRunner';

function openDatabase({ bound }: { readonly bound: boolean }): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, createTestSeed);
  if (bound) bindLocalDatabaseToBusiness(database, createRemoteBusiness());
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

/** Another device that already uploaded the Business to `remote` (bare worker: the approval is given by hand). */
async function uploadFromAnotherDevice(remote: ReturnType<typeof createFakeSyncRemote>) {
  const source = openDatabase({ bound: true });
  expect(approveInitialUpload(source, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
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

let renderCount = 0;

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
  // Local, never-persisted UI state: a stand-in for a draft, a query, a step.
  const [draft] = useState(() => `draft-${Math.random()}`);
  // Every committed render of this screen (an effect without dependencies).
  useEffect(() => {
    renderCount += 1;
  });
  useEffect(() => onControl(control), [control, onControl]);
  useEffect(() => onMount(), [onMount]);
  return (
    <>
      <Text testID="client-names">{clients.map((client) => client.firstName).join(',')}</Text>
      <Text testID="local-draft">{draft}</Text>
    </>
  );
}

async function renderApp(database: SourisDatabase, remote: SyncRemoteGateway) {
  let control: CloudSyncControl = { runner: false, runNow: undefined, refreshNow: undefined, firstSync: { status: 'ready', retrying: false } };
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

/** The AppState listener and the 2-minute tick, captured so a test fires them by hand. */
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

describe('CloudSyncRunner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploads the existing local data of a fresh Business on its own at launch — no manual approval, one bounded re-run', async () => {
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);

    await renderRunner({ database, restore: live, sync: remote });

    await waitFor(() => expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6));
    expect(remote.requests.every((request) => request.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    // Classified (STOP), approved for this Business, classified again (INITIAL_UPLOAD): exactly two runs.
    expect(remote.countCalls).toBe(2);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD');
    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined(); // consumed
  });

  it('new device: restores the Business on its own at launch — SQLite rebuilt, screens re-hydrated, nothing echoed to the outbox', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    remote.clearRequests();

    const database = openFreshBoundDevice();
    const { view } = await renderApp(database, remote);

    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa'));
    const restored = loadSnapshot(database);
    expect([restored.services.length, restored.products.length, restored.appointments.length]).toEqual([2, 2, 1]);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined(); // cleared by the restore
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(remote.requests).toEqual([]); // restored data is never pushed back
  });

  it('stale EMPTY: the first aggregate created after an empty launch is uploaded by the foreground tick alone', async () => {
    const triggers = captureTriggers();
    const database = openFreshBoundDevice();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database, restore: live, sync: remote });
    await waitFor(() => expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY'));

    // Nothing to do yet: the tick is a local check only.
    const classified = remote.countCalls;
    await act(async () => triggers.tick?.());
    expect(remote.countCalls).toBe(classified);

    // The user creates their first record. No foreground event, no runNow.
    insertProduct(database, { ...productSerum, id: 'product-first', businessId: REMOTE_BUSINESS_ID });
    await act(async () => triggers.tick?.());

    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-first')?.syncVersion).toBe(1));
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD');

    // From there on it is plain incremental sync.
    insertProduct(database, { ...productSerum, id: 'product-second', businessId: REMOTE_BUSINESS_ID });
    await act(async () => triggers.tick?.());
    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-second')?.syncVersion).toBe(1));
  });

  it('RECONCILIATION_REQUIRED stays blocked — launch, foreground and tick included; neither side is overwritten', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    remote.clearRequests();
    const remoteBefore = remote.list(REMOTE_BUSINESS_ID);

    // This device holds its own data for the same Business and never synchronized.
    const database = openDatabase({ bound: true });
    updateClient(database, { ...clientLea, firstName: 'Léa-locale' });
    const localBefore = loadSnapshot(database);
    const countsBefore = remote.countCalls;

    await renderRunner({ database, restore: live, sync: remote });
    await waitFor(() =>
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RECONCILIATION_REQUIRED'),
    );
    expect(remote.countCalls).toBe(countsBefore + 1); // one classification, no re-run

    await act(async () => triggers.appState?.('active'));
    await waitFor(() => expect(remote.countCalls).toBe(countsBefore + 2));
    await act(async () => triggers.tick?.());
    expect(remote.countCalls).toBe(countsBefore + 2); // no run resolves it: the tick never polls

    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(remote.requests).toEqual([]);
    expect(remote.pulls).toEqual([]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual(remoteBefore);
    expect(loadSnapshot(database)).toEqual(localBefore);
  });

  it('a failed restore changes nothing locally and is retried on its own by the next trigger', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await uploadFromAnotherDevice(remote);
    remote.clearRequests();
    remote.beforePull(() => {
      throw new SyncRemoteError('NETWORK');
    });

    const database = openFreshBoundDevice();
    const { view } = await renderApp(database, remote);
    await waitFor(() => expect(remote.pulls).toHaveLength(1));
    await act(async () => {});

    expect(loadSnapshot(database)).toEqual({ clients: [], services: [], products: [], appointments: [], sales: [], calendarBlocks: [], appointmentDeposits: [], serviceCategories: [], saleAdjustments: [] });
    expect(view.getByTestId('client-names').props.children).toBe('');
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeDefined(); // kept for the retry

    // The network is back: the slow tick alone finishes the job.
    remote.beforePull(undefined);
    await act(async () => triggers.tick?.());

    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa'));
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(remote.requests).toEqual([]);
  });

  it('approves nothing once the session ended while the classification was in flight', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: SyncRemoteGateway = {
      countBusinessAggregates: async (businessId) => {
        await gate;
        return remote.countBusinessAggregates(businessId);
      },
      pushAggregate: (request) => remote.pushAggregate(request),
      pullBusinessAggregates: (businessId, since) => remote.pullBusinessAggregates(businessId, since),
    };
    const database = openDatabase({ bound: true });
    const view = await renderRunner({ database, restore: live, sync: slow });

    await view.unmount();
    await act(async () => release());
    await waitFor(() =>
      expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD_REQUIRES_APPROVAL'),
    );
    await act(async () => {});

    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(remote.countCalls).toBe(1);
    expect(remote.requests).toEqual([]);
  });

  it('refreshes the screens IN PLACE after a pull applied a remote change — never remounting them, drafts intact', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const other = await uploadFromAnotherDevice(remote);
    const database = openFreshBoundDevice();
    const { view, runNow, mounts } = await renderApp(database, remote);
    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa'));

    // A run with nothing to pull, then a push-only run: the screens are left alone.
    await runNow();
    updateClient(database, { ...clientLea, phone: '07 00 00 00 00' });
    await runNow();
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    const mountedBefore = mounts();
    const draftBefore = view.getByTestId('local-draft').props.children;

    // The other device first receives that phone number (editing a stale copy would be a real
    // conflict), then renames the Client; this one pulls it and shows it.
    expect(await other.run()).toMatchObject({ pull: { status: 'PULLED', applied: 1 } });
    updateClient(other.source, { ...clientLea, phone: '07 00 00 00 00', firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1, conflicts: [] });
    expect(view.getByTestId('client-names').props.children).toBe('Léa');
    await runNow();
    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa-Rose'));
    // Refreshed in place: the same mounted screen, its local state untouched.
    expect(mounts()).toBe(mountedBefore);
    expect(view.getByTestId('local-draft').props.children).toBe(draftBefore);
    expect(countSyncOutboxRows(database)).toBe(0); // no echo

    // A pull that brings nothing: nothing is re-read, nothing re-renders.
    const rendersBefore = renderCount;
    await runNow();
    expect(mounts()).toBe(mountedBefore);
    expect(renderCount).toBe(rendersBefore);
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

  it('runs again when the app returns to the foreground; the foreground tick pushes only when there is local work, and otherwise pulls', async () => {
    const triggers = captureTriggers();
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database, restore: live, sync: remote });
    await waitFor(() => expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6));
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    const settled = remote.requests.length;

    // Idle tick of a synchronizing device: ONE incremental pull since the
    // stored cursor, and no push (there is nothing to push).
    const pullsBefore = remote.pulls.length;
    await act(async () => triggers.tick?.());
    await waitFor(() => expect(remote.pulls).toHaveLength(pullsBefore + 1));
    expect(remote.pulls[remote.pulls.length - 1]).toBeInstanceOf(Date);
    expect(remote.requests).toHaveLength(settled);

    insertProduct(database, { ...productSerum, id: 'product-new', businessId: REMOTE_BUSINESS_ID });
    await act(async () => triggers.tick?.());
    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-new')?.syncVersion).toBe(1));

    // In the background the tick stays silent; returning to the foreground runs at once.
    insertProduct(database, { ...productSerum, id: 'product-later', businessId: REMOTE_BUSINESS_ID });
    await act(async () => triggers.appState?.('background'));
    const beforeBackgroundTick = remote.requests.length;
    const pullsBeforeBackgroundTick = remote.pulls.length;
    await act(async () => triggers.tick?.());
    expect(remote.requests).toHaveLength(beforeBackgroundTick);
    expect(remote.pulls).toHaveLength(pullsBeforeBackgroundTick);
    await act(async () => triggers.appState?.('active'));
    await waitFor(() => expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-later')?.syncVersion).toBe(1));
  });

  it('an idle foreground device receives another device\'s change within ONE tick, in place', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const other = await uploadFromAnotherDevice(remote);
    const database = openFreshBoundDevice();
    const { view, mounts } = await renderApp(database, remote);
    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa'));
    await waitFor(() => expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED'));
    const mountedBefore = mounts();
    const draftBefore = view.getByTestId('local-draft').props.children;

    updateClient(other.source, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ pushed: 1 });
    // This device has no local work at all.
    expect(countSyncOutboxRows(database)).toBe(0);

    await act(async () => triggers.tick?.());
    await waitFor(() => expect(view.getByTestId('client-names').props.children).toBe('Léa-Rose'));
    expect(mounts()).toBe(mountedBefore);
    expect(view.getByTestId('local-draft').props.children).toBe(draftBefore);
  });

  it('never overlaps runs: ticks while a pull is in flight make no second request', async () => {
    const triggers = captureTriggers();
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database, restore: live, sync: remote });
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pull = remote.pullBusinessAggregates.bind(remote);
    const slow = remote as { pullBusinessAggregates: typeof pull };
    slow.pullBusinessAggregates = async (...args) => {
      await gate;
      return pull(...args);
    };
    const pullsBefore = remote.pulls.length;
    await act(async () => triggers.tick?.());
    await act(async () => triggers.tick?.());
    await act(async () => triggers.tick?.());
    await act(async () => release());
    await waitFor(() => expect(remote.pulls).toHaveLength(pullsBefore + 1));
    expect(remote.pulls).toHaveLength(pullsBefore + 1);
  });

  it('a device that needs a reconciliation makes no request from the tick', async () => {
    const triggers = captureTriggers();
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await renderRunner({ database, restore: live, sync: remote });
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    writeSyncBootstrapRecord(database, {
      businessId: REMOTE_BUSINESS_ID,
      decision: 'RECONCILIATION_REQUIRED',
      decidedAt: new Date(),
    });
    const pullsBefore = remote.pulls.length;
    const requestsBefore = remote.requests.length;
    const countsBefore = remote.countCalls;

    await act(async () => triggers.tick?.());
    expect(remote.pulls).toHaveLength(pullsBefore);
    expect(remote.requests).toHaveLength(requestsBefore);
    expect(remote.countCalls).toBe(countsBefore);
  });

  it('Product: stock 4 / photo C on this idle open device becomes stock 3 / photo D after ONE tick — same mounted screen', async () => {
    const triggers = captureTriggers();
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const other = await uploadFromAnotherDevice(remote);
    const files = createMemoryLocalFiles();
    const media = createFakeBusinessMediaRemote(files);
    const PHOTO_C = `${REMOTE_BUSINESS_ID}/products/${productMask.id}/photo-c.jpg`;
    const PHOTO_D = `${REMOTE_BUSINESS_ID}/products/${productMask.id}/photo-d.jpg`;
    media.objects.set(PHOTO_C, 'photo C');
    media.objects.set(PHOTO_D, 'photo D');
    const setOnOther = async (stockQuantity: number, photoPath: string) => {
      const { imageUri: _legacy, ...current } = findProduct(other.source, productMask.id)!;
      updateProduct(other.source, { ...current, stockQuantity, photoPath });
      expect(await other.run()).toMatchObject({ pushed: 1, conflicts: [] });
    };
    await setOnOther(4, PHOTO_C);

    let productMounts = 0;
    function ProductProbe() {
      const { getProductById } = useProductCatalog();
      const mask = getProductById(productMask.id);
      const shown = useProductImageUri(mask);
      useEffect(() => {
        productMounts += 1;
      }, []);
      return <Text testID="mask">{`${mask?.stockQuantity ?? '-'}|${shown ?? 'placeholder'}`}</Text>;
    }

    const database = openFreshBoundDevice();
    const auth = createFakeAuthGateway({ restore: async () => live });
    const view = await render(
      <TestPersistenceProvider createSeed={emptySeed} database={database} files={files}>
        <AuthProvider gateway={auth}>
          <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
            <CloudSyncRunner gateway={remote}>
              <BusinessMediaProvider remote={media}>
                <ProductCatalogProvider>
                  <ProductProbe />
                </ProductCatalogProvider>
              </BusinessMediaProvider>
            </CloudSyncRunner>
          </BusinessSessionProvider>
        </AuthProvider>
      </TestPersistenceProvider>,
    );
    const cached = (path: string) => getMediaCacheUri(files, PRODUCT_PHOTO_CACHE_DIRECTORY, path);
    await waitFor(() => expect(view.getByTestId('mask')).toHaveTextContent(`4|${cached(PHOTO_C)}`));
    const mountedBefore = productMounts;

    // Device A: photo D and stock 3. This device stays open, idle, untouched.
    await setOnOther(3, PHOTO_D);
    expect(countSyncOutboxRows(database)).toBe(0);
    await act(async () => triggers.tick?.());

    await waitFor(() => expect(view.getByTestId('mask')).toHaveTextContent(`3|${cached(PHOTO_D)}`));
    expect(database.getFirstSync('SELECT stock_quantity, photo_path FROM products WHERE id = ?', [productMask.id])).toEqual({
      stock_quantity: 3,
      photo_path: PHOTO_D,
    });
    expect(productMounts).toBe(mountedBefore);
  });
});

// ---------------------------------------------------------------------------
// BeautIzzy Plus (Phase 6.5C, step 3): the server refuses the Business's
// writes, the runner keeps pulling, and the moment the access session turns
// from read-only to full the held writes are sent again — once, in order,
// through the same single-flight orchestration. Nothing assumes the server
// agrees: a refusal then records a fresh hold.
// ---------------------------------------------------------------------------

describe('CloudSyncRunner — held writes resume when Plus is back', () => {
  const EXPIRED: SubscriptionVerification = { kind: 'verified', status: { kind: 'expired' } };
  const ACTIVE: SubscriptionVerification = {
    kind: 'verified',
    status: { kind: 'active', plan: 'monthly', expiresAt: new Date('2027-01-01T00:00:00.000Z') },
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The runner under a REAL access session with enforcement enabled: read-only until the store says otherwise. */
  async function renderRestricted(database: SourisDatabase, remote: SyncRemoteGateway, source: FakeSubscriptionSource) {
    const auth = createFakeAuthGateway({ restore: async () => live });
    const view = await render(
      <TestPersistenceProvider createSeed={createTestSeed} database={database}>
        <AuthProvider gateway={auth}>
          <BusinessAccessProvider enforcement="enabled" source={source}>
            <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
              <CloudSyncRunner gateway={remote} />
            </BusinessSessionProvider>
          </BusinessAccessProvider>
        </AuthProvider>
      </TestPersistenceProvider>,
    );
    await act(async () => {});
    return view;
  }

  async function holdRecordedUnderReadOnly() {
    const triggers = captureTriggers();
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = createFakeSubscriptionSource();
    source.respondWith(EXPIRED);
    const view = await renderRestricted(database, remote, source);
    // Synchronization never needs Plus to START: the existing data is uploaded (reading and uploading are not restricted).
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    await waitFor(() => expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6));

    // From now on the server refuses the Business's writes. A local change is made (the write guard is a product
    // boundary: the store is written directly here, as a change made while access was still full would have been).
    remote.refuseEntitlement(true);
    updateClient(database, { ...clientLea, firstName: 'Léa-en-attente' });
    const requestsBefore = remote.requests.length;
    await act(async () => triggers.tick?.());
    await waitFor(() => expect(readSyncEntitlementHold(database, REMOTE_BUSINESS_ID)).toMatchObject({ refusals: 1 }));
    expect(remote.requests).toHaveLength(requestsBefore + 1);
    expect(countSyncOutboxRows(database)).toBe(1);

    // Under the hold a tick still pulls, and sends nothing.
    const pullsBefore = remote.pulls.length;
    await act(async () => triggers.tick?.());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(pullsBefore));
    expect(remote.requests).toHaveLength(requestsBefore + 1);
    return { triggers, database, remote, source, view, requestsBefore };
  }

  it('Plus back and the server agrees: the hold is lifted, ONE run sends the held write, nothing twice', async () => {
    const { database, remote, source, requestsBefore } = await holdRecordedUnderReadOnly();

    remote.refuseEntitlement(false);
    await act(async () => source.emit(fakeUser.id, ACTIVE));

    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    expect(remote.requests).toHaveLength(requestsBefore + 2);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.payload).toMatchObject({ first_name: 'Léa-en-attente' });
    expect(readSyncEntitlementHold(database, REMOTE_BUSINESS_ID)).toBeUndefined();

    // A later push of the store (the same answer again) is not a transition: no further run, no further request.
    await act(async () => source.emit(fakeUser.id, ACTIVE));
    await act(async () => {});
    expect(remote.requests).toHaveLength(requestsBefore + 2);
  });

  it('Plus looks back locally but the server still refuses: one attempt, a fresh hold, the change kept, no loop', async () => {
    const { triggers, database, remote, source, requestsBefore } = await holdRecordedUnderReadOnly();

    await act(async () => source.emit(fakeUser.id, ACTIVE));
    await waitFor(() => expect(remote.requests).toHaveLength(requestsBefore + 2));
    await waitFor(() => expect(readSyncEntitlementHold(database, REMOTE_BUSINESS_ID)).toMatchObject({ refusals: 1 }));
    expect(countSyncOutboxRows(database)).toBe(1);

    await act(async () => triggers.tick?.());
    await act(async () => {});
    expect(remote.requests).toHaveLength(requestsBefore + 2);
    expect(loadSnapshot(database).clients.find((client) => client.id === clientLea.id)?.firstName).toBe('Léa-en-attente');
  });

  it('a read-only session that stays read-only never triggers a run by itself', async () => {
    const { remote, source, requestsBefore } = await holdRecordedUnderReadOnly();
    await act(async () => source.emit(fakeUser.id, EXPIRED));
    await act(async () => {});
    expect(remote.requests).toHaveLength(requestsBefore + 1);
  });
});
