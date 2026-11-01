// Reactive synchronization on Accueil: the pull gesture runs a real exchange
// and the day's collection follows; the automatic tick updates the open Home
// without any gesture; nothing advertises the gesture when idle.

import { act, waitFor } from '@testing-library/react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { SYNC_REFRESH_CONTROL_TEST_ID, SYNC_REFRESH_LABEL } from '@/features/sync/SyncRefreshControl';
import { clientLea, createTestSeed, productMask, serviceCut } from '@/persistence/testing/fixtures';
import { createRemoteSale, refundOnDevice, SALE_ID, sellOnDevice } from '@/providers/testing/cloud-sync-fixtures';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { formatCompactEuroCents } from '@/shared/lib/money';

import { HomeScreen } from '../HomeScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock(),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('expo-image', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoImageMock());
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: () => null }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

const seed = () => createTestSeed({ clients: [clientLea], services: [serviceCut], products: [productMask], appointments: [] });

const renderHome = () =>
  renderTwoDevices(seed, () => (
    <ClientSessionProvider>
      <AppointmentSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <CalendarBlockSessionProvider>
              <HomeScreen />
            </CalendarBlockSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </AppointmentSessionProvider>
    </ClientSessionProvider>
  ));

const collected = (view: Awaited<ReturnType<typeof renderHome>>['view']) =>
  view.getByTestId('home-stat-collected').props.children as string;

describe('Accueil — pull-to-refresh and automatic updates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('carries the native control, named for assistive tech, and advertises nothing when idle', async () => {
    const { view, remote } = await renderHome();
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    const control = view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    expect(control.props.accessibilityLabel).toBe(SYNC_REFRESH_LABEL);
    expect(control.props.refreshing).toBe(false);
    expect(view.queryByText(/Tirez|actualiser|synchronis/i)).toBeNull();
  });

  it('pull-to-refresh runs a real exchange: the sale another device made is in « Encaissements du jour » when the indicator retracts', async () => {
    const { view, other, remote } = await renderHome();
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    expect(collected(view)).toBe(formatCompactEuroCents(0));
    sellOnDevice(other.database, createRemoteSale(20));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });
    const pullsBefore = remote.pulls.length;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pull = remote.pullBusinessAggregates.bind(remote);
    (remote as { pullBusinessAggregates: typeof pull }).pullBusinessAggregates = async (...args) => {
      await gate;
      return pull(...args);
    };
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    // The indicator stays up for the whole run, and the figure has not moved yet.
    expect(control().props.refreshing).toBe(true);
    expect(collected(view)).toBe(formatCompactEuroCents(0));
    await act(async () => release());
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(collected(view)).toBe(formatCompactEuroCents(10000));
    expect(remote.pulls).toHaveLength(pullsBefore + 1);
  });

  it('the open Home follows the automatic tick: a remote sale, then its refund, without any gesture', async () => {
    const { view, other, remote, tick } = await renderHome();
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    sellOnDevice(other.database, createRemoteSale(20));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });
    await tick();
    await waitFor(() => expect(collected(view)).toBe(formatCompactEuroCents(10000)));

    refundOnDevice(other.database, SALE_ID, 1500);
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    await tick();
    await waitFor(() => expect(collected(view)).toBe(formatCompactEuroCents(8500)));
    expect(view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID).props.refreshing).toBe(false);
  });
});
