// Client purchases are actionable exactly like the Caisse « Produits vendus »:
// the row opens THE Sale detail, a swipe reveals « Actions » that opens THE
// « Actions de la vente » drawer, and every status reads the SAME refund
// summary as the Sale detail — a voided entry never counts, an additional
// refund always does.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Text } from 'react-native';

import type { Product } from '@/domain/products';
import type { SaleDraft } from '@/domain/sales';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { SaleDetailScreen } from '@/features/sales/history/SaleDetailScreen';
import { SalesHistoryScreen } from '@/features/sales/history/SalesHistoryScreen';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import type { SourisDatabase } from '@/persistence/database';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { ClientPurchaseHistoryScreen } from '../ClientPurchaseHistoryScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The preset Modal mock never reports dismissal; this one mirrors the iOS contract
// (onDismiss once `visible` has dropped), so the drawer opens its flow as on device.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  interface MockModalProps {
    readonly visible?: boolean;
    readonly onDismiss?: () => void;
    readonly children?: React.ReactNode;
  }
  class MockModal extends React.Component<MockModalProps> {
    componentDidUpdate(previous: MockModalProps) {
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
    }
    render() {
      return this.props.visible ? React.createElement(View, null, this.props.children) : null;
    }
  }
  return { __esModule: true, default: MockModal };
});
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

const [, client] = createInitialClients();
const now = new Date(2026, 9, 31, 15, 6);
const products: readonly Product[] = [
  { id: 'p-shampoo', businessId: testBusiness.id, name: 'Shampooing', price: 18, stockQuantity: 5, active: true },
  { id: 'p-care', businessId: testBusiness.id, name: 'Soin', price: 10, stockQuantity: 5, active: true },
];

/** 1 × Shampooing, 18 € by card. */
const sale: SaleDraft = {
  id: 'sale-s3',
  businessId: testBusiness.id,
  clientId: client.id,
  completedAt: new Date(2026, 9, 31, 14, 58),
  lines: [{ id: 'sale-s3-1', productId: 'p-shampoo', quantity: 1 }],
  payment: { cardAmountCents: 1800, cashAmountCents: 0 },
};

/** ONE transaction of three units: 1 × Shampooing + 2 × Soin, 38 € by card and cash. */
const multiSale: SaleDraft = {
  id: 'sale-multi',
  businessId: testBusiness.id,
  clientId: client.id,
  completedAt: new Date(2026, 9, 30, 11, 0),
  lines: [
    { id: 'sale-multi-1', productId: 'p-shampoo', quantity: 1 },
    { id: 'sale-multi-2', productId: 'p-care', quantity: 2 },
  ],
  payment: { cardAmountCents: 3000, cashAmountCents: 800 },
};

const refund = (id: string, cents: number, minute: number) => ({
  id,
  reason: 'CUSTOMER_REFUND' as const,
  lines: [],
  refundCardCents: cents,
  refundCashCents: 0,
  settlement: 'SETTLED' as const,
  refundedAt: new Date(2026, 9, 31, 15, minute),
});

function Seed({ database }: { readonly database: SourisDatabase }) {
  const { addProduct } = useProductCatalog();
  const { completeSale, recordSaleAdjustment, recordSaleRefundOutflow, voidSaleAdjustment, saleAdjustments } =
    useSaleSession();
  return (
    <>
      <Pressable
        testID="seed-products"
        onPress={() => {
          bindLocalDatabaseToBusiness(database, testBusiness);
          products.forEach((product) => addProduct(product));
        }}
      />
      <Pressable
        testID="seed-sales"
        onPress={() => {
          completeSale(multiSale);
          completeSale(sale);
        }}
      />
      <Pressable testID="seed-refund-a" onPress={() => recordSaleAdjustment('sale-s3', refund('refund-a', 1200, 0))} />
      <Pressable testID="seed-refund-full" onPress={() => recordSaleAdjustment('sale-s3', refund('refund-full', 1800, 0))} />
      <Pressable testID="seed-refund-b" onPress={() => recordSaleAdjustment('sale-s3', refund('refund-b', 1000, 3))} />
      <Pressable
        testID="seed-refusal"
        onPress={() =>
          database.runSync(
            "UPDATE sync_outbox SET attempt_count = 1, last_error = 'ADJUSTMENT_CONFLICT' WHERE aggregate_type = 'SALE_ADJUSTMENT' AND aggregate_id = 'refund-b'",
          )
        }
      />
      <Pressable testID="seed-money-returned" onPress={() => recordSaleRefundOutflow('refund-b')} />
      <Pressable testID="seed-money-not-returned" onPress={() => voidSaleAdjustment('refund-b')} />
      <Text testID="probe-adjustments">{saleAdjustments.map((adjustment) => `${adjustment.id}:${adjustment.status}`).join(',')}</Text>
    </>
  );
}

function MountAfterSeed({ children }: { readonly children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Pressable testID="mount-screen" onPress={() => setMounted(true)} />
      {mounted && children}
    </>
  );
}

type View = Awaited<ReturnType<typeof render>>;

async function press(view: View, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

async function renderSeeded(screen: ReactNode, steps: readonly string[] = []) {
  const database = openTestDatabase();
  const view = await render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <MountAfterSeed>{screen}</MountAfterSeed>
              <Seed database={database} />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  for (const step of ['seed-products', 'seed-sales', ...steps, 'mount-screen']) {
    await press(view, step);
  }
  return view;
}

const status = (view: View, saleId: string) => view.queryByTestId(`client-sale-status-${saleId}`)?.props.children;

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
});
beforeEach(() => {
  jest.setSystemTime(now);
  mockPush.mockClear();
  mockBack.mockClear();
});
afterAll(() => {
  jest.useRealTimers();
});

const originalOS = Platform.OS;

describe.each(['ios', 'android'] as const)('the complete purchase history on %s', (os) => {
  beforeEach(() => {
    Platform.OS = os;
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('opens THE Sale detail from a row; a swipe only reveals « Actions », whose tap opens THE drawer', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />);
    await press(view, 'client-sale-sale-s3');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/sales/[saleId]', params: { saleId: 'sale-s3' } });

    // A full swipe commits nothing: there is no full-swipe action at all.
    mockPush.mockClear();
    await press(view, 'client-sale-swipe-sale-s3-swipe-full');
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.queryByTestId('sale-actions-sheet')).toBeNull();

    const action = view.getByTestId('client-sale-actions-sale-s3');
    expect(within(action).getByText('Actions')).toBeTruthy();
    await press(view, 'client-sale-actions-sale-s3');
    await settleSheetTransition();
    const sheet = within(view.getByTestId('sale-actions-sheet'));
    expect(['sale-action-refund', 'sale-action-correct', 'sale-action-cancel'].map((id) => sheet.getByTestId(id).props.accessibilityLabel)).toEqual([
      'Rembourser',
      'Corriger une erreur',
      'Rembourser intégralement',
    ]);
    await press(view, 'sale-action-refund');
    await settleSheetTransition();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/adjust/[saleId]', params: { saleId: 'sale-s3', intent: 'refund' } });
    // The gesture and the drawer wrote nothing.
    expect(view.getByTestId('probe-adjustments').props.children).toBe('');
  });

  it('offers the same drawer to VoiceOver / TalkBack from the row itself', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />);
    const container = view.getByTestId('client-sale-swipe-sale-multi-container');
    expect(container.props.accessibilityActions).toEqual([{ name: 'swipeAction', label: 'Actions de la vente' }]);
    await act(async () => {
      fireEvent(container, 'accessibilityAction', { nativeEvent: { actionName: 'swipeAction' } });
    });
    await settleSheetTransition();
    await press(view, 'sale-action-correct');
    await settleSheetTransition();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/adjust/[saleId]', params: { saleId: 'sale-multi', intent: 'correct' } });
  });
});

describe('a multi-product Sale', () => {
  it('stays ONE transaction: one row listing its lines', async () => {
    const history = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />);
    expect(history.getAllByTestId(/^client-sale-sale-(multi|s3)$/)).toHaveLength(2);
    const row = within(history.getByTestId('client-sale-sale-multi'));
    expect(row.getByText('Shampooing + Soin')).toBeTruthy();
    expect(row.getByText('Shampooing ×1')).toBeTruthy();
    expect(row.getByText('Soin ×2')).toBeTruthy();
  });

  it('opens one Sale detail with every product, and leads back to its Client', async () => {
    const detail = await renderSeeded(<SaleDetailScreen saleId="sale-multi" />);
    expect(within(detail.getByTestId('sale-detail-lines')).getAllByTestId(/^sale-detail-line-/)).toHaveLength(2);
    // Back to the Client this Sale belongs to.
    await press(detail, 'sale-detail-client-row');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/clients/[clientId]', params: { clientId: client.id } });
  });
});

describe('refund states of a purchase — the same summary as the Sale detail', () => {
  it('none: no status', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />);
    expect(status(view, 'sale-s3')).toBeUndefined();
  });

  it('partial: « Remboursée en partie », spoken with the row', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />, ['seed-refund-a']);
    expect(status(view, 'sale-s3')).toBe('Remboursée en partie');
    expect(view.getByTestId('client-sale-sale-s3').props.accessibilityLabel).toMatch(/, Remboursée en partie$/);
  });

  it('full: « Remboursée », and « Rembourser intégralement » is no longer offered', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />, ['seed-refund-full']);
    expect(status(view, 'sale-s3')).toBe('Remboursée');
    await press(view, 'client-sale-actions-sale-s3');
    await settleSheetTransition();
    expect(view.queryByTestId('sale-action-cancel')).toBeNull();
    expect(view.queryByTestId('sale-action-refund')).toBeNull();
    expect(view.getByTestId('sale-action-correct')).toBeTruthy();
  });

  it('an additional refund after a refusal counts as money given back', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />, [
      'seed-refund-b',
      'seed-refusal',
      'seed-money-returned',
    ]);
    expect(status(view, 'sale-s3')).toBe('Remboursée en partie');
  });

  it('… and the Caisse says the same (it read « Corrigée » before)', async () => {
    const caisse = await renderSeeded(<SalesHistoryScreen />, ['seed-refund-b', 'seed-refusal', 'seed-money-returned']);
    expect(caisse.getByTestId('sale-history-status-sale-s3').props.children).toBe('Remboursée en partie');
  });

  it('18 € sold, 12 € refunded, 10 € more really returned: « Remboursée »', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />, [
      'seed-refund-b',
      'seed-refusal',
      'seed-money-returned',
      'seed-refund-a',
    ]);
    expect(status(view, 'sale-s3')).toBe('Remboursée');
  });

  it('a voided refusal (money not returned) is never shown as a refund', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />, [
      'seed-refund-b',
      'seed-refusal',
      'seed-money-not-returned',
    ]);
    expect(view.getByTestId('probe-adjustments').props.children).toBe('refund-b:VOIDED');
    expect(status(view, 'sale-s3')).toBeUndefined();
  });

  it('updates the open history when a refund is recorded elsewhere in the session', async () => {
    const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />);
    expect(status(view, 'sale-s3')).toBeUndefined();
    await press(view, 'seed-refund-a');
    expect(status(view, 'sale-s3')).toBe('Remboursée en partie');
  });
});
