// Milestone 2 hardening: the persistent swipe cue, the refund method of a
// Revente, and « Corriger un remboursement » (what really happened).

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
import { reducedMotion } from '@/features/clients/birthday/testing/mock-reanimated';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { formatEuroCents } from '@/shared/lib/money';

import { SaleDetailScreen } from '../../history/SaleDetailScreen';
import { SalesHistoryScreen } from '../../history/SalesHistoryScreen';
import { SaleAdjustmentScreen } from '../SaleAdjustmentScreen';
import { REFUND_CORRECTION_UNAVAILABLE, SaleRefundCorrectionScreen } from '../SaleRefundCorrectionScreen';
import { REFUND_METHOD_REQUIRED, REFUND_REALLY_PAID_NOTE } from '../presentation';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
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
  };
});

const [, client] = createInitialClients();
const now = new Date(2026, 9, 15, 18, 0);

const products: readonly Product[] = [
  { id: 'p-care', businessId: 'fixture-business', name: 'Soin', price: 18, stockQuantity: 10, active: true },
];

function appointment(id: string): Appointment {
  return {
    id,
    businessId: 'fixture-business',
    clientId: client.id,
    staffMemberId: 'staff-amelie',
    startAt: new Date(2026, 9, 15, 9, 0),
    status: 'SCHEDULED',
    items: [
      {
        id: `${id}-item`,
        serviceId: 'service-cut',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 30,
        phases: [{ id: `${id}-phase`, name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
      },
    ],
  };
}

function draft(id: string, extra: Partial<SaleDraft> = {}): SaleDraft {
  return {
    id,
    businessId: 'fixture-business',
    clientId: client.id,
    completedAt: new Date(2026, 9, 15, 10, 0),
    lines: [{ id: `${id}-1`, productId: 'p-care', quantity: 1 }],
    ...extra,
  };
}

/**
 * Sales: a direct one paid in cash (with a settled, restocked refund), a Revente
 * of an Appointment paid in cash, a Revente of an Appointment paid by a card
 * deposit + cash, a historical Sale (nothing to refund but units).
 */
function Seed() {
  const { addAppointment, checkoutAppointment, recordAppointmentDeposit } = useAppointmentSession();
  const { addProduct, products: catalog } = useProductCatalog();
  const { completeSale, recordSaleAdjustment, saleAdjustments } = useSaleSession();
  return (
    <>
      <Pressable testID="seed-products" onPress={() => products.forEach((product) => addProduct(product))} />
      <Pressable
        testID="seed-appointments"
        onPress={() => {
          addAppointment({ appointment: appointment('appointment-cash') });
          addAppointment({ appointment: appointment('appointment-mixed') });
        }}
      />
      <Pressable
        testID="seed-sales"
        onPress={() => {
          completeSale(draft('sale-direct', { payment: { cardAmountCents: 0, cashAmountCents: 1800 } }));
          completeSale(draft('sale-revente-cash', { appointmentId: 'appointment-cash' }));
          completeSale(draft('sale-revente-mixed', { appointmentId: 'appointment-mixed' }));
        }}
      />
      <Pressable
        testID="seed-money"
        onPress={() => {
          checkoutAppointment('appointment-cash', { cardAmountCents: 0, cashAmountCents: 4800 });
          recordAppointmentDeposit({ id: 'deposit-card', appointmentId: 'appointment-mixed', amountCents: 1000, paymentMethod: 'CARD' });
        }}
      />
      <Pressable
        testID="seed-checkout-mixed"
        onPress={() => checkoutAppointment('appointment-mixed', { cardAmountCents: 0, cashAmountCents: 3800 })}
      />
      <Pressable
        testID="seed-refund"
        onPress={() =>
          recordSaleAdjustment('sale-direct', {
            id: 'refund-1',
            reason: 'WRONG_PRODUCT',
            lines: [{ saleItemId: 'sale-direct-1', quantity: 1, restock: true }],
            refundCardCents: 0,
            refundCashCents: 1800,
            settlement: 'SETTLED',
            refundedAt: new Date(2026, 9, 15, 11, 0),
          })
        }
      />
      <Text testID="probe-adjustments">
        {JSON.stringify(
          saleAdjustments.map((adjustment) => ({
            kind: adjustment.kind,
            reason: adjustment.reason,
            card: adjustment.refundCardCents,
            cash: adjustment.refundCashCents,
            refundedAt: adjustment.refundedAt?.toISOString(),
          })),
        )}
      </Text>
      <Text testID="probe-stock">{String(catalog.find((product) => product.id === 'p-care')?.stockQuantity)}</Text>
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

async function renderSeeded(screen: ReactNode, steps: readonly string[]) {
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
  for (const step of ['seed-products', 'seed-appointments', 'seed-sales', ...steps, 'mount-screen']) {
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

const adjustments = (view: Awaited<ReturnType<typeof render>>) =>
  JSON.parse(view.getByTestId('probe-adjustments').props.children as string) as {
    kind: string;
    reason: string;
    card: number;
    cash: number;
    refundedAt?: string;
  }[];

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

describe('a persistent cue on every swipeable sale row', () => {
  it('draws the grip on EVERY adjustable row — not only the one that plays the peek — with no instruction sentence', async () => {
    const view = await renderSeeded(<SalesHistoryScreen />, ['seed-money']);
    const grips = view.queryAllByTestId(/^sale-history-swipe-.*-affordance$/, { includeHiddenElements: true }).map((node) => node.props.testID);
    expect(grips).toEqual(
      expect.arrayContaining(['sale-history-swipe-sale-direct-affordance', 'sale-history-swipe-sale-revente-cash-affordance']),
    );
    // Decorative: never a target, never read twice by VoiceOver (the row carries the action).
    const grip = view.getByTestId('sale-history-swipe-sale-direct-affordance', { includeHiddenElements: true });
    expect(grip.props.pointerEvents).toBe('none');
    expect(grip.props.accessibilityElementsHidden).toBe(true);
    // The grip and the peek carry the gesture: no legend, and no empty slot where it was.
    expect(view.queryByTestId('sales-history-swipe-hint')).toBeNull();
    expect(view.queryByText(/Glissez/)).toBeNull();
  });

  it('stays under Reduce Motion (only the peek is skipped), and is absent where nothing can be corrected', async () => {
    reducedMotion.enabled = true;
    // The mixed Revente's Appointment is not checked out yet: not adjustable.
    const view = await renderSeeded(<SalesHistoryScreen />, ['seed-money']);
    expect(view.getByTestId('sale-history-swipe-sale-direct-affordance', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId('sale-history-swipe-sale-revente-mixed-affordance', { includeHiddenElements: true })).toBeNull();
    expect(view.queryAllByTestId(/^sale-history-swipe-.*-hint$/)).toEqual([]);
  });

  it('drops the grip once a Sale has nothing left to correct', async () => {
    const view = await renderSeeded(<SalesHistoryScreen />, []);
    // Only the direct Sale is adjustable without the Appointments being paid; refund it whole.
    expect(view.getByTestId('sale-history-swipe-sale-direct-affordance', { includeHiddenElements: true })).toBeTruthy();
    await press(view, 'seed-refund');
    expect(view.queryByTestId('sale-history-swipe-sale-direct-affordance', { includeHiddenElements: true })).toBeNull();
  });
});

describe('the refund method of a Sale sold during an Appointment', () => {
  it('Appointment paid in cash only: cash is preselected FROM that payment, said so, and still changeable', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-revente-cash" />, ['seed-money']);
    await press(view, 'sale-adjustment-increment-sale-revente-cash-1');
    expect(view.getByTestId('sale-adjustment-method-CASH').props.accessibilityState).toEqual({ checked: true });
    expect(view.getByTestId('sale-adjustment-original-method').props.children).toBe(
      'Payé à l’origine en espèces. Préselectionné : vérifiez qu’il correspond au remboursement réel.',
    );
    // Refunded by card although paid in cash: allowed, and recorded as such.
    await press(view, 'sale-adjustment-method-CARD');
    await press(view, 'sale-adjustment-review');
    await press(view, 'sale-adjustment-confirm');
    expect(adjustments(view)).toEqual([expect.objectContaining({ card: 1800, cash: 0 })]);
  });

  it('Appointment paid by a card deposit AND cash: nothing is preselected, the method must be chosen', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-revente-mixed" />, [
      'seed-money',
      'seed-checkout-mixed',
    ]);
    await press(view, 'sale-adjustment-increment-sale-revente-mixed-1');
    for (const method of ['CARD', 'CASH', 'MIXED']) {
      expect(view.getByTestId(`sale-adjustment-method-${method}`).props.accessibilityState).toEqual({ checked: false });
    }
    expect(within(view.getByTestId('sale-adjustment-issues')).getByText(REFUND_METHOD_REQUIRED)).toBeTruthy();
    expect(view.getByTestId('sale-adjustment-review').props.accessibilityState?.disabled).toBe(true);
    await press(view, 'sale-adjustment-method-CASH');
    expect(view.getByTestId('sale-adjustment-review').props.accessibilityState?.disabled).toBe(false);
  });

  it('a direct Sale paid in cash: cash preselected from its own payment', async () => {
    const view = await renderSeeded(<SaleAdjustmentScreen intent="refund" saleId="sale-direct" />, []);
    await press(view, 'sale-adjustment-increment-sale-direct-1');
    expect(view.getByTestId('sale-adjustment-method-CASH').props.accessibilityState).toEqual({ checked: true });
  });
});

describe('« Corriger un remboursement » — what really happened', () => {
  it('« saisi par erreur »: a correction on the SAME day as the refund, stock taken back, behind a review', async () => {
    const view = await renderSeeded(<SaleRefundCorrectionScreen adjustmentId="refund-1" />, ['seed-refund']);
    expect(view.getByTestId('probe-stock').props.children).toBe('8'); // 10 − 3 sold + 1 restocked
    expect(view.getByTestId('refund-correction-review').props.accessibilityState?.disabled).toBe(true);
    await press(view, 'refund-correction-meaning-RECORDED_IN_ERROR');
    await press(view, 'refund-correction-review');
    expect(within(view.getByTestId('refund-correction-summary-record')).getByText(
      `Correction de saisie +${formatEuroCents(1800)}, datée du 15 octobre 2026`,
    )).toBeTruthy();
    expect(within(view.getByTestId('refund-correction-summary-stock')).getByText(
      '−1 Soin : le produit est de nouveau compté comme vendu',
    )).toBeTruthy();
    expect(adjustments(view)).toHaveLength(1);
    await act(async () => {
      fireEvent.press(view.getByTestId('refund-correction-confirm'));
      fireEvent.press(view.getByTestId('refund-correction-confirm'));
    });
    expect(adjustments(view)).toEqual([
      expect.objectContaining({ kind: 'REFUND' }),
      { kind: 'REVERSAL', reason: 'RECORDED_IN_ERROR', card: 0, cash: 1800, refundedAt: new Date(2026, 9, 15, 11, 0).toISOString() },
    ]);
    expect(view.getByTestId('probe-stock').props.children).toBe('7');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('« l’argent m’a été rendu »: the method is chosen (never assumed), the day is real, the refund stays visible', async () => {
    const view = await renderSeeded(<SaleRefundCorrectionScreen adjustmentId="refund-1" />, ['seed-refund']);
    await press(view, 'refund-correction-meaning-REFUND_RETURNED');
    for (const method of ['CARD', 'CASH', 'MIXED']) {
      expect(view.getByTestId(`refund-correction-method-${method}`).props.accessibilityState).toEqual({ checked: false });
    }
    expect(view.getByTestId('refund-correction-issue').props.children).toBe(REFUND_METHOD_REQUIRED);
    expect(view.getByTestId('refund-correction-review').props.accessibilityState?.disabled).toBe(true);
    // Returned partly by card, partly in cash: the split must add up to the whole refund.
    await press(view, 'refund-correction-method-MIXED');
    await act(async () => {
      fireEvent.changeText(view.getByTestId('refund-correction-card'), '10');
    });
    expect(view.getByTestId('refund-correction-review').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.changeText(view.getByTestId('refund-correction-cash'), '8');
    });
    await press(view, 'refund-correction-review');
    expect(within(view.getByTestId('refund-correction-summary-cash')).getByText(
      `+${formatEuroCents(1800)} le 15 octobre 2026 (Carte ${formatEuroCents(1000)} · Espèces ${formatEuroCents(800)})`,
    )).toBeTruthy();
    await press(view, 'refund-correction-confirm');
    expect(adjustments(view)[1]).toEqual({
      kind: 'REVERSAL',
      reason: 'REFUND_RETURNED',
      card: 1000,
      cash: 800,
      refundedAt: now.toISOString(),
    });
    // The refund itself is untouched.
    expect(adjustments(view)[0]).toEqual(expect.objectContaining({ kind: 'REFUND', cash: 1800 }));
  });

  it('« le remboursement a bien eu lieu »: nothing to record, the screen says so', async () => {
    const view = await renderSeeded(<SaleRefundCorrectionScreen adjustmentId="refund-1" />, ['seed-refund']);
    await press(view, 'refund-correction-meaning-REALLY_PAID');
    expect(view.getByText(REFUND_REALLY_PAID_NOTE)).toBeTruthy();
    expect(view.queryByTestId('refund-correction-review')).toBeNull();
    expect(adjustments(view)).toHaveLength(1);
  });

  it('a refund already compensated cannot be corrected twice', async () => {
    const view = await renderSeeded(<SaleRefundCorrectionScreen adjustmentId="refund-1" />, ['seed-refund']);
    await press(view, 'refund-correction-meaning-RECORDED_IN_ERROR');
    await press(view, 'refund-correction-review');
    await press(view, 'refund-correction-confirm');
    expect(view.getByText(REFUND_CORRECTION_UNAVAILABLE)).toBeTruthy();
  });
});

describe('payment pills — cash only', () => {
  it('a Sale paid entirely in cash shows ONE banknote pill under « Total reçu »: amount shown, method spoken', async () => {
    const view = await renderSeeded(<SaleDetailScreen saleId="sale-direct" />, []);
    expect(view.getByTestId('sale-detail-payment-cash').props.accessibilityLabel).toBe(`Espèces, ${formatEuroCents(1800)}`);
    expect(within(view.getByTestId('sale-detail-payment-cash')).getByText(formatEuroCents(1800))).toBeTruthy();
    expect(view.queryByText('Espèces')).toBeNull();
    expect(view.queryByTestId('sale-detail-payment-card')).toBeNull();
  });
});

