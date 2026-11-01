// Reactive synchronization: the sync revision a push-only run advances, and
// the manual refresh (pull-to-refresh) that joins the run in flight.

import { act, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { useClientSession, ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { loadClients, updateClient } from '@/persistence/stores/clients';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import type { SyncRunResult } from '@/persistence/sync/push-worker';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { clientLea, createTestSeed } from '@/persistence/testing/fixtures';
import { describeSyncRefreshOutcome } from '@/features/sync/refresh-outcome';

import { useCloudSyncRevision } from '../CloudSyncRevision';
import { useCloudSyncControl, type CloudSyncControl } from '../CloudSyncRunner';
import { renderTwoDevices } from '../testing/cloud-sync-harness';

let renders = 0;

/** A screen: the Client session plus the two sync contexts, observed. */
function Probe({ onControl }: { readonly onControl: (control: CloudSyncControl) => void }) {
  const { clients } = useClientSession();
  const revision = useCloudSyncRevision();
  const control = useCloudSyncControl();
  useEffect(() => {
    renders += 1;
  });
  useEffect(() => onControl(control), [control, onControl]);
  return (
    <>
      <Text testID="names">{clients.map((client) => client.firstName).join(',')}</Text>
      <Text testID="revision">{revision}</Text>
    </>
  );
}

async function renderProbe() {
  let control: CloudSyncControl = { runner: false, runNow: undefined, refreshNow: undefined, firstSync: { status: 'ready', retrying: false } };
  const scenario = await renderTwoDevices(
    () => createTestSeed({ services: [], products: [], appointments: [] }),
    () => (
      <ClientSessionProvider>
        <Probe
          onControl={(next) => {
            control = next;
          }}
        />
      </ClientSessionProvider>
    ),
  );
  await waitFor(() => expect(scenario.view.getByTestId('names')).toHaveTextContent('Léa'));
  const revision = () => Number(scenario.view.getByTestId('revision').props.children);
  const refresh = async () => {
    let result: SyncRunResult | undefined;
    await act(async () => {
      result = await control.refreshNow?.();
    });
    return result;
  };
  return { ...scenario, control: () => control, revision, refresh };
}

describe('sync revision', () => {
  afterEach(() => jest.restoreAllMocks());

  it('advances after a push-only run (a local write sent) and stays put after an idle run', async () => {
    const { database, revision, tick, view } = await renderProbe();
    // The restore at mount advanced it once; from here every idle tick leaves it alone.
    await waitFor(() => expect(revision()).toBeGreaterThanOrEqual(1));
    const settled = revision();
    await tick();
    expect(revision()).toBe(settled);
    const rendersBefore = renders;
    await tick();
    expect(revision()).toBe(settled);
    expect(renders).toBe(rendersBefore);

    // A local write: sent by the next tick — no operational row changes, yet the bookkeeping did.
    updateClient(database, { ...clientLea, phone: '07 00 00 00 00' });
    expect(countSyncOutboxRows(database)).toBe(1);
    await tick();
    await waitFor(() => expect(countSyncOutboxRows(database)).toBe(0));
    expect(revision()).toBe(settled + 1);
    expect(view.getByTestId('names')).toHaveTextContent('Léa');
  });
});

describe('manual refresh (pull-to-refresh)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('runs a REAL synchronization: another device\'s change is on the screen when the refresh resolves', async () => {
    const { other, remote, refresh, view } = await renderProbe();
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(other.database, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    const pullsBefore = remote.pulls.length;

    const result = await refresh();
    expect(describeSyncRefreshOutcome(result)).toBe('SYNCED');
    expect(remote.pulls).toHaveLength(pullsBefore + 1);
    expect(view.getByTestId('names')).toHaveTextContent('Léa-Rose');
  });

  it('joins the run in flight: three quick pulls make ONE request and resolve with its result', async () => {
    const { control, remote, refresh } = await renderProbe();
    await waitFor(() => expect(control().refreshNow).toBeDefined());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pull = remote.pullBusinessAggregates.bind(remote);
    (remote as { pullBusinessAggregates: typeof pull }).pullBusinessAggregates = async (...args) => {
      await gate;
      return pull(...args);
    };
    const pullsBefore = remote.pulls.length;
    let first!: Promise<SyncRunResult>;
    let second!: Promise<SyncRunResult>;
    let third!: Promise<SyncRunResult>;
    await act(async () => {
      first = control().refreshNow!();
      second = control().refreshNow!();
      third = control().refreshNow!();
      // The runner's plain trigger still answers ALREADY_RUNNING: the refresh is what joins.
      await expect(control().runNow!()).resolves.toEqual({ status: 'SKIPPED', reason: 'ALREADY_RUNNING' });
    });
    let results!: readonly SyncRunResult[];
    await act(async () => {
      release();
      results = await Promise.all([first, second, third]);
    });
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
    expect(results[0].status).toBe('PUSHED');
    expect(remote.pulls).toHaveLength(pullsBefore + 1);

    // Once it ended, a new pull is a new run.
    await refresh();
    expect(remote.pulls).toHaveLength(pullsBefore + 2);
  });

  it('offline: the refresh fails plainly, the pending local write stays intact, the next refresh sends it', async () => {
    const { database, remote, refresh, view } = await renderProbe();
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(database, { ...clientLea, phone: '07 00 00 00 00' });
    expect(countSyncOutboxRows(database)).toBe(1);

    remote.failNext(new SyncRemoteError('NETWORK'));
    const failed = await refresh();
    expect(describeSyncRefreshOutcome(failed)).toBe('OFFLINE');
    expect(countSyncOutboxRows(database)).toBe(1);
    expect(loadClients(database).find((client) => client.id === clientLea.id)?.phone).toBe('07 00 00 00 00');
    expect(remote.find(scenarioBusinessId(), 'CLIENT', clientLea.id)?.payload).not.toMatchObject({ phone: '07 00 00 00 00' });
    expect(view.getByTestId('names')).toHaveTextContent('Léa');

    const ok = await refresh();
    expect(describeSyncRefreshOutcome(ok)).toBe('SYNCED');
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(remote.find(scenarioBusinessId(), 'CLIENT', clientLea.id)?.payload).toMatchObject({ phone: '07 00 00 00 00' });
  });
});

function scenarioBusinessId(): string {
  return '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f';
}
