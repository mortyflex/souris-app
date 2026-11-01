// BeautIzzy — two-device cloud sync harness for screen tests (never imported by app code)
//
// Reproduces, in memory, what the Staging multi-device tests observe: ONE
// remote (the fake sync remote), a device "A" that already uploaded the
// Business (a bare worker on its own SQLite), and THIS device — an empty,
// bound SQLite under the REAL application stack: PersistenceProvider → Auth
// (live) → Business session → CloudSyncRunner → the session providers and the
// screen a test mounts. The first run restores the Business on its own; the
// foreground tick and the manual refresh are the application's own triggers,
// captured here so a test fires them by hand.

import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

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
import type { FirstRunSeed } from '@/persistence/seed';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { approveInitialUpload } from '@/persistence/sync/bootstrap';
import { createSyncPushWorker, type SyncRunResult } from '@/persistence/sync/push-worker';
import { createFakeSyncRemote, type FakeSyncRemote } from '@/persistence/testing/fake-sync-remote';
import { createTestSeed } from '@/persistence/testing/fixtures';
import type { MemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { CloudSyncRunner, SYNC_FOREGROUND_TICK_MS } from '../CloudSyncRunner';
import { TestPersistenceProvider } from './TestPersistenceProvider';

export { REMOTE_BUSINESS_ID };

export const emptySeed = (): FirstRunSeed =>
  createTestSeed({ clients: [], services: [], products: [], appointments: [] });

export interface OtherDevice {
  readonly database: SourisDatabase;
  /** One full run of that device's worker: pushes its outbox, then pulls. */
  readonly run: () => Promise<SyncRunResult>;
}

/** Device A: holds `seed`, bound to the Business, uploaded to `remote` (approval given by hand, as a bare worker needs). */
export async function createOtherDevice(
  remote: FakeSyncRemote,
  seed: () => FirstRunSeed,
  prepare?: (database: SourisDatabase) => void,
): Promise<OtherDevice> {
  const database = openTestDatabase();
  bootstrapPersistence(database, seed);
  bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  prepare?.(database);
  expect(approveInitialUpload(database, REMOTE_BUSINESS_ID).status).toBe('APPROVED');
  const worker = createSyncPushWorker({ database, gateway: remote });
  const first = await worker.run(REMOTE_BUSINESS_ID);
  expect(first.status).toBe('PUSHED');
  return { database, run: () => worker.run(REMOTE_BUSINESS_ID) };
}

/** THIS device: empty, bound to the same Business — restored by the runner at mount. */
export function openThisDevice(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, emptySeed);
  bindLocalDatabaseToBusiness(database, createRemoteBusiness());
  return database;
}

export interface SyncTriggers {
  appState?: (state: AppStateStatus) => void;
  tick?: () => void;
}

/** The AppState listener and the 2-minute tick of the runner, captured so a test fires them by hand. */
export function captureSyncTriggers(): SyncTriggers {
  const triggers: SyncTriggers = {};
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

interface CloudSyncStackProps {
  readonly database: SourisDatabase;
  readonly remote: FakeSyncRemote;
  readonly files?: MemoryLocalFiles;
  readonly children: ReactNode;
}

/** The application stack above the session providers, with a LIVE session bound to the remote Business. */
export function CloudSyncStack({ database, remote, files, children }: CloudSyncStackProps) {
  return (
    <TestPersistenceProvider
      business={createRemoteBusiness()}
      createSeed={emptySeed}
      database={database}
      files={files}
    >
      <AuthProvider
        gateway={createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) })}
      >
        <BusinessSessionProvider gateway={createFakeBusinessGateway([createRemoteBusiness()])}>
          <CloudSyncRunner gateway={remote}>{children}</CloudSyncRunner>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>
  );
}

export interface TwoDeviceScenario {
  readonly remote: FakeSyncRemote;
  readonly other: OtherDevice;
  readonly database: SourisDatabase;
  readonly triggers: SyncTriggers;
  readonly view: Awaited<ReturnType<typeof render>>;
  /** The runner's foreground tick, as the application fires it every two minutes. */
  readonly tick: () => Promise<void>;
}

/**
 * Device A uploads `seed`; this device mounts `screen` under the stack and is
 * restored by the runner's first run (awaited: the screen then shows A's data).
 */
export async function renderTwoDevices(
  seed: () => FirstRunSeed,
  screen: (database: SourisDatabase) => ReactNode,
  options: { readonly files?: MemoryLocalFiles; readonly prepare?: (database: SourisDatabase) => void } = {},
): Promise<TwoDeviceScenario> {
  const triggers = captureSyncTriggers();
  const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
  const other = await createOtherDevice(remote, seed, options.prepare);
  const database = openThisDevice();
  const view = await render(
    <CloudSyncStack database={database} files={options.files} remote={remote}>
      {screen(database)}
    </CloudSyncStack>,
  );
  await act(async () => {});
  const tick = async () => {
    await act(async () => {
      triggers.tick?.();
    });
    await act(async () => {});
  };
  return { remote, other, database, triggers, view, tick };
}

export const createFakeRemote = () => createFakeSyncRemote([REMOTE_BUSINESS_ID]);
