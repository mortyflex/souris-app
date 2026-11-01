// The ONE pull-to-refresh behaviour: a real run, the indicator for its
// duration, one request for many pulls, plain feedback when nothing could sync.

import { act, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView, Text } from 'react-native';

import { useClientSession, ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { updateClient } from '@/persistence/stores/clients';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { clientLea, createTestSeed } from '@/persistence/testing/fixtures';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { haptics } from '@/shared/lib/haptics';

import { SYNC_REFRESH_OFFLINE_COPY } from '../refresh-outcome';
import { SYNC_REFRESH_CONTROL_TEST_ID, SYNC_REFRESH_LABEL, SyncRefreshControl } from '../SyncRefreshControl';

function Names() {
  const { clients } = useClientSession();
  return <Text testID="names">{clients.map((client) => client.firstName).join(',')}</Text>;
}

function ListScreen() {
  return (
    <ScrollView refreshControl={<SyncRefreshControl />} testID="list">
      <Names />
    </ScrollView>
  );
}

jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

const seed = () => createTestSeed({ services: [], products: [], appointments: [] });

describe('SyncRefreshControl', () => {
  let warning: jest.SpyInstance;
  let announce: jest.SpyInstance;
  beforeEach(() => {
    warning = jest.spyOn(haptics, 'warning').mockImplementation(() => undefined);
    // The preset's AccessibilityInfo is already a jest.fn: restoring never clears its calls.
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    announce.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('is the platform control in the brand accent, named for assistive tech, inside the list', async () => {
    const { view } = await renderTwoDevices(seed, () => (
      <ClientSessionProvider>
        <ListScreen />
      </ClientSessionProvider>
    ));
    const control = view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    expect(control.props.accessibilityLabel).toBe(SYNC_REFRESH_LABEL);
    expect(control.props.refreshing).toBe(false);
    expect(control.props.tintColor).toBe('#7354C7');
    expect(control.props.colors).toEqual(['#7354C7']);
  });

  it('shows the indicator for the whole run, then the other device\'s change — one request for three pulls', async () => {
    const { view, other, remote } = await renderTwoDevices(seed, () => (
      <ClientSessionProvider>
        <ListScreen />
      </ClientSessionProvider>
    ));
    await waitFor(() => expect(view.getByTestId('names')).toHaveTextContent('Léa'));
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(other.database, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ pushed: 1 });

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
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
      control().props.onRefresh();
      control().props.onRefresh();
    });
    expect(control().props.refreshing).toBe(true);
    expect(view.getByTestId('names')).toHaveTextContent('Léa');
    await act(async () => release());
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(view.getByTestId('names')).toHaveTextContent('Léa-Rose');
    expect(remote.pulls).toHaveLength(pullsBefore + 1);
    expect(warning).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('offline: the indicator retracts, one warning haptic and one announcement, local data untouched', async () => {
    const { view, remote, database } = await renderTwoDevices(seed, () => (
      <ClientSessionProvider>
        <ListScreen />
      </ClientSessionProvider>
    ));
    await waitFor(() => expect(view.getByTestId('names')).toHaveTextContent('Léa'));
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(database, { ...clientLea, firstName: 'Léa (brouillon local)' });
    remote.failNext(new SyncRemoteError('NETWORK'));
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(warning).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(SYNC_REFRESH_OFFLINE_COPY);
    // The pending local write is still here, unsent, and still shown.
    expect(database.getFirstSync('SELECT COUNT(*) AS n FROM sync_outbox')).toEqual({ n: 1 });
    expect(database.getFirstSync('SELECT first_name FROM clients WHERE id = ?', [clientLea.id])).toEqual({
      first_name: 'Léa (brouillon local)',
    });
  });

  it('without any runner (the Playground demo): nothing runs and nothing is said — a demo cannot fail to reach a remote', async () => {
    const view = await render(
      <TestPersistenceProvider createSeed={seed}>
        <ClientSessionProvider>
          <ListScreen />
        </ClientSessionProvider>
      </TestPersistenceProvider>,
    );
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(warning).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });
});
