import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import {
  createFakeBusinessGateway,
  createRemoteBusiness,
  REMOTE_BUSINESS_ID,
} from '@/features/business/testing/fake-business-gateway';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import {
  approveInitialUpload,
  readInitialRestoreApproval,
  readInitialUploadApproval,
  writeSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { CloudSyncRunner } from '@/providers/CloudSyncRunner';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { DevelopmentSyncSheet } from '../DevelopmentSyncSheet';
import { rememberLastSyncResult } from '../sync-status';

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

function openDatabase({ bound }: { readonly bound: boolean }): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, createTestSeed);
  if (bound) bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  return database;
}

/** The sheet under the REAL runner (live session, bound Business) and a contract-faithful remote. */
async function renderWithRunner(database: SourisDatabase, remote: FakeSyncRemote) {
  const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
  const view = await render(
    <TestPersistenceProvider createSeed={createTestSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
          <CloudSyncRunner gateway={remote}>
            <DevelopmentSyncSheet onClose={() => {}} visible />
          </CloudSyncRunner>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

/** The sheet alone: no runner, so no run is possible — only the stored state drives it. */
async function renderAlone(database: SourisDatabase) {
  const view = await render(
    <TestPersistenceProvider createSeed={createTestSeed} database={database}>
      <DevelopmentSyncSheet onClose={() => {}} visible />
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
const isDisabled = (view: View, testID: string) =>
  view.getByTestId(testID).props.accessibilityState?.disabled === true;

describe('DevelopmentSyncSheet', () => {
  beforeEach(() => {
    rememberLastSyncResult(undefined);
  });

  it('shows the bound Business, the bootstrap state and the outbox of the automatic first sync, and "Run sync now" runs the same orchestration', async () => {
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const view = await renderWithRunner(database, remote);
    // The runner uploaded the local data on its own at launch (V1D.1).
    await waitFor(() => expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6));
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    await press(view, 'development-sync-refresh');

    expect(text(view, 'development-sync-business')).toBe('Maison Léa');
    expect(text(view, 'development-sync-business-id')).toBe(REMOTE_BUSINESS_ID);
    expect(text(view, 'development-sync-state')).toBe('INITIAL_UPLOAD');
    expect(text(view, 'development-sync-approval')).toBe('aucune en attente');
    expect(text(view, 'development-sync-outbox')).toBe('0 en attente · 0 en échec · 6 acquittés');

    const pushedBefore = remote.requests.length;
    await press(view, 'development-sync-run');
    await waitFor(() =>
      expect(text(view, 'development-sync-result')).toMatch(
        /^PUSHED · INITIAL_UPLOAD · enqueued 0 · pushed 0 · failed 0 · conflicts 0 · pull fetched \d+ · applied 0 · deleted 0/,
      ),
    );
    expect(remote.requests).toHaveLength(pushedBefore);
  });

  it.each<SyncBootstrapDecision | undefined>([
    undefined,
    'EMPTY',
    'INITIAL_UPLOAD_REQUIRES_APPROVAL',
    'INITIAL_UPLOAD',
    'ALREADY_SYNCED',
    'RESTORE_REQUIRED',
    'RECONCILIATION_REQUIRED',
  ])('displays state %s and offers no approval action at all', async (decision) => {
    const database = openDatabase({ bound: true });
    if (decision) {
      writeSyncBootstrapRecord(database, { businessId: REMOTE_BUSINESS_ID, decision, decidedAt: new Date() });
    }
    const view = await renderAlone(database);

    // This database holds data and no acknowledged state, so a stored EMPTY / ALREADY_SYNCED reads as stale.
    const stale = decision === 'EMPTY' || decision === 'ALREADY_SYNCED';
    expect(text(view, 'development-sync-state')).toBe(
      decision === undefined ? 'NON CLASSÉ (lancer une sync)' : stale ? `${decision} (périmé — lancer une sync)` : decision,
    );
    expect(view.queryByTestId('development-sync-approve')).toBeNull();
    expect(view.queryByTestId('development-sync-approve-restore')).toBeNull();
    // No runner in this tree: a run is not possible either.
    expect(isDisabled(view, 'development-sync-run')).toBe(true);
    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
  });

  it('restore: shows an automatic restore that failed as pending, and "Run sync now" retries it and rebuilds SQLite', async () => {
    // Another device uploaded the Business…
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = openDatabase({ bound: true });
    expect(approveInitialUpload(source, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
    await createSyncPushWorker({ database: source, gateway: remote }).run(REMOTE_BUSINESS_ID);
    expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
    remote.clearRequests();

    // …and this one is a fresh install bound to it, whose first restore attempt hits a dead network.
    remote.beforePull(() => {
      throw new SyncRemoteError('NETWORK');
    });
    const database = openTestDatabase();
    bootstrapPersistence(database, emptySeed);
    bindLocalDatabaseToBusiness(database, createRemoteBusiness());
    const view = await renderWithRunner(database, remote);
    await waitFor(() => expect(remote.pulls).toHaveLength(1));
    await press(view, 'development-sync-refresh');

    expect(text(view, 'development-sync-state')).toBe('RESTORE_REQUIRED');
    expect(text(view, 'development-sync-restore')).toContain('APPROUVÉE');
    expect(loadSnapshot(database).clients).toEqual([]);

    remote.beforePull(undefined);
    await press(view, 'development-sync-run');
    await waitFor(() => expect(loadSnapshot(database).clients).toHaveLength(1));
    const restored = loadSnapshot(database);
    expect([restored.services.length, restored.products.length, restored.appointments.length]).toEqual([2, 2, 1]);
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();

    // The restore remounted the tree (this sheet included): the state and the result line survive it.
    await waitFor(() => expect(text(view, 'development-sync-state')).toBe('ALREADY_SYNCED'));
    expect(text(view, 'development-sync-result')).toBe(
      'RESTORED · clients 1 · services 2 · products 2 · appointments 1 · sales 0 · calendar blocks 0 · tombstones 0',
    );
    expect(text(view, 'development-sync-restore')).toBe('aucune en attente');
    expect(text(view, 'development-sync-outbox')).toBe('0 en attente · 0 en échec · 6 acquittés');
    expect(text(view, 'development-sync-pull-cursor')).toMatch(/^2026-/);
  });

  it('offers nothing on an unbound database', async () => {
    const view = await renderAlone(openDatabase({ bound: false }));
    expect(text(view, 'development-sync-business')).toBe('Aucun (base non liée)');
    expect(isDisabled(view, 'development-sync-run')).toBe(true);
  });

  it('renders nothing outside __DEV__', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const view = await renderAlone(openDatabase({ bound: true }));
      expect(view.queryByTestId('development-sync-sheet')).toBeNull();
      expect(view.queryByTestId('development-sync-run')).toBeNull();
    } finally {
      flags.__DEV__ = true;
    }
  });
});
