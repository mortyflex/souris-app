// Reactive synchronization: the Caisse that stays open shows a refund another
// device recorded — totals and refund note — through the foreground tick,
// and offers the pull-to-refresh that runs the same exchange on demand.

import { act, waitFor, within } from '@testing-library/react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { SYNC_REFRESH_CONTROL_TEST_ID } from '@/features/sync/SyncRefreshControl';
import { clientLea, createTestSeed, productMask } from '@/persistence/testing/fixtures';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { createRemoteSale, refundOnDevice, SALE_ID, sellOnDevice } from '@/providers/testing/cloud-sync-fixtures';

import { CashRegisterScreen } from '../CashRegisterScreen';

jest.mock('expo-router', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoRouterMock());
jest.mock('expo-symbols', () => jest.requireActual('@/shared/ui/testing/screen-mocks').expoSymbolsMock());
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('@/shared/ui/testing/screen-mocks').safeAreaMock());
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () =>
  jest.requireActual('@/shared/ui/testing/mock-refresh-control'),
);

const seed = () => createTestSeed({ clients: [clientLea], services: [], products: [productMask], appointments: [] });

async function renderCashRegister() {
  const scenario = await renderTwoDevices(
    seed,
    () => (
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <CashRegisterScreen />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    ),
    // Sold 30 minutes ago on device A: 2 × 50 € by card, today.
    { prepare: (db) => sellOnDevice(db, createRemoteSale(30)) },
  );
  const total = () => scenario.view.getByTestId('cash-register-total').props.children as string;
  await waitFor(() => expect(total()).toMatch(/100,00\s€/));
  await waitFor(() => expect(scenario.remote.pulls.length).toBeGreaterThan(0));
  return { ...scenario, total };
}

describe('Caisse — remote refund', () => {
  afterEach(() => jest.restoreAllMocks());

  it('updates its totals on the open screen when another device\'s refund arrives with the tick', async () => {
    const { other, tick, total, view } = await renderCashRegister();
    refundOnDevice(other.database, SALE_ID, 1000);
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    expect(total()).toMatch(/100,00\s€/);

    await tick();
    await waitFor(() => expect(total()).toMatch(/90,00\s€/));
    // The refund is listed with the day's operations, as a line of its own.
    expect(within(view.getByTestId('cash-register-entries')).getByText(/Remboursement/)).toBeTruthy();
  });

  it('pull-to-refresh runs the exchange now: the refund is on the screen when the indicator retracts', async () => {
    const { other, remote, total, view } = await renderCashRegister();
    refundOnDevice(other.database, SALE_ID, 2500);
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    const pullsBefore = remote.pulls.length;

    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    await act(async () => {
      control().props.onRefresh();
    });
    await waitFor(() => expect(control().props.refreshing).toBe(false));
    expect(remote.pulls).toHaveLength(pullsBefore + 1);
    expect(total()).toMatch(/75,00\s€/);
  });

  it('refreshing again and again creates no duplicate adjustment and moves no stock', async () => {
    const { other, remote, tick, total, view, database } = await renderCashRegister();
    refundOnDevice(other.database, SALE_ID, 1000);
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    const control = () => view.getByTestId(SYNC_REFRESH_CONTROL_TEST_ID);
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        control().props.onRefresh();
      });
      await waitFor(() => expect(control().props.refreshing).toBe(false));
    }
    await tick();
    await tick();
    expect(total()).toMatch(/90,00\s€/);
    const count = (sql: string) => (database.getFirstSync<{ readonly n: number }>(sql)?.n ?? -1);
    expect(count('SELECT COUNT(*) AS n FROM sale_adjustments')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM sales')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM sync_outbox')).toBe(0);
    expect(database.getFirstSync('SELECT stock_quantity FROM products WHERE id = ?', [productMask.id])).toEqual({ stock_quantity: 3 });
    const remoteRows = remote.list('8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f');
    expect(remoteRows.filter((row) => row.key.startsWith('SALE_ADJUSTMENT/'))).toHaveLength(1);
    expect(remoteRows.filter((row) => row.key.startsWith('SALE/'))).toHaveLength(1);
    expect(remoteRows.find((row) => row.key === `PRODUCT/${productMask.id}`)?.payload).toMatchObject({ stock_quantity: 3 });
  });
});
