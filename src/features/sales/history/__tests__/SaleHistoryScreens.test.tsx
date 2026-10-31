import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import type { Product } from '@/domain/products';
import type { SaleDraft } from '@/domain/sales';
import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider, useProductCatalog } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { formatEuroCents } from '@/shared/lib/money';
import { formatNavigatorDate } from '@/shared/ui/DateNavigator';

import {
  APPOINTMENT_MISSING_LABEL,
  OPEN_APPOINTMENT_LABEL,
  SALE_DETAIL_TITLE,
  SALE_NOT_FOUND_TITLE,
  SaleDetailScreen,
} from '../SaleDetailScreen';
import { SALES_HISTORY_TITLE, SalesHistoryScreen } from '../SalesHistoryScreen';
import { WALK_IN_SALE_LABEL } from '../SaleHistoryRow';
import {
  SALE_HISTORY_EMPTY_COPY,
  SALE_PAID_WITH_APPOINTMENT_NOTE,
  SALE_PAYMENT_UNKNOWN_NOTE,
} from '../../presentation';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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
// Thursday 15 October 2026, 18:00 local.
const now = new Date(2026, 9, 15, 18, 0);

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

const products: readonly Product[] = [
  { id: 'p-shampoo', businessId: 'fixture-business', name: 'Shampooing', price: 0.29, stockQuantity: 20, active: true },
  { id: 'p-care', businessId: 'fixture-business', name: 'Soin', price: 18, stockQuantity: 20, active: true },
];

function draft(id: string, completedAt: Date, lines: SaleDraft['lines'], extra: Partial<SaleDraft> = {}): SaleDraft {
  return { id, businessId: 'fixture-business', clientId: client.id, completedAt, lines, ...extra };
}

function Seed() {
  const { addAppointment } = useAppointmentSession();
  const { addProduct } = useProductCatalog();
  const { completeSale } = useSaleSession();
  return (
    <>
      <Pressable
        testID="seed-products"
        onPress={() => {
          for (const product of products) addProduct(product);
        }}
      />
      <Pressable
        testID="seed"
        onPress={() => {
          addAppointment({ appointment });
          // Today, 14:35: a direct mixed Sale of 3 × 0,29 € + 2 × 18 € = 36,87 €.
          completeSale(
            draft(
              'sale-direct',
              new Date(2026, 9, 15, 14, 35),
              [
                { id: 'sale-direct-1', productId: 'p-shampoo', quantity: 3 },
                { id: 'sale-direct-2', productId: 'p-care', quantity: 2 },
              ],
              { payment: { cardAmountCents: 1000, cashAmountCents: 2687 } },
            ),
          );
          // Today, 09:10: a Revente during the Appointment.
          completeSale(
            draft('sale-linked', new Date(2026, 9, 15, 9, 10), [{ id: 'sale-linked-1', productId: 'p-care', quantity: 1 }], {
              appointmentId: appointment.id,
            }),
          );
          // Today, 12:00: a walk-in Sale, card.
          completeSale(
            draft('sale-walk-in', new Date(2026, 9, 15, 12, 0), [{ id: 'sale-walk-in-1', productId: 'p-shampoo', quantity: 1 }], {
              clientId: undefined,
              payment: { cardAmountCents: 29, cashAmountCents: 0 },
            }),
          );
          // 3 October: a historical direct Sale without any payment record.
          completeSale(
            draft('sale-historical', new Date(2026, 9, 3, 11, 0), [{ id: 'sale-historical-1', productId: 'p-care', quantity: 1 }]),
          );
          // A Sale whose Appointment this device does not hold.
          completeSale(
            draft('sale-orphan', new Date(2026, 9, 14, 16, 0), [{ id: 'sale-orphan-1', productId: 'p-care', quantity: 1 }], {
              appointmentId: 'appointment-gone',
            }),
          );
        }}
      />
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
              {screen}
              <Seed />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  for (const step of ['seed-products', 'seed']) {
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

function rows(view: Awaited<ReturnType<typeof render>>) {
  return view.queryAllByTestId(/^sale-history-row-/).map((row) => row.props.testID as string);
}

describe('Sale history screens', () => {
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

  describe('SalesHistoryScreen', () => {
    it('opens on today in Day mode and lists the day’s Sales newest first, direct and Revente alike', async () => {
      const view = await renderSeeded(<SalesHistoryScreen />);

      expect(view.getByRole('header', { name: SALES_HISTORY_TITLE })).toBeTruthy();
      expect(view.getByText('GESTION')).toBeTruthy();
      expect(view.getByLabelText('Jour').props.accessibilityState.selected).toBe(true);
      expect(view.getByTestId('sales-history-date').props.children).toBe(formatNavigatorDate(new Date(2026, 9, 15)));
      expect(view.getByTestId('sales-history-today')).toBeTruthy();
      expect(rows(view)).toEqual(['sale-history-row-sale-direct', 'sale-history-row-sale-walk-in', 'sale-history-row-sale-linked']);
      expect(view.getByTestId('sales-history-count').props.accessibilityLabel).toBe('Ventes, 3 ventes, 7 unités');
      expect(view.getByTestId('sales-history-unit-count-value').props.children).toBe(7);

      // The direct Sale: client, channel + products, exact snapshot total, mixed payment.
      const direct = view.getByTestId('sale-history-row-sale-direct');
      expect(direct.props.accessibilityRole).toBe('button');
      expect(within(direct).getByText('14:35')).toBeTruthy();
      expect(within(direct).getByText('Vente directe · Shampooing + Soin')).toBeTruthy();
      expect(view.getByTestId('sale-history-amount-sale-direct').props.children).toBe(formatEuroCents(3687));
      expect(within(direct).getByText('Carte + Espèces')).toBeTruthy();

      // The Revente: named as sold during an Appointment, paid with it.
      const linked = view.getByTestId('sale-history-row-sale-linked');
      expect(within(linked).getByText('Pendant un rendez-vous · Soin')).toBeTruthy();
      expect(within(linked).getByText('Avec le rendez-vous')).toBeTruthy();
      expect(view.getByTestId('sale-history-amount-sale-linked').props.children).toBe(formatEuroCents(1800));

      // The walk-in Sale names nobody.
      expect(within(view.getByTestId('sale-history-row-sale-walk-in')).getByText(WALK_IN_SALE_LABEL)).toBeTruthy();
      // A Sale is never edited or deleted here; an adjustable one only reveals « Rembourser » on swipe.
      expect(view.queryByText(/Modifier|Supprimer/)).toBeNull();
      expect(view.getByTestId('sale-history-actions-sale-direct')).toBeTruthy();
    });

    it('navigates days and months with the Caisse controls, and says when a period sold nothing', async () => {
      const view = await renderSeeded(<SalesHistoryScreen />);

      await press(view, 'sales-history-previous');
      expect(rows(view)).toEqual(['sale-history-row-sale-orphan']);
      await press(view, 'sales-history-previous');
      expect(rows(view)).toEqual([]);
      const empty = view.getByTestId('sales-history-empty');
      expect(within(empty).getByText('Aucune vente ce jour')).toBeTruthy();
      expect(within(empty).getByText(SALE_HISTORY_EMPTY_COPY)).toBeTruthy();
      expect(view.getByTestId('sales-history-count').props.accessibilityLabel).toBe('Ventes, Aucune vente, Aucune unité');
      await press(view, 'sales-history-go-to-today');
      expect(rows(view)).toHaveLength(3);

      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });
      expect(view.getByTestId('sales-history-period-label').props.children).toBe('Octobre 2026');
      expect(view.getByTestId('sales-history-this-month')).toBeTruthy();
      // The whole month, newest first, each row dated; the historical Sale says its record is unknown.
      expect(rows(view)).toEqual([
        'sale-history-row-sale-direct',
        'sale-history-row-sale-walk-in',
        'sale-history-row-sale-linked',
        'sale-history-row-sale-orphan',
        'sale-history-row-sale-historical',
      ]);
      const historical = view.getByTestId('sale-history-row-sale-historical');
      expect(within(historical).getByText('3 oct.')).toBeTruthy();
      expect(within(historical).getByText('Non renseigné')).toBeTruthy();
      expect(view.getByTestId('sales-history-count').props.accessibilityLabel).toBe('Ventes, 5 ventes, 9 unités');

      await press(view, 'sales-history-previous');
      expect(view.getByTestId('sales-history-period-label').props.children).toBe('Septembre 2026');
      expect(within(view.getByTestId('sales-history-empty')).getByText('Aucune vente ce mois')).toBeTruthy();
      await press(view, 'sales-history-current');
      expect(rows(view)).toHaveLength(5);
    });

    it('opens on the period the Caisse was showing', async () => {
      const view = await renderSeeded(<SalesHistoryScreen initialDate={new Date(2026, 9, 1)} initialPeriod="month" />);

      expect(view.getByLabelText('Mois').props.accessibilityState.selected).toBe(true);
      expect(view.getByTestId('sales-history-period-label').props.children).toBe('Octobre 2026');
      expect(rows(view)).toHaveLength(5);
    });

    it('opens the Sale detail from any row and goes back through the glass button', async () => {
      const view = await renderSeeded(<SalesHistoryScreen />);

      await press(view, 'sale-history-row-sale-linked');
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/sales/[saleId]', params: { saleId: 'sale-linked' } });

      await act(async () => {
        fireEvent.press(view.getByLabelText('Retour'));
      });
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('SaleDetailScreen', () => {
    it('shows a direct Sale exactly as recorded: lines, exact totals, client and the card / cash split', async () => {
      const view = await renderSeeded(<SaleDetailScreen saleId="sale-direct" />);

      expect(view.getByRole('header', { name: SALE_DETAIL_TITLE })).toBeTruthy();
      expect(view.getByTestId('sale-detail-channel').props.children).toBe('VENTE DIRECTE');
      expect(view.getByTestId('sale-detail-total').props.children).toBe(formatEuroCents(3687));
      expect(view.getByTestId('sale-detail-when').props.children).toBe('Jeudi 15 octobre 2026 à 14:35');
      expect(view.getByTestId('sale-detail-units').props.children).toBe('5 produits');

      const clientRow = view.getByTestId('sale-detail-client-row');
      expect(view.getByTestId('sale-detail-client-name').props.children).toBe(`${client.firstName} ${client.lastName}`);
      expect(clientRow.props.accessibilityRole).toBe('button');

      const shampoo = view.getByTestId('sale-detail-line-sale-direct-1');
      expect(within(shampoo).getByText('Shampooing')).toBeTruthy();
      expect(within(shampoo).getByText('×3 · 0,29 €')).toBeTruthy();
      expect(within(shampoo).getByText(formatEuroCents(87))).toBeTruthy();
      const care = view.getByTestId('sale-detail-line-sale-direct-2');
      expect(within(care).getByText('×2 · 18,00 €')).toBeTruthy();
      expect(within(care).getByText(formatEuroCents(3600))).toBeTruthy();
      expect(view.getByTestId('sale-detail-products-count').props.children).toBe(5);

      expect(within(view.getByTestId('sale-detail-payment-total')).getByText(formatEuroCents(3687))).toBeTruthy();
      expect(view.getByTestId('sale-detail-payment-total').props.accessibilityLabel).toBe(`Reçu à la vente, ${formatEuroCents(3687)}`);
      // Mixed payment: TWO pills, card first — glyph + amount on screen, each spoken « method, amount ».
      const pills = within(view.getByTestId('sale-detail-payment-methods'));
      expect(pills.getByTestId('sale-detail-payment-card').props.accessibilityLabel).toBe(`Carte, ${formatEuroCents(1000)}`);
      expect(pills.getByTestId('sale-detail-payment-cash').props.accessibilityLabel).toBe(`Espèces, ${formatEuroCents(2687)}`);
      expect(within(view.getByTestId('sale-detail-payment-card')).getByText(formatEuroCents(1000))).toBeTruthy();
      expect(within(view.getByTestId('sale-detail-payment-cash')).getByText(formatEuroCents(2687))).toBeTruthy();
      // The method is never written, only drawn and spoken.
      expect(view.queryByText(/^(Carte|Espèces)$/)).toBeNull();
      // Glyph + amount only: the amount is the one text of each pill, and the pills wrap on a narrow phone.
      expect(within(view.getByTestId('sale-detail-payment-card')).getAllByText(/./)).toHaveLength(1);
      expect(StyleSheet.flatten(view.getByTestId('sale-detail-payment-methods').props.style)).toMatchObject({ flexWrap: 'wrap' });
      // Paid the day it was validated: no separate payment day.
      expect(view.queryByTestId('sale-detail-payment-day')).toBeNull();
      // The Sale itself is never edited or deleted; corrections are separate records.
      expect(view.queryByText(/Modifier|Supprimer/)).toBeNull();
      expect(view.getByTestId('open-sale-actions').props.accessibilityLabel).toBe('Actions de la vente');

      await press(view, 'sale-detail-client-row');
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/clients/[clientId]', params: { clientId: client.id } });
    });

    it('keeps the snapshot when the Product is later renamed or re-priced', async () => {
      function Rename() {
        const { updateProduct } = useProductCatalog();
        return (
          <Pressable
            testID="rename"
            onPress={() => updateProduct({ ...products[1], name: 'Soin premium', price: 25 })}
          />
        );
      }
      const view = await renderSeeded(
        <>
          <SaleDetailScreen saleId="sale-direct" />
          <Rename />
        </>,
      );
      await press(view, 'rename');

      const care = view.getByTestId('sale-detail-line-sale-direct-2');
      expect(within(care).getByText('Soin')).toBeTruthy();
      expect(within(care).getByText('×2 · 18,00 €')).toBeTruthy();
      expect(view.getByTestId('sale-detail-total').props.children).toBe(formatEuroCents(3687));
    });

    it('says a Revente was paid with its Appointment and leads to it', async () => {
      const view = await renderSeeded(<SaleDetailScreen saleId="sale-linked" />);

      expect(view.getByTestId('sale-detail-channel').props.children).toBe('VENDUE PENDANT UN RENDEZ-VOUS');
      expect(view.getByText(SALE_PAID_WITH_APPOINTMENT_NOTE)).toBeTruthy();
      expect(view.queryByTestId('sale-detail-payment-total')).toBeNull();
      // The money is the Appointment's: no pill is invented.
      expect(view.queryByTestId('sale-detail-payment-methods')).toBeNull();
      expect(view.queryByText(/Carte|Espèces/)).toBeNull();

      await press(view, 'sale-detail-open-appointment');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'appointment-1' },
      });
      expect(view.getByText(OPEN_APPOINTMENT_LABEL)).toBeTruthy();
    });

    it('says when the Appointment of a Revente is not on this device, without inventing a payment', async () => {
      const view = await renderSeeded(<SaleDetailScreen saleId="sale-orphan" />);

      expect(view.getByText(SALE_PAID_WITH_APPOINTMENT_NOTE)).toBeTruthy();
      expect(view.queryByTestId('sale-detail-open-appointment')).toBeNull();
      expect(view.getByText(APPOINTMENT_MISSING_LABEL)).toBeTruthy();
    });

    it('says a historical direct Sale has no payment record, and names nobody for a walk-in Sale', async () => {
      const view = await renderSeeded(
        <>
          <SaleDetailScreen saleId="sale-historical" />
        </>,
      );
      expect(view.getByText(SALE_PAYMENT_UNKNOWN_NOTE)).toBeTruthy();
      expect(view.queryByTestId('sale-detail-payment-methods')).toBeNull();
      expect(view.queryByText(/Carte|Espèces/)).toBeNull();
      expect(view.getByTestId('sale-detail-total').props.children).toBe(formatEuroCents(1800));
    });

    it('shows a walk-in Sale with a read-only client row', async () => {
      const view = await renderSeeded(<SaleDetailScreen saleId="sale-walk-in" />);

      expect(view.getByTestId('sale-detail-client-name').props.children).toBe(WALK_IN_SALE_LABEL);
      expect(view.getByTestId('sale-detail-client-row').props.accessibilityRole).toBeUndefined();
      // Card only: ONE pill.
      expect(within(view.getByTestId('sale-detail-payment-card')).getByText(formatEuroCents(29))).toBeTruthy();
      expect(view.getByTestId('sale-detail-payment-card').props.accessibilityLabel).toBe(`Carte, ${formatEuroCents(29)}`);
      expect(view.queryByText('Carte')).toBeNull();
      expect(view.queryByTestId('sale-detail-payment-cash')).toBeNull();
    });

    it('shows a restrained not-found state for an unknown Sale, with the way back', async () => {
      const view = await renderSeeded(<SaleDetailScreen saleId="sale-missing" />);

      expect(view.getByText(SALE_NOT_FOUND_TITLE)).toBeTruthy();
      await act(async () => {
        fireEvent.press(view.getByLabelText('Retour'));
      });
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
