// Reactive synchronization: the Produits list that stays open shows the stock
// another device sold or restocked; the pull gesture works on the list and on
// an empty catalog alike.

import { act, waitFor, within } from '@testing-library/react-native';

import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { SYNC_REFRESH_CONTROL_TEST_ID } from '@/features/sync/SyncRefreshControl';
import { BusinessMediaProvider } from '@/providers/BusinessMediaProvider';
import { createFakeBusinessMediaRemote } from '@/persistence/testing/fake-business-media-remote';
import { clientLea, createTestSeed, productMask } from '@/persistence/testing/fixtures';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { createRemoteSale, refundOnDevice, SALE_ID, sellOnDevice } from '@/providers/testing/cloud-sync-fixtures';

import { ProductCatalogScreen } from '../ProductCatalogScreen';

jest.mock('expo-router', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock());
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('expo-image', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoImageMock());
jest.mock('@/shared/ui/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

const { imageUri: _legacy, ...mask } = productMask;
const seed = () => createTestSeed({ clients: [clientLea], services: [], products: [mask], appointments: [] });
const emptyCatalog = () => createTestSeed({ clients: [clientLea], services: [], products: [], appointments: [] });

function renderCatalog(seedFn: () => ReturnType<typeof seed>) {
  const files = createMemoryLocalFiles();
  const media = createFakeBusinessMediaRemote(files);
  return renderTwoDevices(
    seedFn,
    () => (
      <BusinessMediaProvider remote={media}>
        <ClientSessionProvider>
          <ProductCatalogProvider>
            <SaleSessionProvider>
              <ProductCatalogScreen />
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </ClientSessionProvider>
      </BusinessMediaProvider>
    ),
    { files },
  );
}

describe('Produits — remote stock', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the stock another device sold, then gave back, on the open list', async () => {
    const { view, other, tick, remote } = await renderCatalog(seed);
    await waitFor(() => expect(view.getByText('Stock 5')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));

    // Device A sells 2 (its stock 5 → 3), then refunds the Sale: nothing restocked (no lines).
    sellOnDevice(other.database, createRemoteSale(5));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });
    await tick();
    await waitFor(() => expect(view.getByText('Stock 3')).toBeTruthy());

    refundOnDevice(other.database, SALE_ID, 1000);
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    await tick();
    expect(view.getByText('Stock 3')).toBeTruthy();
  });

  it('pull-to-refresh on the list fetches the stock now', async () => {
    const { view, other, remote } = await renderCatalog(seed);
    await waitFor(() => expect(view.getByText('Stock 5')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    sellOnDevice(other.database, createRemoteSale(5));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 2 });

    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(view.getByText('Stock 3')).toBeTruthy();
  });

  it('an empty catalog answers the pull too: a product created elsewhere appears', async () => {
    const { view, other, remote } = await renderCatalog(emptyCatalog);
    await waitFor(() => expect(view.getByTestId('product-catalog-empty')).toBeTruthy());
    await waitFor(() => expect(remote.pulls.length).toBeGreaterThan(0));
    const empty = within(view.getByTestId('product-catalog-empty'));
    expect(empty.getByText('Aucun produit enregistré.')).toBeTruthy();
    const control = () => empty.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    expect(control().props.refreshing).toBe(false);

    const { insertProduct } = jest.requireActual('@/persistence/stores/products') as typeof import('@/persistence/stores/products');
    insertProduct(other.database, { ...mask, businessId: '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f' });
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(view.getByText('Stock 5')).toBeTruthy());
    expect(view.queryByTestId('product-catalog-empty')).toBeNull();
  });
});
