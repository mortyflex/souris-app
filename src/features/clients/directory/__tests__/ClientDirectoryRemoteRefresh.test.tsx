// Reactive synchronization: the Clientes directory that stays open shows the
// client another device renamed or created; the pull gesture runs the exchange
// now, works on an empty directory, and fails plainly offline.

import { act, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { SYNC_REFRESH_CONTROL_TEST_ID } from '@/features/sync/SyncRefreshControl';
import { SYNC_REFRESH_OFFLINE_COPY } from '@/features/sync/refresh-outcome';
import { insertClient, updateClient } from '@/persistence/stores/clients';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { clientLea, createTestSeed } from '@/persistence/testing/fixtures';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { haptics } from '@/shared/lib/haptics';

import { ClientSessionProvider } from '../../session/ClientSessionProvider';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';

jest.mock('expo-router', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock());
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: () => null }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

const seed = () => createTestSeed({ clients: [clientLea], services: [], products: [], appointments: [] });
const noClients = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

const renderDirectory = (seedFn: () => ReturnType<typeof seed>) =>
  renderTwoDevices(seedFn, () => (
    <ClientSessionProvider>
      <ClientDirectoryScreen />
    </ClientSessionProvider>
  ));

describe('Clientes — remote changes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows a rename from another device on the open directory with the tick', async () => {
    const { view, other, tick, remote } = await renderDirectory(seed);
    await waitFor(() => expect(view.getByText(/Léa/)).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(other.database, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ pushed: 1 });
    await tick();
    await waitFor(() => expect(view.getByText(/Léa-Rose/)).toBeTruthy());
  });

  it('pull-to-refresh runs the exchange now, and says plainly when the remote cannot be reached', async () => {
    const warning = jest.spyOn(haptics, 'warning').mockImplementation(() => undefined);
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const { view, other, remote } = await renderDirectory(seed);
    await waitFor(() => expect(view.getByText(/Léa/)).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    updateClient(other.database, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await other.run()).toMatchObject({ pushed: 1 });

    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    remote.failNext(new SyncRemoteError('NETWORK'));
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(view.queryByText(/Léa-Rose/)).toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(SYNC_REFRESH_OFFLINE_COPY);

    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(view.getByText(/Léa-Rose/)).toBeTruthy());
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('an empty directory keeps its empty state and answers the pull: the first client created elsewhere appears', async () => {
    const { view, other, remote } = await renderDirectory(noClients);
    await waitFor(() => expect(view.getByText('Aucun client')).toBeTruthy());
    // Both sides empty: the first run counted the remote (EMPTY), there was nothing to pull.
    await waitFor(() => expect(remote.countCalls).toBeGreaterThan(0));
    expect(remote.pulls).toHaveLength(0);
    expect(view.getByTestId('client-directory-empty-import')).toBeTruthy();
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);

    insertClient(other.database, clientLea);
    expect(await other.run()).toMatchObject({ pushed: 1 });
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(view.getByText(/Léa/)).toBeTruthy());
    expect(view.queryByText('Aucun client')).toBeNull();
    expect(within(view.getByTestId('client-group-active')).getByText('1')).toBeTruthy();
  });
});
