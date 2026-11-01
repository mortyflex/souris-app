// The visible answer to a manual refresh that could not synchronize: one
// capsule, one line, for a moment — nothing on success, nothing twice.

import { act, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView, Text } from 'react-native';

import { useClientSession, ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { updateClient } from '@/persistence/stores/clients';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { clientLea, createTestSeed } from '@/persistence/testing/fixtures';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { haptics } from '@/shared/lib/haptics';

import { SYNC_REFRESH_FAILED_COPY, SYNC_REFRESH_OFFLINE_COPY } from '../refresh-outcome';
import { SYNC_REFRESH_CONTROL_TEST_ID, SyncRefreshControl } from '../SyncRefreshControl';
import { SYNC_REFRESH_FEEDBACK_DURATION, SYNC_REFRESH_FEEDBACK_TEST_ID, SyncRefreshFeedback } from '../SyncRefreshFeedback';

jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());

function Names() {
  const { clients } = useClientSession();
  return <Text testID="names">{clients.map((client) => client.firstName).join(',')}</Text>;
}

/** The app's shape: ONE feedback host above the screens, a pullable screen below. */
function App() {
  return (
    <ClientSessionProvider>
      <SyncRefreshFeedback />
      <ScrollView refreshControl={<SyncRefreshControl />}>
        <Names />
      </ScrollView>
    </ClientSessionProvider>
  );
}

const seed = () => createTestSeed({ services: [], products: [], appointments: [] });

/** The capsule is hidden from assistive tech on purpose (the gesture announces the line): RNTL must be told to look. */
const hidden = { includeHiddenElements: true } as const;

describe('SyncRefreshFeedback', () => {
  let warning: jest.SpyInstance;
  let announce: jest.SpyInstance;
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });
  beforeEach(() => {
    warning = jest.spyOn(haptics, 'warning').mockImplementation(() => undefined);
    // The preset's AccessibilityInfo is already a jest.fn: restoring never clears its calls.
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    announce.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => jest.useRealTimers());

  async function pull(view: Awaited<ReturnType<typeof render>>) {
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
  }

  it('offline: « Vérifiez votre connexion » for a moment, hidden from the screen reader that already hears it, then gone', async () => {
    const { view, remote } = await renderTwoDevices(seed, () => <App />);
    await waitFor(() => expect(view.getByTestId('names')).toHaveTextContent('Léa'));
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    expect(view.queryByTestId(SYNC_REFRESH_FEEDBACK_TEST_ID, hidden)).toBeNull();

    remote.failNext(new SyncRemoteError('NETWORK'));
    await pull(view);
    const capsule = view.getByTestId(SYNC_REFRESH_FEEDBACK_TEST_ID, hidden);
    expect(view.getByTestId(`${SYNC_REFRESH_FEEDBACK_TEST_ID}-text`, hidden)).toHaveTextContent(SYNC_REFRESH_OFFLINE_COPY);
    expect(capsule.props.accessibilityElementsHidden).toBe(true);
    expect(capsule.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(announce).toHaveBeenCalledWith(SYNC_REFRESH_OFFLINE_COPY);
    expect(warning).toHaveBeenCalledTimes(1);
    // The screen stays usable and its data is untouched.
    expect(view.getByTestId('names')).toHaveTextContent('Léa');

    await act(async () => {
      jest.advanceTimersByTime(SYNC_REFRESH_FEEDBACK_DURATION + 50);
    });
    expect(view.queryByTestId(SYNC_REFRESH_FEEDBACK_TEST_ID, hidden)).toBeNull();
  });

  it('a server failure that is not the network says « Réessayez »', async () => {
    const { view, remote } = await renderTwoDevices(seed, () => <App />);
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    remote.failNext(new SyncRemoteError('UNKNOWN'));
    await pull(view);
    expect(view.getByTestId(`${SYNC_REFRESH_FEEDBACK_TEST_ID}-text`, hidden)).toHaveTextContent(SYNC_REFRESH_FAILED_COPY);
    expect(announce).toHaveBeenCalledWith(SYNC_REFRESH_FAILED_COPY);
  });

  it('success shows nothing — not even after a run that brought a change', async () => {
    const { view, remote, other } = await renderTwoDevices(seed, () => <App />);
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(other.database, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ pushed: 1 });
    await pull(view);
    expect(view.getByTestId('names')).toHaveTextContent('Léa-Rose');
    expect(view.queryByTestId(SYNC_REFRESH_FEEDBACK_TEST_ID, hidden)).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('several pulls that join one failed run say it once', async () => {
    const { view, remote } = await renderTwoDevices(seed, () => <App />);
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
    remote.failNext(new SyncRemoteError('NETWORK'));
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
      control().props.onRefresh();
      control().props.onRefresh();
    });
    await act(async () => release());
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(view.getAllByTestId(SYNC_REFRESH_FEEDBACK_TEST_ID, hidden)).toHaveLength(1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('Demo mode (no runner at all): the pull retracts and shows NO error — nothing synchronizes there by design', async () => {
    const view = await render(
      <TestPersistenceProvider createSeed={seed}>
        <App />
      </TestPersistenceProvider>,
    );
    await pull(view);
    expect(view.queryByTestId(SYNC_REFRESH_FEEDBACK_TEST_ID, hidden)).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    view.unmount();
  });
});
