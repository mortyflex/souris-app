import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import {
  createFakeBusinessGateway,
  createRemoteBusiness,
  REMOTE_BUSINESS_ID,
} from '@/features/business/testing/fake-business-gateway';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { readMetadata } from '@/persistence/metadata';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import {
  approveInitialUpload,
  readInitialUploadApproval,
  SYNC_INITIAL_UPLOAD_APPROVAL_KEY,
  writeSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { CloudSyncRunner } from '@/providers/CloudSyncRunner';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { DevelopmentSyncSheet } from '../DevelopmentSyncSheet';

// The REAL approval, observable: the control must call exactly this function.
jest.mock('@/persistence/sync/bootstrap', () => {
  const actual = jest.requireActual<typeof import('@/persistence/sync/bootstrap')>('@/persistence/sync/bootstrap');
  return { ...actual, approveInitialUpload: jest.fn(actual.approveInitialUpload) };
});

const approveSpy = jest.mocked(approveInitialUpload);

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
        'PUSHED · INITIAL_UPLOAD · enqueued 6 · pushed 6 · failed 0 · conflicts 0',
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
      expect(view.queryByTestId('development-sync-run')).toBeNull();
    } finally {
      flags.__DEV__ = true;
    }
  });
});
