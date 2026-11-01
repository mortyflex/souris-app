// Reactive synchronization: the Ventes list that stays open receives another
// device's Sale; the pull gesture lives on the list, the swipe-revealed
// « Actions » still work, an empty day keeps its state and still answers the pull.

import { act, fireEvent, waitFor, within } from '@testing-library/react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { SYNC_REFRESH_CONTROL_TEST_ID } from '@/features/sync/SyncRefreshControl';
import { clientLea, createTestSeed, productMask } from '@/persistence/testing/fixtures';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { createRemoteSale, SALE_ID, sellOnDevice } from '@/providers/testing/cloud-sync-fixtures';

import { SalesHistoryScreen } from '../SalesHistoryScreen';

jest.mock('expo-router', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock());
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

const seed = () => createTestSeed({ clients: [clientLea], services: [], products: [productMask], appointments: [] });

const renderHistory = () =>
  renderTwoDevices(seed, () => (
    <ClientSessionProvider>
      <ProductCatalogProvider>
        <SaleSessionProvider>
          <AppointmentSessionProvider>
            <SalesHistoryScreen />
          </AppointmentSessionProvider>
        </SaleSessionProvider>
      </ProductCatalogProvider>
    </ClientSessionProvider>
  ));

describe('Ventes — remote Sales', () => {
  afterEach(() => jest.restoreAllMocks());

  it('an empty day answers the pull, then lists the Sale another device recorded — with its swipe actions', async () => {
    const { view, other, remote } = await renderHistory();
    await waitFor(() => expect(view.getByTestId('sales-history-empty')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    expect(control().props.refreshing).toBe(false);

    sellOnDevice(other.database, createRemoteSale(10));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(view.getByTestId(`sale-history-row-${SALE_ID}`)).toBeTruthy());
    expect(view.queryByTestId('sales-history-empty')).toBeNull();
    expect(within(view.getByTestId(`sale-history-row-${SALE_ID}`)).getByText(/Léa/)).toBeTruthy();

    // The swipe-revealed « Actions » of the pulled Sale open the shared actions sheet.
    await act(async () => {
      fireEvent.press(view.getByTestId(`sale-history-actions-${SALE_ID}`));
    });
    await waitFor(() => expect(view.getByTestId('sale-actions-sheet')).toBeTruthy());
  });

  it('receives the Sale with the foreground tick while the list stays open', async () => {
    const { view, other, tick, remote } = await renderHistory();
    await waitFor(() => expect(view.getByTestId('sales-history-empty')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    sellOnDevice(other.database, createRemoteSale(10));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });
    await tick();
    await waitFor(() => expect(view.getByTestId(`sale-history-row-${SALE_ID}`)).toBeTruthy());
  });
});
