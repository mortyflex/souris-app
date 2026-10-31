import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import type { Product } from '@/domain/products';
import type { SaleDraft } from '@/domain/sales';
import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { reducedMotion } from '@/features/clients/birthday/testing/mock-reanimated';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { SWIPE_HINT_DELAY_MS, SWIPE_HINT_HOLD_MS, SWIPE_HINT_RETURN_MS, SWIPE_HINT_REVEAL_MS } from '@/shared/ui/swipe-to-delete';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { SaleDetailScreen } from '../../history/SaleDetailScreen';
import { SalesHistoryScreen } from '../../history/SalesHistoryScreen';
import { SaleAdjustmentScreen } from '../SaleAdjustmentScreen';
import {
  SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE,
  SALE_ADJUSTMENT_NO_MONEY_NOTE,
  SALE_ADJUSTMENT_NO_TRANSFER_NOTE,
  SALE_ADJUSTMENT_PENDING_NOTE,
} from '../presentation';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The preset Modal mock never reports dismissal; this one mirrors the iOS
// contract (onDismiss once `visible` has dropped), so the « Actions de la vente »
// drawer opens its flow exactly as on device.
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
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const [, client] = createInitialClients();
const now = new Date(2026, 9, 15, 18, 0);

const products: readonly Product[] = [
  { id: 'p-shampoo', businessId: 'fixture-business', name: 'Shampooing', price: 20, stockQuantity: 10, active: true },
  { id: 'p-care', businessId: 'fixture-business', name: 'Soin', price: 18, stockQuantity: 10, active: true },
];

const appointment: Appointment = {
  id: 'appointment-1',
  businessId: 'fixture-business',
  clientId: client.id,
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 9, 15, 9, 0),
  status: 'SCHEDULED',
  items: [
    {
      id: 'appointment-1-item',
      serviceId: 'service-cut',
      order: 0,
      serviceName: 'Coupe',
      serviceType: 'SERVICE',
      price: 30,
      phases: [{ id: 'appointment-1-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
    },
  ],
};

function draft(id: string, lines: SaleDraft['lines'], extra: Partial<SaleDraft> = {}): SaleDraft {
  return { id, businessId: 'fixture-business', clientId: client.id, completedAt: new Date(2026, 9, 15, 14, 0), lines, ...extra };
}

/** Seeds the catalog and Sales, and shows the session facts the tests read. */
function Seed() {
  const { addAppointment } = useAppointmentSession();
  const { addProduct, products: catalog } = useProductCatalog();
  const { completeSale, saleAdjustments } = useSaleSession();
  return (
    <>
      <Pressable testID="seed-products" onPress={() => products.forEach((product) => addProduct(product))} />
      <Pressable
        testID="seed"
        onPress={() => {
          addAppointment({ appointment });
          // Shampooing 1 × 20 € + Soin 2 × 18 € = 56 €, paid 50 € card + 6 € cash.
          completeSale(
            draft(
              'sale-direct',
              [
                { id: 'sale-direct-1', productId: 'p-shampoo', quantity: 1 },
                { id: 'sale-direct-2', productId: 'p-care', quantity: 2 },
              ],
              { payment: { cardAmountCents: 5000, cashAmountCents: 600 } },
            ),
          );
          completeSale(draft('sale-historical', [{ id: 'sale-historical-1', productId: 'p-care', quantity: 1 }]));
          completeSale(
            draft('sale-revente', [{ id: 'sale-revente-1', productId: 'p-care', quantity: 1 }], {
              appointmentId: appointment.id,
            }),
          );
        }}
      />
      <Text testID="probe-adjustments">{JSON.stringify(saleAdjustments.map((adjustment) => [adjustment.id.length > 0, adjustment.status, adjustment.refundCardCents, adjustment.refundCashCents]))}</Text>
      <Text testID="probe-stock-care">{String(catalog.find((product) => product.id === 'p-care')?.stockQuantity)}</Text>
      <Text testID="probe-stock-shampoo">{String(catalog.find((product) => product.id === 'p-shampoo')?.stockQuantity)}</Text>
    </>
  );
}

/** Mounts the screen once the data exists, as in the app (a screen opens on existing Sales). */
function MountAfterSeed({ children }: { readonly children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Pressable testID="mount-screen" onPress={() => setMounted(true)} />
      {mounted && children}
    </>
  );
}

async function renderSeeded(screen: ReactNode) {
  const view = await render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <MountAfterSeed>{screen}</MountAfterSeed>
              <Seed />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  for (const step of ['seed-products', 'seed', 'mount-screen']) {
    await act(async () => {
      fireEvent.press(view.getByTestId(step));
    });
  }
  return view;
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

function adjustments(view: Awaited<ReturnType<typeof render>>) {
  return JSON.parse(view.getByTestId('probe-adjustments').props.children as string) as [boolean, string, number, number][];
}

describe('Sale correction flow', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });
  beforeEach(() => {
    jest.setSystemTime(now);
    mockPush.mockClear();
    mockBack.mockClear();
    reducedMotion.enabled = false;
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('wrong product charged: one unit put back in stock explicitly, refunded now by card, reviewed before anything is written', async () => {
    const success = jest.spyOn(haptics, 'success');
    const view = await renderSeeded(<SaleAdjustmentScreen intent="correct" saleId="sale-direct" />);

    expect(view.getByRole('header', { name: 'Corriger une erreur' })).toBeTruthy();
    expect(view.getByTestId('sale-adjustment-step').props.children).toBe('ÉTAPE 1 SUR 2 · SAISIE');
    expect(view.getByTestId('sale-adjustment-reason-WRONG_PRODUCT').props.accessibilityState).toEqual({ checked: true });
    // Nothing chosen yet: nothing to review.
    expect(view.getByTestId('sale-adjustment-review').props.accessibilityState?.disabled).toBe(true);

    await press(view, 'sale-adjustment-increment-sale-direct-2');
    expect(view.getByTestId('sale-adjustment-quantity-sale-direct-2').props.children).toBe(1);
    // The suggestion: 1 × 18 €. Paid by card AND cash: the method is NOT deduced — it must be chosen.
    expect(view.getByTestId('sale-adjustment-amount').props.value).toBe('18,00');
    expect(view.getByTestId('sale-adjustment-original-method').props.children).toBe(
      'Payé à l’origine par carte et en espèces : indiquez le mode réellement utilisé.',
    );
    expect(view.getByTestId('sale-adjustment-method-CARD').props.accessibilityState).toEqual({ checked: false });
    expect(view.getByTestId('sale-adjustment-method-issue')).toBeTruthy();
    expect(view.getByTestId('sale-adjustment-review').props.accessibilityState?.disabled).toBe(true);
    await press(view, 'sale-adjustment-method-CARD');
    expect(view.queryByTestId('sale-adjustment-method-issue')).toBeNull();
    // Never restocked by itself: the professional says the unit is back on the shelf.
    expect(view.getByTestId('sale-adjustment-restock-sale-direct-2').props.value).toBe(false);
    await act(async () => {
      fireEvent(view.getByTestId('sale-adjustment-restock-sale-direct-2'), 'valueChange', true);
    });
    expect(view.getByTestId('sale-adjustment-remaining').props.children).toBe(
      `Encore remboursable : ${formatEuroCents(5600)} sur ${formatEuroCents(5600)}`,
    );

    await press(view, 'sale-adjustment-review');
    expect(view.getByTestId('sale-adjustment-step').props.children).toBe('ÉTAPE 2 SUR 2 · VÉRIFICATION');
    expect(
      within(view.getByTestId('sale-adjustment-summary-amount')).getByText(`${formatEuroCents(1800)} · carte ${formatEuroCents(1800)} · mode confirmé`),
    ).toBeTruthy();
    expect(within(view.getByTestId('sale-adjustment-summary-stock')).getByText('+1 Soin')).toBeTruthy();
    expect(within(view.getByTestId('sale-adjustment-summary-cash')).getByText(`−${formatEuroCents(1800)} le 15 octobre 2026`)).toBeTruthy();
    expect(view.getByText(SALE_ADJUSTMENT_NO_TRANSFER_NOTE)).toBeTruthy();
    // Still nothing written.
    expect(adjustments(view)).toEqual([]);
    // Soin: 10 in stock − 2 (direct) − 1 (historical) − 1 (Revente).
    expect(view.getByTestId('probe-stock-care').props.children).toBe('6');

    // A double tap records ONE correction.
    await act(async () => {
      fireEvent.press(view.getByTestId('sale-adjustment-confirm'));
      fireEvent.press(view.getByTestId('sale-adjustment-confirm'));
    });
    expect(adjustments(view)).toEqual([[true, 'SETTLED', 1800, 0]]);
    expect(view.getByTestId('probe-stock-care').props.children).toBe('7');
    expect(success).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    success.mockRestore();
  });

  it('a refund still to give back is PENDING: the review says the Caisse is unchanged until it is done', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-direct" />);
    await press(view, 'sale-adjustment-increment-sale-direct-1');
    // Even under « Retour du produit », money given back never restocks by itself.
    expect(view.getByTestId('sale-adjustment-restock-sale-direct-1').props.value).toBe(false);
    await press(view, 'sale-adjustment-method-CARD');
    await act(async () => {
      fireEvent.press(view.getByLabelText('À rembourser'));
    });
    expect(view.getByText(SALE_ADJUSTMENT_PENDING_NOTE)).toBeTruthy();
    await press(view, 'sale-adjustment-review');
    expect(within(view.getByTestId('sale-adjustment-summary-cash')).getByText('Rien tant que le remboursement n’est pas effectué')).toBeTruthy();
    expect(within(view.getByTestId('sale-adjustment-summary-stock')).getByText('Inchangé')).toBeTruthy();
    await press(view, 'sale-adjustment-confirm');
    expect(adjustments(view)).toEqual([[true, 'PENDING', 2000, 0]]);
  });

  it('never lets more money be refunded than was received, to the cent', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-direct" />);
    await press(view, 'sale-adjustment-method-CASH');
    await act(async () => {
      fireEvent.changeText(view.getByTestId('sale-adjustment-amount'), '56,01');
    });
    expect(within(view.getByTestId('sale-adjustment-issues')).getByText(`Le remboursement ne peut pas dépasser ${formatEuroCents(5600)}.`)).toBeTruthy();
    expect(view.getByTestId('sale-adjustment-review').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.changeText(view.getByTestId('sale-adjustment-amount'), '56');
    });
    expect(view.queryByTestId('sale-adjustment-issues')).toBeNull();
  });

  it('a historical Sale without any recorded payment allows only units and stock, never money', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="correct" saleId="sale-historical" />);
    expect(view.getByText(SALE_ADJUSTMENT_NO_MONEY_NOTE)).toBeTruthy();
    expect(view.queryByTestId('sale-adjustment-card')).toBeNull();
    await press(view, 'sale-adjustment-increment-sale-historical-1');
    await press(view, 'sale-adjustment-review');
    await press(view, 'sale-adjustment-confirm');
    expect(adjustments(view)).toEqual([[true, 'SETTLED', 0, 0]]);
  });

  it('a Revente whose Appointment has not been checked out is not refundable here', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-revente" />);
    expect(view.getByTestId('sale-adjustment-not-eligible')).toBeTruthy();
    expect(view.getByText(SALE_ADJUSTMENT_APPOINTMENT_NOT_SETTLED_NOTE)).toBeTruthy();
    expect(view.queryByTestId('sale-adjustment-review')).toBeNull();
  });

  it('« Rembourser intégralement » proposes every unit and the whole amount, but restocks NOTHING by itself', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="cancel" saleId="sale-direct" />);
    expect(view.getByRole('header', { name: 'Rembourser intégralement' })).toBeTruthy();
    expect(view.getByTestId('sale-adjustment-quantity-sale-direct-1').props.children).toBe(1);
    expect(view.getByTestId('sale-adjustment-quantity-sale-direct-2').props.children).toBe(2);
    // A refund is not a return: every « Remis en stock » starts off.
    expect(view.getByTestId('sale-adjustment-restock-sale-direct-1').props.value).toBe(false);
    expect(view.getByTestId('sale-adjustment-restock-sale-direct-2').props.value).toBe(false);
    expect(view.getByTestId('sale-adjustment-restock-note')).toBeTruthy();
    // Paid card AND cash: the split given back is typed, never assumed to be the original one.
    await press(view, 'sale-adjustment-method-MIXED');
    await act(async () => {
      fireEvent.changeText(view.getByTestId('sale-adjustment-card'), '50');
    });
    await act(async () => {
      fireEvent.changeText(view.getByTestId('sale-adjustment-cash'), '6');
    });
    await press(view, 'sale-adjustment-review');
    expect(
      within(view.getByTestId('sale-adjustment-summary-amount')).getByText(
        `${formatEuroCents(5600)} · carte ${formatEuroCents(5000)} · espèces ${formatEuroCents(600)} · mode confirmé`,
      ),
    ).toBeTruthy();
    expect(within(view.getByTestId('sale-adjustment-summary-stock')).getByText('Inchangé')).toBeTruthy();
    // Nothing written before « Confirmer ».
    expect(adjustments(view)).toEqual([]);
    await press(view, 'sale-adjustment-confirm');
    expect(adjustments(view)).toEqual([[true, 'SETTLED', 5000, 600]]);
    // The client kept the products: the stock does not move.
    expect(view.getByTestId('probe-stock-care').props.children).toBe('6');
  });

  it('a full refund restocks ONLY the lines switched on, once each', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="cancel" saleId="sale-direct" />);
    const shampooBefore = view.getByTestId('probe-stock-shampoo').props.children;
    // The Soin came back sellable; the Shampooing was kept (or came back damaged).
    await act(async () => {
      fireEvent(view.getByTestId('sale-adjustment-restock-sale-direct-2'), 'valueChange', true);
    });
    await press(view, 'sale-adjustment-method-CARD');
    await press(view, 'sale-adjustment-review');
    expect(within(view.getByTestId('sale-adjustment-summary-stock')).getByText('+2 Soin')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('sale-adjustment-confirm'));
      fireEvent.press(view.getByTestId('sale-adjustment-confirm'));
    });
    expect(adjustments(view)).toEqual([[true, 'SETTLED', 5600, 0]]);
    expect(view.getByTestId('probe-stock-care').props.children).toBe('8');
    expect(view.getByTestId('probe-stock-shampoo').props.children).toBe(shampooBefore);
  });

  it('says so when the stored Sale refuses the record (another write reached the ceiling first)', async () => {
    const view = await renderSeeded(
      <>
        <SaleAdjustmentScreen intent="refund" saleId="sale-direct" />
        <RefundElsewhere />
      </>,
    );
    await press(view, 'sale-adjustment-method-CARD');
    await act(async () => {
      fireEvent.changeText(view.getByTestId('sale-adjustment-amount'), '50');
    });
    await press(view, 'sale-adjustment-review');
    // Meanwhile the whole amount is refunded through another path.
    await press(view, 'refund-elsewhere');
    await press(view, 'sale-adjustment-confirm');
    // The session re-validated against its fresh state: back to the entry, nothing written twice.
    expect(adjustments(view)).toHaveLength(1);
    expect(view.getByTestId('sale-adjustment-step').props.children).toBe('ÉTAPE 1 SUR 2 · SAISIE');
    expect(
      within(view.getByTestId('sale-adjustment-issues')).getByText(`Le remboursement ne peut pas dépasser ${formatEuroCents(0)}.`),
    ).toBeTruthy();
  });
});

/** Records a full refund through the session directly (another screen, another tap). */
function RefundElsewhere() {
  const { recordSaleAdjustment } = useSaleSession();
  return (
    <Pressable
      testID="refund-elsewhere"
      onPress={() =>
        recordSaleAdjustment('sale-direct', {
          id: 'elsewhere',
          reason: 'CUSTOMER_REFUND',
          lines: [],
          refundCardCents: 5000,
          refundCashCents: 600,
          settlement: 'SETTLED',
          refundedAt: new Date(2026, 9, 15, 17, 0),
        })
      }
    />
  );
}

/** Records then drives one adjustment of `sale-direct` from the Sale detail. */
function PendingRefund() {
  const { recordSaleAdjustment } = useSaleSession();
  return (
    <Pressable
      testID="record-pending"
      onPress={() =>
        recordSaleAdjustment('sale-direct', {
          id: 'pending-1',
          reason: 'RETURN',
          lines: [{ saleItemId: 'sale-direct-2', quantity: 1, restock: true }],
          refundCardCents: 1800,
          refundCashCents: 0,
          settlement: 'PENDING',
        })
      }
    />
  );
}

describe('Sale detail — corrections and their history', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });
  beforeEach(() => {
    jest.setSystemTime(now);
    mockPush.mockClear();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('« ••• » opens « Actions de la vente »: the chosen flow opens ONCE the drawer is gone; closing changes nothing', async () => {
    const view = await renderSeeded(<SaleDetailScreen saleId="sale-direct" />);
    // No stacked buttons any more.
    expect(view.queryByText('Rembourser')).toBeNull();
    const more = view.getByTestId('open-sale-actions');
    expect(more.props.accessibilityLabel).toBe('Actions de la vente');
    expect(more.props.accessibilityRole).toBe('button');

    await press(view, 'open-sale-actions');
    await settleSheetTransition();
    const sheet = within(view.getByTestId('sale-actions-sheet'));
    expect(sheet.getByText('Actions de la vente')).toBeTruthy();
    expect(['sale-action-refund', 'sale-action-correct', 'sale-action-cancel'].map((id) => sheet.getByTestId(id).props.accessibilityLabel)).toEqual([
      'Rembourser',
      'Corriger une erreur',
      'Rembourser intégralement',
    ]);
    // Two quick taps: ONE navigation, after the drawer closed, and nothing written.
    await press(view, 'sale-action-correct');
    // The drawer is still sliding away: a second tap on the same row.
    await press(view, 'sale-action-correct');
    expect(mockPush).not.toHaveBeenCalled();
    await settleSheetTransition();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/adjust/[saleId]', params: { saleId: 'sale-direct', intent: 'correct' } });

    // Opened and dismissed without a choice: nothing happens.
    mockPush.mockClear();
    await press(view, 'open-sale-actions');
    await settleSheetTransition();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Fermer les actions'));
    });
    await settleSheetTransition();
    expect(mockPush).not.toHaveBeenCalled();
    expect(adjustments(view)).toEqual([]);
  });

  it('offers no « ••• » for a Revente whose Appointment has not received its money, and says why', async () => {
    const view = await renderSeeded(<SaleDetailScreen saleId="sale-revente" />);
    expect(view.queryByTestId('open-sale-actions')).toBeNull();
    expect(view.getByTestId('sale-adjustments-not-eligible')).toBeTruthy();
  });

  it('a pending refund is settled behind a confirmation: then « Remboursé », the real day and the recording kept apart', async () => {
    const view = await renderSeeded(
      <>
        <SaleDetailScreen saleId="sale-direct" />
        <PendingRefund />
      </>,
    );
    await press(view, 'record-pending');
    expect(view.getByTestId('sale-detail-to-refund').props.children).toBe(`À rembourser : ${formatEuroCents(1800)}`);
    // In the summary: « À rembourser », never counted as refunded.
    expect(view.getByTestId('sale-adjustment-pending-1-status').props.children).toBe('À rembourser');
    expect(view.queryByTestId('sale-refund-summary-total')).toBeNull();
    // « Rembourser intégralement » is no longer offered once something was recorded.
    await press(view, 'open-sale-actions');
    await settleSheetTransition();
    expect(view.queryByTestId('sale-action-cancel')).toBeNull();
    expect(view.getByTestId('sale-action-refund')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Fermer les actions'));
    });
    await settleSheetTransition();

    jest.setSystemTime(new Date(2026, 9, 16, 9, 30));
    await press(view, 'sale-adjustment-pending-1-settle');
    expect(view.getByTestId('sale-adjustments-dialog')).toBeTruthy();
    expect(adjustments(view)).toEqual([[true, 'PENDING', 1800, 0]]);
    await press(view, 'sale-adjustments-dialog-confirm');

    expect(adjustments(view)).toEqual([[true, 'SETTLED', 1800, 0]]);
    // Partly given back: 56 € received, 18 € refunded, 38 € kept.
    expect(view.getByTestId('sale-detail-refunded').props.children).toBe(`Remboursé : ${formatEuroCents(1800)}`);
    expect(view.getByTestId('sale-refund-summary-original')).toHaveTextContent(/56,00\s€/);
    expect(view.getByTestId('sale-refund-summary-total')).toHaveTextContent(/18,00\s€/);
    expect(view.getByTestId('sale-refund-summary-net')).toHaveTextContent(/38,00\s€/);
    expect(view.queryByTestId('sale-refund-summary-full')).toBeNull();
    expect(view.queryByTestId('sale-refund-summary-over')).toBeNull();
    expect(view.getByTestId('sale-adjustment-pending-1-status').props.children).toBe('Remboursement');
    expect(view.getByTestId('sale-adjustment-pending-1-refunded')).toHaveTextContent(/^16 octobre 2026 · Carte 18,00\s€$/);
    // The recording and the settlement stay in the collapsed journal.
    expect(view.queryByTestId('sale-adjustment-history-pending-1')).toBeNull();
    await press(view, 'sale-adjustments-history-toggle');
    const history = within(view.getByTestId('sale-adjustment-history-pending-1-history'));
    expect(history.getByText('Enregistré, à rembourser le 15 octobre 2026 à 18:00')).toBeTruthy();
    expect(history.getByText('Marqué comme remboursé le 16 octobre 2026 à 09:30')).toBeTruthy();
    // A settled refund can no longer be settled or voided — only compensated.
    expect(view.queryByTestId('sale-adjustment-pending-1-settle')).toBeNull();
    expect(view.queryByTestId('sale-adjustment-pending-1-void')).toBeNull();
    expect(view.getByTestId('sale-adjustment-pending-1-correct')).toBeTruthy();
  });

  it('a pending entry voided stays visible as « Saisie annulée » and gives its restocked unit back', async () => {
    const view = await renderSeeded(
      <>
        <SaleDetailScreen saleId="sale-direct" />
        <PendingRefund />
      </>,
    );
    await press(view, 'record-pending');
    expect(view.getByTestId('probe-stock-care').props.children).toBe('7');
    await press(view, 'sale-adjustment-pending-1-void');
    await press(view, 'sale-adjustments-dialog-confirm');
    expect(adjustments(view)).toEqual([[true, 'VOIDED', 1800, 0]]);
    // Out of the summary; kept in the journal as « Saisie annulée ».
    expect(view.queryByTestId('sale-adjustment-pending-1')).toBeNull();
    expect(view.queryByTestId('sale-refund-summary')).toBeNull();
    await press(view, 'sale-adjustments-history-toggle');
    expect(view.getByTestId('sale-adjustment-history-pending-1-status').props.children).toBe('SAISIE ANNULÉE');
    expect(view.getByTestId('probe-stock-care').props.children).toBe('6');
  });

  it('a settled refund is never cancelled by a tap: « Corriger ce remboursement… » opens the dedicated screen', async () => {
    const view = await renderSeeded(
      <>
        <SaleDetailScreen saleId="sale-direct" />
        <PendingRefund />
      </>,
    );
    await press(view, 'record-pending');
    await press(view, 'sale-adjustment-pending-1-settle');
    await press(view, 'sale-adjustments-dialog-confirm');
    expect(view.queryByText(/Annuler ce remboursement/)).toBeNull();
    await press(view, 'sale-adjustment-pending-1-correct');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/sales/refund/[adjustmentId]', params: { adjustmentId: 'pending-1' } });
    // Nothing recorded by the tap itself.
    expect(adjustments(view)).toEqual([[true, 'SETTLED', 1800, 0]]);
  });
});

describe('Sales history — swipe reveals « Actions », never acts', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });
  beforeEach(() => {
    jest.setSystemTime(now);
    mockPush.mockClear();
    reducedMotion.enabled = false;
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('reveals « Actions » on swipe; tapping it opens the SAME drawer; nothing is recorded by the gesture', async () => {
    const view = await renderSeeded(<SalesHistoryScreen />);
    // A full swipe commits nothing: there is no full-swipe action at all.
    await press(view, 'sale-history-swipe-sale-direct-swipe-full');
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.queryByTestId('sale-actions-sheet')).toBeNull();
    expect(adjustments(view)).toEqual([]);
    const action = view.getByTestId('sale-history-actions-sale-direct');
    expect(within(action).getByText('Actions')).toBeTruthy();
    expect(view.queryByText('Rembourser')).toBeNull();
    await press(view, 'sale-history-actions-sale-direct');
    await settleSheetTransition();
    expect(within(view.getByTestId('sale-actions-sheet')).getByText('Actions de la vente')).toBeTruthy();
    await press(view, 'sale-action-refund');
    await settleSheetTransition();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/adjust/[saleId]', params: { saleId: 'sale-direct', intent: 'refund' } });
    expect(adjustments(view)).toEqual([]);
    // The Revente of an unpaid Appointment offers no action: no swipe at all.
    expect(view.queryByTestId('sale-history-swipe-sale-revente')).toBeNull();
  });

  it('offers the same drawer to VoiceOver from the row itself', async () => {
    const view = await renderSeeded(<SalesHistoryScreen />);
    const container = view.getByTestId('sale-history-swipe-sale-direct-container');
    expect(container.props.accessibilityActions).toEqual([{ name: 'swipeAction', label: 'Actions de la vente' }]);
    await act(async () => {
      fireEvent(container, 'accessibilityAction', { nativeEvent: { actionName: 'swipeAction' } });
    });
    await settleSheetTransition();
    expect(view.getByTestId('sale-action-correct')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('plays ONE discoverability peek, on the first adjustable row only', async () => {
    const view = await renderSeeded(<SalesHistoryScreen />);
    await act(async () => {
      jest.advanceTimersByTime(SWIPE_HINT_DELAY_MS + 10);
    });
    // Newest first, ties by id: the Revente (not adjustable) comes first, then the historical Sale.
    expect(view.queryAllByTestId(/^sale-history-swipe-.*-hint$/).map((node) => node.props.testID)).toEqual([
      'sale-history-swipe-sale-historical-hint',
    ]);
    // Revealed, then held long enough to read, then back to rest — and it never ran anything.
    await act(async () => {
      jest.advanceTimersByTime(SWIPE_HINT_REVEAL_MS + SWIPE_HINT_HOLD_MS);
    });
    expect(view.getByTestId('sale-history-swipe-sale-historical-hint')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(SWIPE_HINT_RETURN_MS);
    });
    expect(view.queryAllByTestId(/^sale-history-swipe-.*-hint$/)).toEqual([]);
    expect(view.queryByTestId('sale-actions-sheet')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(adjustments(view)).toEqual([]);
    // Played once per screen instance: nothing replays later.
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(view.queryAllByTestId(/^sale-history-swipe-.*-hint$/)).toEqual([]);
  });

  it('never plays the peek under Reduce Motion', async () => {
    reducedMotion.enabled = true;
    const view = await renderSeeded(<SalesHistoryScreen />);
    await act(async () => {
      jest.advanceTimersByTime(SWIPE_HINT_DELAY_MS + 10);
    });
    expect(view.queryAllByTestId(/^sale-history-swipe-.*-hint$/)).toEqual([]);
  });
});
