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
import { readMetadata } from '@/persistence/metadata';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import {
  approveInitialRestore,
  approveInitialUpload,
  readInitialRestoreApproval,
  readInitialUploadApproval,
  readSyncBootstrapRecord,
  SYNC_INITIAL_UPLOAD_APPROVAL_KEY,
  writeSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createSyncPushWorker } from '@/persistence/sync/push-worker';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { CloudSyncRunner } from '@/providers/CloudSyncRunner';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { DevelopmentSyncSheet } from '../DevelopmentSyncSheet';
import { rememberLastSyncResult } from '../sync-status';

// The REAL approval, observable: the control must call exactly this function.
jest.mock('@/persistence/sync/bootstrap', () => {
  const actual = jest.requireActual<typeof import('@/persistence/sync/bootstrap')>('@/persistence/sync/bootstrap');
  return {
    ...actual,
    approveInitialUpload: jest.fn(actual.approveInitialUpload),
    approveInitialRestore: jest.fn(actual.approveInitialRestore),
  };
});

const approveSpy = jest.mocked(approveInitialUpload);
const approveRestoreSpy = jest.mocked(approveInitialRestore);

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
    approveSpy.mockClear();
    approveRestoreSpy.mockClear();
    rememberLastSyncResult(undefined);
  });

  it('shows the bound Business, the bootstrap state and the outbox — and neither opening it nor running sync approves anything', async () => {
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const view = await renderWithRunner(database, remote);
    await waitFor(() => expect(remote.countCalls).toBe(1));
    await press(view, 'development-sync-refresh');

    expect(text(view, 'development-sync-business')).toBe('Maison Léa');
    expect(text(view, 'development-sync-business-id')).toBe(REMOTE_BUSINESS_ID);
    expect(text(view, 'development-sync-state')).toBe('INITIAL_UPLOAD_REQUIRES_APPROVAL');
    expect(text(view, 'development-sync-approval')).toBe('aucune en attente');
    expect(text(view, 'development-sync-outbox')).toBe('0 en attente · 0 en échec · 0 acquittés');

    await press(view, 'development-sync-run');
    await waitFor(() =>
      expect(text(view, 'development-sync-result')).toBe('BLOCKED · INITIAL_UPLOAD_REQUIRES_APPROVAL'),
    );

    expect(approveSpy).not.toHaveBeenCalled();
    expect(readMetadata(database, SYNC_INITIAL_UPLOAD_APPROVAL_KEY)).toBeUndefined();
    expect(remote.requests).toEqual([]);
    expect(countSyncOutboxRows(database)).toBe(0);
  });

  it('approves only after the second confirmation, for exactly the bound Business shown, through approveInitialUpload — then "Run sync now" uploads', async () => {
    const database = openDatabase({ bound: true });
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const view = await renderWithRunner(database, remote);
    await waitFor(() => expect(remote.countCalls).toBe(1));
    await press(view, 'development-sync-refresh');
    expect(isDisabled(view, 'development-sync-approve')).toBe(false);

    // First press only ASKS, naming the exact Business.
    await press(view, 'development-sync-approve');
    const body = view.getByText(/seront envoyées vers le Business/).props.children as string;
    expect(body).toContain('« Maison Léa »');
    expect(body).toContain(`(${REMOTE_BUSINESS_ID})`);
    expect(approveSpy).not.toHaveBeenCalled();

    // Cancelling approves nothing.
    await press(view, 'development-sync-approve-cancel');
    expect(approveSpy).not.toHaveBeenCalled();
    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();

    await press(view, 'development-sync-approve');
    await press(view, 'development-sync-approve-confirm');
    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(approveSpy).toHaveBeenCalledWith(database, REMOTE_BUSINESS_ID);
    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)?.businessId).toBe(REMOTE_BUSINESS_ID);
    expect(text(view, 'development-sync-result')).toBe('APPROVAL · APPROVED · run sync to upload');
    expect(text(view, 'development-sync-approval')).toContain('DONNÉE');
    // Approving uploads nothing by itself, and cannot be pressed twice.
    expect(remote.requests).toEqual([]);
    expect(isDisabled(view, 'development-sync-approve')).toBe(true);

    await press(view, 'development-sync-run');
    await waitFor(() =>
      expect(text(view, 'development-sync-result')).toBe(
        // The pull that follows the upload reads the six aggregates back and recognizes every version.
        'PUSHED · INITIAL_UPLOAD · enqueued 6 · pushed 6 · failed 0 · conflicts 0 · pull fetched 6 · applied 0 · deleted 0 · skipped 6 · pull failed 0 · pull conflicts 0 · cursor advanced',
      ),
    );
    expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
    expect(remote.requests.every((request) => request.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    expect(text(view, 'development-sync-state')).toBe('INITIAL_UPLOAD');
    expect(text(view, 'development-sync-outbox')).toBe('0 en attente · 0 en échec · 6 acquittés');
    expect(isDisabled(view, 'development-sync-approve')).toBe(true);
    expect(approveSpy).toHaveBeenCalledTimes(1);
  });

  it.each<SyncBootstrapDecision | undefined>([
    undefined,
    'EMPTY',
    'INITIAL_UPLOAD',
    'ALREADY_SYNCED',
    'RESTORE_REQUIRED',
    'RECONCILIATION_REQUIRED',
  ])('keeps the approval disabled and inert in state %s', async (decision) => {
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
    expect(isDisabled(view, 'development-sync-approve')).toBe(true);
    await press(view, 'development-sync-approve');
    expect(view.queryByTestId('development-sync-approve-confirm')).toBeNull();
    expect(approveSpy).not.toHaveBeenCalled();
    // No runner in this tree: a run is not possible either.
    expect(isDisabled(view, 'development-sync-run')).toBe(true);
  });

  it('restore: shows RESTORE_REQUIRED, approves only after the second confirmation for the Business shown, and "Run sync now" rebuilds SQLite', async () => {
    // Another device uploaded the Business…
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = openDatabase({ bound: true });
    expect(approveInitialUpload(source, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
    await createSyncPushWorker({ database: source, gateway: remote }).run(REMOTE_BUSINESS_ID);
    expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
    approveSpy.mockClear();

    // …and this one is a fresh install bound to it.
    const database = openTestDatabase();
    bootstrapPersistence(database, emptySeed);
    bindLocalDatabaseToBusiness(database, createRemoteBusiness());
    const view = await renderWithRunner(database, remote);
    await waitFor(() => expect(readSyncBootstrapRecord(database, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED'));
    await press(view, 'development-sync-refresh');

    expect(text(view, 'development-sync-state')).toBe('RESTORE_REQUIRED');
    expect(text(view, 'development-sync-restore')).toContain('REQUISE');
    expect(isDisabled(view, 'development-sync-approve')).toBe(true); // never an upload from an empty device
    expect(isDisabled(view, 'development-sync-approve-restore')).toBe(false);

    // Running sync without the approval restores nothing.
    await press(view, 'development-sync-run');
    await waitFor(() => expect(text(view, 'development-sync-result')).toBe('BLOCKED · RESTORE_REQUIRED'));
    expect(loadSnapshot(database).clients).toEqual([]);
    expect(remote.pulls).toEqual([]);

    // First press only ASKS, naming the exact Business; cancelling approves nothing.
    await press(view, 'development-sync-approve-restore');
    const body = view.getByText(/sera reconstruite à partir des données distantes/).props.children as string;
    expect(body).toContain('« Maison Léa »');
    expect(body).toContain(`(${REMOTE_BUSINESS_ID})`);
    await press(view, 'development-sync-approve-cancel');
    expect(approveRestoreSpy).not.toHaveBeenCalled();
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();

    await press(view, 'development-sync-approve-restore');
    await press(view, 'development-sync-approve-confirm');
    expect(approveRestoreSpy).toHaveBeenCalledTimes(1);
    expect(approveRestoreSpy).toHaveBeenCalledWith(database, REMOTE_BUSINESS_ID);
    expect(approveSpy).not.toHaveBeenCalled();
    expect(text(view, 'development-sync-result')).toBe('RESTORE APPROVAL · APPROVED · run sync to restore');
    expect(text(view, 'development-sync-restore')).toContain('APPROUVÉE');
    expect(isDisabled(view, 'development-sync-approve-restore')).toBe(true);
    // Approving restores nothing by itself.
    expect(loadSnapshot(database).clients).toEqual([]);
    expect(remote.pulls).toEqual([]);

    await press(view, 'development-sync-run');
    await waitFor(() => expect(loadSnapshot(database).clients).toHaveLength(1));
    const restored = loadSnapshot(database);
    expect([restored.services.length, restored.products.length, restored.appointments.length]).toEqual([2, 2, 1]);
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(readInitialRestoreApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();

    // The restore remounted the tree (this sheet included): the state and the result line survive it.
    await waitFor(() => expect(text(view, 'development-sync-state')).toBe('ALREADY_SYNCED'));
    expect(text(view, 'development-sync-result')).toBe(
      'RESTORED · clients 1 · services 2 · products 2 · appointments 1 · sales 0 · tombstones 0',
    );
    expect(text(view, 'development-sync-outbox')).toBe('0 en attente · 0 en échec · 6 acquittés');
    expect(text(view, 'development-sync-pull-cursor')).toMatch(/^2026-/);
    expect(isDisabled(view, 'development-sync-approve-restore')).toBe(true);
  });

  it.each<SyncBootstrapDecision | undefined>([
    undefined,
    'EMPTY',
    'INITIAL_UPLOAD_REQUIRES_APPROVAL',
    'INITIAL_UPLOAD',
    'ALREADY_SYNCED',
    'RECONCILIATION_REQUIRED',
  ])('keeps the restore approval disabled and inert in state %s', async (decision) => {
    const database = openDatabase({ bound: true });
    if (decision) {
      writeSyncBootstrapRecord(database, { businessId: REMOTE_BUSINESS_ID, decision, decidedAt: new Date() });
    }
    const view = await renderAlone(database);
    expect(isDisabled(view, 'development-sync-approve-restore')).toBe(true);
    await press(view, 'development-sync-approve-restore');
    expect(view.queryByTestId('development-sync-approve-confirm')).toBeNull();
    expect(approveRestoreSpy).not.toHaveBeenCalled();
  });

  it('offers nothing on an unbound database', async () => {
    const view = await renderAlone(openDatabase({ bound: false }));
    expect(text(view, 'development-sync-business')).toBe('Aucun (base non liée)');
    expect(isDisabled(view, 'development-sync-approve')).toBe(true);
    expect(isDisabled(view, 'development-sync-run')).toBe(true);
  });

  it('refuses at confirmation time when the state changed while the dialog was open', async () => {
    const database = openDatabase({ bound: true });
    writeSyncBootstrapRecord(database, {
      businessId: REMOTE_BUSINESS_ID,
      decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL',
      decidedAt: new Date(),
    });
    const view = await renderAlone(database);
    await press(view, 'development-sync-approve');

    writeSyncBootstrapRecord(database, {
      businessId: REMOTE_BUSINESS_ID,
      decision: 'RECONCILIATION_REQUIRED',
      decidedAt: new Date(),
    });
    await press(view, 'development-sync-approve-confirm');

    expect(approveSpy).not.toHaveBeenCalled();
    expect(text(view, 'development-sync-result')).toBe('APPROVAL · REFUSED · STATE_CHANGED');
    expect(readInitialUploadApproval(database, REMOTE_BUSINESS_ID)).toBeUndefined();
  });

  it('renders nothing outside __DEV__', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const database = openDatabase({ bound: true });
      writeSyncBootstrapRecord(database, {
        businessId: REMOTE_BUSINESS_ID,
        decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL',
        decidedAt: new Date(),
      });
      const view = await renderAlone(database);
      expect(view.queryByTestId('development-sync-sheet')).toBeNull();
      expect(view.queryByTestId('development-sync-approve')).toBeNull();
      expect(view.queryByTestId('development-sync-approve-restore')).toBeNull();
      expect(view.queryByTestId('development-sync-run')).toBeNull();
    } finally {
      flags.__DEV__ = true;
    }
  });
});
