import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import type { RestoredSession } from '@/features/auth/gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import {
  createFakeBusinessGateway,
  createRemoteBusiness,
  REMOTE_BUSINESS_ID,
} from '@/features/business/testing/fake-business-gateway';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { insertClient } from '@/persistence/stores/clients';
import {
  approveInitialRestore,
  approveInitialUpload,
  readInitialRestoreApproval,
  readSyncBootstrapRecord,
  writeSyncBootstrapRecord,
} from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { loadSyncState } from '@/persistence/sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { CloudSyncRunner } from '@/providers/CloudSyncRunner';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { CloudRestoreSheet } from '../CloudRestoreSheet';

// The REAL approval, observable: the prompt must call exactly this function, and only after the confirmation.
jest.mock('@/persistence/sync/bootstrap', () => {
  const actual = jest.requireActual<typeof import('@/persistence/sync/bootstrap')>('@/persistence/sync/bootstrap');
  return { ...actual, approveInitialRestore: jest.fn(actual.approveInitialRestore) };
});
const approveSpy = jest.mocked(approveInitialRestore);

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });
const live: RestoredSession = { kind: 'authenticated', user: fakeUser };

/** Another device already uploaded the Business (6 aggregates, one Client named Léa). */
async function populateRemote(remote: FakeSyncRemote) {
  const source = openTestDatabase();
  bootstrapPersistence(source, createTestSeed);
  bindLocalDatabaseToBusiness(source, createRemoteBusiness());
  expect(approveInitialUpload(source, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
  await createSyncPushWorker({ database: source, gateway: remote }).run(REMOTE_BUSINESS_ID);
  expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
  remote.clearRequests();
}

function openFreshBoundDevice(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, emptySeed);
  bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  return database;
}

/** What a screen sees: the Client session hydrated from the persisted snapshot. */
function ClientNamesProbe() {
  const { clients } = useClientSession();
  return <Text testID="client-names">{clients.map((client) => client.firstName).join(',')}</Text>;
}

async function renderApp(database: SourisDatabase, remote: FakeSyncRemote, restore: RestoredSession = live) {
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
            <ClientSessionProvider>
              <ClientNamesProbe />
              <CloudRestoreSheet />
            </ClientSessionProvider>
          </CloudSyncRunner>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

type View = Awaited<ReturnType<typeof render>>;
const text = (view: View, testID: string) => view.getByTestId(testID).props.children as string;
const press = (view: View, testID: string) =>
  act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
/** Native presentations currently mounted: the restore flow must never stack a second one. */
const nativeModals = (view: View) =>
  view.container.queryAll((node) => node.type === 'Modal' && node.props.visible !== false).length;
const untouched = (database: SourisDatabase) => {
  expect(loadSnapshot(database)).toEqual({ clients: [], services: [], products: [], appointments: [], sales: [] });
  expect(loadSyncState(database, REMOTE_BUSINESS_ID)).toEqual([]);
  expect(countSyncOutboxRows(database)).toBe(0);
};

describe('CloudRestoreSheet', () => {
  beforeEach(() => approveSpy.mockClear());

  it('appears only for RESTORE_REQUIRED, names the Business, and restores NOTHING until the confirmation', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    const view = await renderApp(database, remote);

    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).not.toBeNull());
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(view.getByText('Des données existent pour ce compte')).toBeTruthy();
    expect(text(view, 'cloud-restore-message')).toContain('« Maison Léa »');
    expect(text(view, 'cloud-restore-message')).toContain('photos de produits ne sont pas restaurées');
    expect(view.getByTestId('cloud-restore-primary').props.accessibilityState?.disabled).toBeFalsy();
    // No aggregate value leaks into the prompt.
    expect(view.queryByText(/Léa Martin|06 12/)).toBeNull();

    expect(nativeModals(view)).toBe(1);

    // The primary action only ASKS: the SAME sheet turns into the confirmation naming the exact
    // Business — one native presentation, never a Modal inside the Modal (iOS refuses it).
    await press(view, 'cloud-restore-primary');
    expect(view.getByText('Restaurer les données de « Maison Léa » ?')).toBeTruthy();
    expect(view.getByTestId('cloud-restore-confirm-step')).toBeTruthy();
    expect(view.queryByTestId('cloud-restore-primary')).toBeNull();
    expect(nativeModals(view)).toBe(1);
    expect(approveSpy).not.toHaveBeenCalled();
    expect(remote.pulls).toEqual([]);

    // Cancelling returns to the explanation and approves nothing; « Plus tard » hides the prompt
    // without writing anything.
    await press(view, 'cloud-restore-cancel');
    expect(view.queryByTestId('cloud-restore-confirm-step')).toBeNull();
    expect(view.getByText('Des données existent pour ce compte')).toBeTruthy();
    expect(nativeModals(view)).toBe(1);
    await press(view, 'cloud-restore-defer');
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).toBeNull());
    expect(approveSpy).not.toHaveBeenCalled();
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(remote.pulls).toEqual([]);
    untouched(database);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
  });

  it('restores after the confirmation through approveInitialRestore + the runner, then the app re-hydrates from SQLite', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    const view = await renderApp(database, remote);
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).not.toBeNull());
    expect(text(view, 'client-names')).toBe('');

    await press(view, 'cloud-restore-primary');
    expect(nativeModals(view)).toBe(1);
    await press(view, 'cloud-restore-confirm');

    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(approveSpy).toHaveBeenCalledWith(database, REMOTE_BUSINESS_ID);
    await waitFor(() => expect(text(view, 'client-names')).toBe('Léa'));
    const restored = loadSnapshot(database);
    expect([restored.services.length, restored.products.length, restored.appointments.length]).toEqual([2, 2, 1]);
    expect(loadSyncState(database, REMOTE_BUSINESS_ID)).toHaveLength(6);
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
    expect(remote.requests).toEqual([]); // nothing restored is pushed back
    // The prompt is gone with the remount and does not come back.
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).toBeNull());
    expect(view.queryByTestId('cloud-restore-confirm-step')).toBeNull();
  });

  it('shows the busy state inside the same sheet while the restore runs, and blocks a second confirmation', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    const view = await renderApp(database, remote);
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).not.toBeNull());

    // Freeze the run: the remote answers only once the test releases it.
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalPull = remote.pullBusinessAggregates.bind(remote);
    remote.pullBusinessAggregates = async (businessId, since) => {
      await gate;
      return originalPull(businessId, since);
    };

    await press(view, 'cloud-restore-primary');
    await press(view, 'cloud-restore-confirm');
    expect(text(view, 'cloud-restore-confirm-message')).toContain('Restauration en cours');
    expect(view.getByTestId('cloud-restore-confirm').props.accessibilityState?.disabled).toBe(true);
    expect(view.getByTestId('cloud-restore-cancel').props.accessibilityState?.disabled).toBe(true);
    expect(nativeModals(view)).toBe(1);
    await press(view, 'cloud-restore-confirm'); // ignored while busy
    expect(approveSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await gate;
    });
    await waitFor(() => expect(text(view, 'client-names')).toBe('Léa'));
  });

  it('a failed restore leaves local data untouched, says so, keeps the approval and lets the user retry', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    const view = await renderApp(database, remote);
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).not.toBeNull());

    remote.beforePull(() => {
      throw new SyncRemoteError('NETWORK');
    });
    await press(view, 'cloud-restore-primary');
    await press(view, 'cloud-restore-confirm');
    await waitFor(() => expect(text(view, 'cloud-restore-message')).toContain('n’a pas abouti'));
    expect(text(view, 'cloud-restore-message')).toContain('Aucune donnée n’a été modifiée');
    expect(view.getByTestId('cloud-restore-primary').props.children ?? true).toBeTruthy();
    untouched(database);
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)?.businessId).toBe(REMOTE_BUSINESS_ID);
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(view.queryByTestId('cloud-restore-confirm-step')).toBeNull(); // back to the explanation
    expect(nativeModals(view)).toBe(1);

    remote.beforePull(undefined);
    await press(view, 'cloud-restore-primary'); // « Réessayer »
    expect(view.getByText('Restaurer les données de « Maison Léa » ?')).toBeTruthy();
    expect(nativeModals(view)).toBe(1);
    await press(view, 'cloud-restore-confirm');
    await waitFor(() => expect(text(view, 'client-names')).toBe('Léa'));
    expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
  });

  it('re-checks the Business and the state at confirmation time: a record created meanwhile refuses the restore', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    const view = await renderApp(database, remote);
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).not.toBeNull());
    await press(view, 'cloud-restore-primary');

    // The confirmation step is up; meanwhile the device stops being an empty device of that Business.
    writeSyncBootstrapRecord(database, { businessId: REMOTE_BUSINESS_ID, decision: 'RECONCILIATION_REQUIRED', decidedAt: new Date() });
    await press(view, 'cloud-restore-confirm');

    expect(approveSpy).not.toHaveBeenCalled();
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(remote.pulls).toEqual([]);
    expect(text(view, 'cloud-restore-message')).toContain('n’est plus possible');
    expect(view.queryByTestId('cloud-restore-primary')).toBeNull();
    await press(view, 'cloud-restore-defer'); // « Fermer »
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).toBeNull());
  });

  it('a Business populated meanwhile on this device is refused by the approval itself', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    const view = await renderApp(database, remote);
    await waitFor(() => expect(view.queryByTestId('cloud-restore-sheet')).not.toBeNull());
    await press(view, 'cloud-restore-primary');

    insertClient(database, { id: 'client-new-phone', firstName: 'Nina' });
    await press(view, 'cloud-restore-confirm');

    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(approveSpy.mock.results[0]?.value).toEqual({ status: 'REFUSED', reason: 'LOCAL_NOT_EMPTY' });
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(remote.pulls).toEqual([]);
    expect(loadSnapshot(database).clients.map((client) => client.id)).toEqual(['client-new-phone']);
    expect(text(view, 'cloud-restore-message')).toContain('n’est plus possible');
  });

  it.each([
    ['EMPTY (a normal new account)', (db: SourisDatabase) => db],
    [
      'INITIAL_UPLOAD_REQUIRES_APPROVAL (local data, empty remote)',
      (db: SourisDatabase) => {
        insertClient(db, { id: 'client-local', firstName: 'Locale' });
        return db;
      },
    ],
  ])('shows no prompt for %s', async (_label, prepare) => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const database = prepare(openFreshBoundDevice());
    const view = await renderApp(database, remote);
    await waitFor(() => expect(remote.countCalls).toBeGreaterThan(0));
    await act(async () => {});
    expect(view.queryByTestId('cloud-restore-sheet')).toBeNull();
    expect(approveSpy).not.toHaveBeenCalled();
    expect(remote.pulls).toEqual([]);
  });

  it('shows no prompt for RECONCILIATION_REQUIRED nor for a synchronized Business', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);

    const populated = openFreshBoundDevice();
    insertClient(populated, { id: 'client-local', firstName: 'Locale' });
    const conflict = await renderApp(populated, remote);
    await waitFor(() => expect(readSyncBootstrapRecord(populated, REMOTE_BUSINESS_ID)?.decision).toBe('RECONCILIATION_REQUIRED'));
    expect(conflict.queryByTestId('cloud-restore-sheet')).toBeNull();
    conflict.unmount();

    const synced = openFreshBoundDevice();
    expect(approveInitialRestore(synced, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
    await createSyncPushWorker({ database: synced, gateway: remote }).run(REMOTE_BUSINESS_ID);
    expect(readSyncBootstrapRecord(synced, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
    approveSpy.mockClear();
    const view = await renderApp(synced, remote);
    await waitFor(() => expect(text(view, 'client-names')).toBe('Léa'));
    expect(view.queryByTestId('cloud-restore-sheet')).toBeNull();
    expect(approveSpy).not.toHaveBeenCalled();
  });

  it('with the offline session fallback the prompt cannot restore: no run is possible, nothing is approved', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await populateRemote(remote);
    const database = openFreshBoundDevice();
    writeSyncBootstrapRecord(database, { businessId: REMOTE_BUSINESS_ID, decision: 'RESTORE_REQUIRED', decidedAt: new Date() });
    const classified = remote.countCalls; // the other device's own classification
    const view = await renderApp(database, remote, { kind: 'unavailable' });

    expect(remote.countCalls).toBe(classified);
    expect(view.queryByTestId('cloud-restore-sheet')).toBeNull(); // no live session: nothing classified for it
    expect(approveSpy).not.toHaveBeenCalled();
    untouched(database);
  });
});
