// Reactive synchronization: a refund's status with the server — « Pas encore
// synchronisé », « Synchronisé », « Refusé par le serveur » — changes on the
// Sale detail that stays open, within the run that settled it. Two devices,
// one remote, the application's own stack and triggers.

import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { SyncRemoteError } from '@/persistence/sync/remote-gateway';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { clientLea, createTestSeed, productMask } from '@/persistence/testing/fixtures';
import { renderTwoDevices } from '@/providers/testing/cloud-sync-harness';
import { createRemoteSale, refundOnDevice, SALE_ID, sellOnDevice } from '@/providers/testing/cloud-sync-fixtures';

import { SaleDetailScreen } from '../../history/SaleDetailScreen';
import { SALE_ADJUSTMENT_REFUSED_COPY, SALE_REFUND_REFUSAL_QUESTION } from '../presentation';

/** The summary line of the detail says only what waits or needs a decision; a synchronized record says nothing. */
const PENDING_NOTE = 'Pas encore synchronisé';
const REFUSED_NOTE = 'Refusé par le serveur : à vérifier';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

let mounts = 0;

/** This device's own 10 € refund, through the session exactly as the refund flow records it. */
function RefundHere() {
  const { recordSaleAdjustment } = useSaleSession();
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <Pressable
      testID="refund-here"
      onPress={() =>
        recordSaleAdjustment(SALE_ID, {
          id: 'refund-here',
          reason: 'CUSTOMER_REFUND',
          lines: [],
          refundCardCents: 1000,
          refundCashCents: 0,
          settlement: 'SETTLED',
          refundedAt: new Date(),
        })
      }
    />
  );
}

const seed = () => createTestSeed({ clients: [clientLea], services: [], products: [productMask], appointments: [] });

async function renderDetail() {
  const scenario = await renderTwoDevices(
    seed,
    () => (
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <SaleDetailScreen saleId={SALE_ID} />
              <RefundHere />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    ),
    { prepare: (db) => sellOnDevice(db, createRemoteSale(30)) },
  );
  // Restored at mount: the Sale A sold is here, and the remote proved it stores adjustments.
  await waitFor(() => expect(scenario.view.getByTestId('sale-detail-screen')).toBeTruthy());
  await waitFor(() => expect(scenario.remote.pulls.length).toBeGreaterThan(0));
  return scenario;
}

describe('refund synchronization status on the open Sale detail', () => {
  beforeEach(() => {
    mounts = 0;
  });
  afterEach(() => jest.restoreAllMocks());

  it('loses its « Pas encore synchronisé » note with the tick that sent it — same mounted screen', async () => {
    const { view, database, remote, tick } = await renderDetail();
    const mountedBefore = mounts;
    await act(async () => {
      fireEvent.press(view.getByTestId('refund-here'));
    });
    expect(view.getByTestId('sale-adjustment-refund-here-sync')).toHaveTextContent(PENDING_NOTE);
    expect(countSyncOutboxRows(database)).toBe(1);

    await tick();
    await waitFor(() => expect(view.queryByTestId('sale-adjustment-refund-here-sync')).toBeNull());
    expect(view.getByTestId('sale-adjustment-refund-here-status')).toHaveTextContent('Remboursement');
    expect(view.queryByTestId('sale-adjustment-refund-here-refused')).toBeNull();
    expect(countSyncOutboxRows(database)).toBe(0);
    expect(remote.find('8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f', 'SALE_ADJUSTMENT', 'refund-here')).toBeDefined();
    expect(mounts).toBe(mountedBefore);
    expect(view.getByTestId('sale-detail-refunded')).toHaveTextContent('Remboursé : 10,00 €');
  });

  it('stays « Pas encore synchronisé » when the remote is unreachable — never worded as synchronized', async () => {
    const { view, database, remote, tick } = await renderDetail();
    await act(async () => {
      fireEvent.press(view.getByTestId('refund-here'));
    });
    remote.failNext(new SyncRemoteError('NETWORK'));
    await tick();
    expect(view.getByTestId('sale-adjustment-refund-here-sync')).toHaveTextContent(PENDING_NOTE);
    expect(countSyncOutboxRows(database)).toBe(1);
  });

  it('shows the server refusal on the open detail: A refunded everything first, this device\'s refund is refused and A\'s arrives', async () => {
    const { view, other, remote, tick } = await renderDetail();
    const mountedBefore = mounts;
    // Device A: the whole Sale given back, pushed. This device knows nothing of it yet.
    refundOnDevice(other.database, SALE_ID, Math.round(productMask.price * 200));
    expect(await other.run()).toMatchObject({ status: 'PUSHED', pushed: 1 });

    await act(async () => {
      fireEvent.press(view.getByTestId('refund-here'));
    });
    expect(view.getByTestId('sale-adjustment-refund-here-sync')).toHaveTextContent(PENDING_NOTE);

    await tick();
    await waitFor(() => expect(view.getByTestId('sale-adjustment-refund-here-refused')).toHaveTextContent(REFUSED_NOTE));
    expect(view.getByText(SALE_ADJUSTMENT_REFUSED_COPY)).toBeTruthy();
    expect(view.getByText(SALE_REFUND_REFUSAL_QUESTION)).toBeTruthy();
    // Nothing was written remotely for it; A's refund was pulled and is on the screen.
    expect(remote.find('8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f', 'SALE_ADJUSTMENT', 'refund-here')).toBeUndefined();
    expect(view.getByTestId('sale-detail-refunded')).toHaveTextContent(/Intégralement remboursée|Remboursé/);
    expect(mounts).toBe(mountedBefore);
  });
});
