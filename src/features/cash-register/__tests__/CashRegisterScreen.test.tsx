import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, StyleSheet } from 'react-native';

import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import {
  ProductCatalogProvider,
  useProductCatalog,
} from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents, formatSignedEuroCents } from '@/shared/lib/money';
import { formatNavigatorDate } from '@/shared/ui/DateNavigator';
import { glassIconButtonSize } from '@/shared/ui/GlassIconButton';
import { statePillTones } from '@/shared/ui/StatePill';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { calendarIntensity, foregroundSoft, semanticColors, watermark as watermarkTheme } from '@/shared/ui/theme';

import { CashRegisterScreen } from '../CashRegisterScreen';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import type { SourisDatabase } from '@/persistence/database';
import { readMetadata } from '@/persistence/metadata';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { HEATMAP_HINT_MOTION } from '../components/RevenueHeatmapHint';
import { CASH_REGISTER_HEATMAP_HINT_SEEN_KEY } from '../heatmap-hint';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The heatmap hint animates through Reanimated: values jump to their targets.
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const MASQUE_ID = '6974bff937a5d89c2d9afbd0'; // Masque réparateur 5 min · 50 €

/** Records explicit checkouts and Sales through the canonical sessions at the CURRENT fake time. */
function CheckoutProbe() {
  const { checkoutAppointment, recordAppointmentDeposit, updateAppointmentPayment, voidAppointmentDeposit } =
    useAppointmentSession();
  const { setProductStock } = useProductCatalog();
  const { completeSale, recordSaleAdjustment } = useSaleSession();
  const sell = (id: string, appointmentId?: string, payment?: { cardAmountCents: number; cashAmountCents: number }) =>
    completeSale({
      id,
      businessId: 'business-test',
      clientId: 'client-agenda-sofia',
      appointmentId,
      ...(payment ? { payment } : {}),
      completedAt: new Date(),
      lines: [{ id: `${id}-1`, productId: MASQUE_ID, quantity: 1 }],
    });
  return (
    <>
      <Pressable testID="stock-products" onPress={() => setProductStock(MASQUE_ID, 10)} />
      <Pressable
        testID="sell-standalone-card"
        onPress={() => sell('sale-standalone-card', undefined, { cardAmountCents: 5000, cashAmountCents: 0 })}
      />
      <Pressable
        testID="sell-standalone-mixed"
        onPress={() => sell('sale-standalone-mixed', undefined, { cardAmountCents: 1000, cashAmountCents: 4000 })}
      />
      <Pressable
        testID="sell-anonymous"
        onPress={() =>
          completeSale({
            id: 'sale-anonymous',
            businessId: 'business-test',
            payment: { cardAmountCents: 1500, cashAmountCents: 0 },
            completedAt: new Date(),
            lines: [{ id: 'sale-anonymous-1', productId: MASQUE_ID, quantity: 1 }],
          })
        }
      />
      <Pressable
        testID="sell-anonymous-again"
        onPress={() =>
          completeSale({
            id: 'sale-anonymous-2',
            businessId: 'business-test',
            payment: { cardAmountCents: 1500, cashAmountCents: 0 },
            completedAt: new Date(),
            lines: [{ id: 'sale-anonymous-2-1', productId: MASQUE_ID, quantity: 1 }],
          })
        }
      />
      <Pressable testID="sell-linked-sofia" onPress={() => sell('sale-linked-sofia', 'agenda-sofia')} />
      <Pressable
        testID="refund-standalone-card"
        onPress={() =>
          recordSaleAdjustment('sale-standalone-card', {
            id: 'refund-1',
            reason: 'WRONG_PRODUCT',
            lines: [{ saleItemId: 'sale-standalone-card-1', quantity: 1, restock: true }],
            refundCardCents: 0,
            refundCashCents: 5000,
            settlement: 'SETTLED',
            refundedAt: new Date(),
          })
        }
      />
      <Pressable testID="sell-linked-lea" onPress={() => sell('sale-linked-lea', 'agenda-lea')} />
      <Pressable
        testID="checkout-sofia"
        onPress={() => checkoutAppointment('agenda-sofia', { cardAmountCents: 9500, cashAmountCents: 0 })}
      />
      <Pressable
        testID="checkout-sofia-with-product"
        onPress={() => checkoutAppointment('agenda-sofia', { cardAmountCents: 14500, cashAmountCents: 0 })}
      />
      <Pressable
        testID="checkout-ines"
        onPress={() => checkoutAppointment('agenda-ines', { cardAmountCents: 2000, cashAmountCents: 2200 })}
      />
      <Pressable
        testID="checkout-elodie"
        onPress={() => checkoutAppointment('agenda-elodie', { cardAmountCents: 0, cashAmountCents: 4200 })}
      />
      <Pressable
        testID="edit-sofia"
        onPress={() => updateAppointmentPayment('agenda-sofia', { cardAmountCents: 3000, cashAmountCents: 6500 })}
      />
      <Pressable
        testID="deposit-sofia"
        onPress={() =>
          recordAppointmentDeposit({ id: 'deposit-sofia', appointmentId: 'agenda-sofia', amountCents: 3000, paymentMethod: 'CASH' })
        }
      />
      <Pressable testID="void-deposit-sofia" onPress={() => voidAppointmentDeposit('deposit-sofia')} />
      <Pressable
        testID="checkout-sofia-rest"
        onPress={() => checkoutAppointment('agenda-sofia', { cardAmountCents: 6500, cashAmountCents: 0 })}
      />
    </>
  );
}

function renderCashRegister(database?: SourisDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <CashRegisterScreen />
              <CheckoutProbe />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

/** Day mode reads the shared DateNavigator's date; Month mode keeps its own label. */
function periodLabel(view: Awaited<ReturnType<typeof render>>): string {
  const day = view.queryByTestId('cash-register-date');
  if (day) return day.props.children as string;
  return view.getByTestId('cash-register-period-label').props.children as string;
}

function totals(view: Awaited<ReturnType<typeof render>>) {
  const total = view.getByTestId('cash-register-total').props.children as string;
  // The period caption is spoken with the KPI: « Total encaissé aujourd’hui : 0,00 € » — the first
  // sentence; Mois may follow it with the comparison or its explanation.
  const totalLabel = (view.getByTestId('cash-register-total-card').props.accessibilityLabel as string).split('. ')[0]!;
  // Spoken « Encaissements, 2 encaissements, 1 client ».
  const [, count, clients] = (view.getByTestId('cash-register-count').props.accessibilityLabel as string).split(', ');
  return {
    total,
    card: within(view.getByTestId('cash-register-card')).getAllByText(/€/)[0]!.props.children as string,
    cash: within(view.getByTestId('cash-register-cash')).getAllByText(/€/)[0]!.props.children as string,
    count,
    clients,
    clientPill: view.getByTestId('cash-register-client-count-value').props.children as number,
    caption: totalLabel.replace(/^Total /, '').replace(` : ${total}`, ''),
    period: periodLabel(view),
  };
}

function entryRows(view: Awaited<ReturnType<typeof render>>) {
  return view.queryAllByTestId(/^cash-register-entry-(?!amount-)/);
}

describe('CashRegisterScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    mockBack.mockClear();
    mockPush.mockClear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('opens on today in Day mode with a zero register and no chart', async () => {
    const view = await renderCashRegister();

    expect(view.getByRole('header', { name: 'Caisse' })).toBeTruthy();
    expect(view.getByText('GESTION')).toBeTruthy();
    expect(view.getByLabelText('Jour').props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText('Mois').props.accessibilityState.selected).toBe(false);
    expect(totals(view)).toEqual({
      total: formatEuroCents(0),
      card: formatEuroCents(0),
      cash: formatEuroCents(0),
      count: 'Aucun encaissement',
      clients: 'Aucun client',
      clientPill: 0,
      caption: 'encaissé aujourd’hui',
      period: 'Samedi 29 août',
    });
    // The shared formatter, the same one Agenda Jour shows.
    expect(periodLabel(view)).toBe(formatNavigatorDate(new Date(2026, 7, 29)));
    expect(view.getByTestId('cash-register-today')).toBeTruthy();
    expect(view.queryByTestId('cash-register-go-to-today')).toBeNull();
    expect(view.queryByTestId(/chart/)).toBeNull();
    expect(view.queryByText(/TVA|Bénéfice|Dépenses|chiffre d’affaires/i)).toBeNull();
  });

  it('answers « how much was collected » once, with an intentional empty Encaissements section', async () => {
    const view = await renderCashRegister();

    expect(view.getByText('Total encaissé')).toBeTruthy();
    expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
      `Total encaissé aujourd’hui : ${formatEuroCents(0)}`,
    );
    // The KPI no longer repeats the period or the empty status in words.
    expect(view.queryByText('encaissé aujourd’hui')).toBeNull();
    expect(view.queryByText('Aucun encaissement')).toBeNull();
    // Card and cash share ONE grouped surface.
    const methods = view.getByTestId('cash-register-methods');
    expect(within(methods).getByTestId('cash-register-card')).toBeTruthy();
    expect(within(methods).getByTestId('cash-register-cash')).toBeTruthy();
    expect(view.getByLabelText(`Carte ${formatEuroCents(0)}`)).toBeTruthy();

    expect(view.getByText('Encaissements')).toBeTruthy();
    expect(view.getByTestId('cash-register-count').props.accessibilityLabel).toBe(
      'Encaissements, Aucun encaissement, Aucun client',
    );
    expect(view.getByTestId('cash-register-client-count-value').props.children).toBe(0);
    const empty = view.getByTestId('cash-register-empty');
    expect(within(empty).getByText('Aucun encaissement aujourd’hui')).toBeTruthy();
    expect(within(empty).getByText('Les paiements encaissés apparaîtront ici.')).toBeTruthy();
    expect(view.queryByTestId('cash-register-entries')).toBeNull();
    expect(entryRows(view)).toHaveLength(0);

    await press(view, 'cash-register-previous');
    expect(within(view.getByTestId('cash-register-empty')).getByText('Aucun encaissement ce jour')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Mois'));
    });
    expect(within(view.getByTestId('cash-register-empty')).getByText('Aucun encaissement ce mois-ci')).toBeTruthy();
    await press(view, 'cash-register-previous');
    expect(within(view.getByTestId('cash-register-empty')).getByText('Aucun encaissement ce mois')).toBeTruthy();
  });

  it('lists the payments of the selected day, oldest first, from both sources', async () => {
    const view = await renderCashRegister();
    await press(view, 'stock-products');
    jest.setSystemTime(new Date(2026, 7, 29, 10, 30));
    await press(view, 'sell-standalone-mixed');
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    await press(view, 'checkout-sofia');
    // Paid yesterday: counted on its own day only.
    jest.setSystemTime(new Date(2026, 7, 28, 18, 0));
    await press(view, 'checkout-elodie');
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));

    expect(view.queryByTestId('cash-register-empty')).toBeNull();
    expect(totals(view)).toMatchObject({ total: formatEuroCents(14500), count: '2 encaissements' });
    // Sofia paid the standalone Sale AND the checkout: one client behind two encaissements.
    expect(view.getByTestId('cash-register-count').props.accessibilityLabel).toBe(
      'Encaissements, 2 encaissements, 1 client',
    );

    const rows = entryRows(view);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'cash-register-entry-sale-standalone-mixed',
      'cash-register-entry-agenda-sofia',
    ]);

    // A standalone Sale names its source and its mixed payment, and opens its read-only detail.
    const sale = view.getByTestId('cash-register-entry-sale-standalone-mixed');
    expect(sale.props.accessibilityRole).toBe('button');
    expect(within(sale).getByText('10:30')).toBeTruthy();
    expect(within(sale).getByText('Sofia Petit')).toBeTruthy();
    expect(within(sale).getByText(/^Vente · /)).toBeTruthy();
    expect(within(sale).getByText(formatEuroCents(5000))).toBeTruthy();
    expect(within(sale).getByText('Carte + Espèces')).toBeTruthy();
    await press(view, 'cash-register-entry-sale-standalone-mixed');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sales/[saleId]',
      params: { saleId: 'sale-standalone-mixed' },
    });
    mockPush.mockClear();

    // An Appointment checkout opens the existing Appointment Details.
    const appointment = view.getByTestId('cash-register-entry-agenda-sofia');
    expect(appointment.props.accessibilityRole).toBe('button');
    expect(appointment.props.accessibilityLabel).toContain(`15:00, Sofia Petit, `);
    expect(appointment.props.accessibilityLabel).toContain(`${formatEuroCents(9500)}, Carte`);
    expect(within(appointment).getByText('Carte')).toBeTruthy();
    await press(view, 'cash-register-entry-agenda-sofia');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId: 'agenda-sofia' },
    });

    await press(view, 'cash-register-previous');
    expect(entryRows(view).map((row) => row.props.testID)).toEqual(['cash-register-entry-agenda-elodie']);
    expect(within(view.getByTestId('cash-register-entry-agenda-elodie')).getByText('Espèces')).toBeTruthy();

    // Month mode lists the whole month from the SAME selection, each row dated.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Mois'));
    });
    expect(entryRows(view).map((row) => row.props.testID)).toEqual([
      'cash-register-entry-agenda-elodie',
      'cash-register-entry-sale-standalone-mixed',
      'cash-register-entry-agenda-sofia',
    ]);
    expect(within(view.getByTestId('cash-register-entry-agenda-elodie')).getByText('28 août')).toBeTruthy();
    expect(totals(view)).toMatchObject({ total: formatEuroCents(18700), count: '3 encaissements' });
  });

  it('sits on the app background with white total and empty cards (surface hierarchy)', async () => {
    const view = await renderCashRegister();

    expect(StyleSheet.flatten(view.getByTestId('cash-register-screen').props.style).backgroundColor).toBe(
      semanticColors.screen,
    );
    expect(StyleSheet.flatten(view.getByTestId('cash-register-total-card').props.style).backgroundColor).toBe(
      semanticColors.surfaceElevated,
    );
    expect(StyleSheet.flatten(view.getByTestId('cash-register-empty').props.style).backgroundColor).toBe(
      semanticColors.surfaceElevated,
    );
  });

  it('carries the decorative cash-register watermark, hidden from accessibility and touches', async () => {
    const view = await renderCashRegister();

    expect(view.queryByTestId('screen-watermark-cashRegister')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-cashRegister', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
    // Kept as a signature, quieter than on the main screens.
    expect(StyleSheet.flatten(watermark.props.style).opacity).toBeLessThan(watermarkTheme.opacity);
    expect(view.getByRole('header', { name: 'Caisse' })).toBeTruthy();
  });

  it('aggregates Appointment checkouts and standalone Sale payments, never a linked Sale twice', async () => {
    const view = await renderCashRegister();
    await press(view, 'stock-products');

    // Appointment: services 95 € + linked product 50 € → the professional records 145 € once.
    await press(view, 'sell-linked-sofia');
    await act(async () => {
      fireEvent.press(view.getByTestId('checkout-sofia-with-product'));
    });
    expect(totals(view)).toMatchObject({ total: formatEuroCents(14500), count: '1 encaissement' });

    await press(view, 'sell-standalone-card');
    await press(view, 'sell-standalone-mixed');

    expect(totals(view)).toMatchObject({
      total: formatEuroCents(24500),
      card: formatEuroCents(20500),
      cash: formatEuroCents(4000),
      count: '3 encaissements',
    });
  });

  it('shows the explicit checkouts of the day, split by card and cash, and updates after a correction', async () => {
    const view = await renderCashRegister();

    await press(view, 'checkout-sofia');
    await press(view, 'checkout-ines');

    expect(totals(view)).toMatchObject({
      total: formatEuroCents(13700),
      card: formatEuroCents(11500),
      cash: formatEuroCents(2200),
      count: '2 encaissements',
    });

    await press(view, 'edit-sofia');

    expect(totals(view)).toMatchObject({
      total: formatEuroCents(13700),
      card: formatEuroCents(5000),
      cash: formatEuroCents(8700),
      count: '2 encaissements',
    });
  });

  it('navigates to previous and next days by local civil date and comes back to today', async () => {
    const view = await renderCashRegister();
    await press(view, 'checkout-sofia');
    // A checkout recorded yesterday evening on an automatically completed appointment.
    jest.setSystemTime(new Date(2026, 7, 28, 23, 45));
    await press(view, 'checkout-elodie');
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));

    expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), period: 'Samedi 29 août' });

    await press(view, 'cash-register-previous');
    expect(totals(view)).toMatchObject({
      total: formatEuroCents(4200),
      card: formatEuroCents(0),
      cash: formatEuroCents(4200),
      count: '1 encaissement',
      caption: 'encaissé ce jour',
      period: 'Vendredi 28 août',
    });
    expect(view.queryByTestId('cash-register-today')).toBeNull();
    expect(view.getByTestId('cash-register-go-to-today')).toBeTruthy();

    await press(view, 'cash-register-previous');
    expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Jeudi 27 août' });

    await press(view, 'cash-register-go-to-today');
    expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), period: 'Samedi 29 août' });

    await press(view, 'cash-register-next');
    expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Dimanche 30 août' });
  });

  describe('month calendar', () => {
    const calendarMonth = (view: Awaited<ReturnType<typeof render>>) =>
      view.getByTestId('cash-register-month-calendar-month').props.children as string;
    const day = (id: string) => `cash-register-month-calendar-day-${id}`;
    const intensityOf = (view: Awaited<ReturnType<typeof render>>, id: string) =>
      view.queryAllByTestId(new RegExp(`^${day(id)}-intensity-`)).map((node) => node.props.testID.split('-').pop());
    const pickDay = async (view: Awaited<ReturnType<typeof render>>, id: string) => {
      await press(view, day(id));
      await settleSheetTransition();
    };

    /** 29 Aug: 6 500 + 5 000 · 28 Aug: 4 000 · 22 Aug: 3 000 deposit · 15 Aug: 5 000 · 20 Aug: linked Sale only. */
    async function recordAugust(view: Awaited<ReturnType<typeof render>>) {
      await press(view, 'stock-products');
      jest.setSystemTime(new Date(2026, 7, 15, 10, 0));
      await press(view, 'sell-standalone-card');
      jest.setSystemTime(new Date(2026, 7, 20, 10, 0));
      // Sold during an Appointment: its checkout records the money, never the Sale.
      await press(view, 'sell-linked-lea');
      jest.setSystemTime(new Date(2026, 7, 22, 11, 0));
      await press(view, 'deposit-sofia');
      // Checked out just before local midnight: still the 28th.
      jest.setSystemTime(new Date(2026, 7, 28, 23, 45));
      await press(view, 'checkout-elodie');
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      await press(view, 'checkout-sofia-rest');
      await press(view, 'sell-standalone-mixed');
    }

    it('replaces the date wheel: the date and the calendar button open the month of the selected day', async () => {
      const view = await renderCashRegister();
      await press(view, 'cash-register-previous');
      await press(view, 'cash-register-previous');
      expect(totals(view).period).toBe('Jeudi 27 août');

      const date = view.getByTestId('cash-register-date-button');
      expect(date.props.accessibilityRole).toBe('button');
      await press(view, 'cash-register-date-button');

      expect(view.getByTestId('cash-register-month-calendar')).toBeTruthy();
      expect(calendarMonth(view)).toBe('Août 2026');
      expect(view.getByTestId(day('2026-08-27')).props.accessibilityState).toEqual({ selected: true });
      expect(view.getByTestId(day('2026-08-29')).props.accessibilityLabel).toBe('Samedi 29 août, aujourd’hui');
      // The shared glass month arrows, not a Caisse copy.
      expect(view.getByTestId('cash-register-month-calendar-navigation-previous').props.accessibilityLabel).toBe(
        'Mois précédent',
      );
      expect(view.getByTestId('cash-register-month-calendar-navigation-next').props.accessibilityLabel).toBe(
        'Mois suivant',
      );
      // No wheel, no « CAISSE DU » eyebrow, no confirmation.
      expect(view.queryByTestId('cash-register-day-picker')).toBeNull();
      expect(view.queryByText('CAISSE DU')).toBeNull();
      expect(view.queryByText(/valider|confirmer/i)).toBeNull();

      await press(view, 'cash-register-month-calendar-navigation-next');
      expect(calendarMonth(view)).toBe('Septembre 2026');
      // Browsing is not selecting.
      expect(totals(view).period).toBe('Jeudi 27 août');
    });

    it('opens the same calendar from the calendar button', async () => {
      const view = await renderCashRegister();

      await press(view, 'cash-register-calendar');
      expect(calendarMonth(view)).toBe('Août 2026');
      expect(view.getByTestId(day('2026-08-29')).props.accessibilityState).toEqual({ selected: true });
    });

    it('jumps to a tapped day, closes, and the arrows continue from it — adjacent-month days included', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      jest.setSystemTime(new Date(2026, 7, 3, 11, 0));
      await press(view, 'sell-standalone-mixed');
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));

      await press(view, 'cash-register-date-button');
      await pickDay(view, '2026-08-03');

      expect(view.queryByTestId('cash-register-month-calendar')).toBeNull();
      expect(totals(view)).toMatchObject({
        total: formatEuroCents(5000),
        card: formatEuroCents(1000),
        cash: formatEuroCents(4000),
        period: 'Lundi 3 août',
        caption: 'encaissé ce jour',
      });
      await press(view, 'cash-register-next');
      expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Mardi 4 août' });

      // 1 August 2026 is a Saturday: the grid opens on Monday 27 July, a real date.
      await press(view, 'cash-register-date-button');
      expect(calendarMonth(view)).toBe('Août 2026');
      await pickDay(view, '2026-07-27');
      expect(totals(view).period).toBe('Lundi 27 juil.');
      await press(view, 'cash-register-previous');
      expect(totals(view).period).toBe('Dimanche 26 juil.');

      await press(view, 'cash-register-go-to-today');
      expect(totals(view)).toMatchObject({ period: 'Samedi 29 août', caption: 'encaissé aujourd’hui' });
    });

    it('leaves the selected day and its totals unchanged when closed without a tap', async () => {
      const view = await renderCashRegister();
      await press(view, 'checkout-sofia');

      await press(view, 'cash-register-calendar');
      await press(view, 'cash-register-month-calendar-navigation-previous');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Fermer le calendrier'));
      });
      await settleSheetTransition();

      expect(view.queryByTestId('cash-register-month-calendar')).toBeNull();
      expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), period: 'Samedi 29 août' });
    });

    it('haloes each paying day relative to the best day of the month, never writing an amount', async () => {
      const view = await renderCashRegister();
      await recordAugust(view);

      await press(view, 'cash-register-date-button');
      // Best day 11 500 → high; 5 000 and 4 200 are above a third → medium; 3 000 is below → low.
      expect(intensityOf(view, '2026-08-29')).toEqual(['high']);
      expect(intensityOf(view, '2026-08-15')).toEqual(['medium']);
      expect(intensityOf(view, '2026-08-28')).toEqual(['medium']);
      expect(intensityOf(view, '2026-08-22')).toEqual(['low']);
      // A linked Sale alone, and a day without payment, are plain days.
      expect(intensityOf(view, '2026-08-20')).toEqual([]);
      expect(intensityOf(view, '2026-08-21')).toEqual([]);
      expect(
        StyleSheet.flatten(view.getByTestId(`${day('2026-08-29')}-intensity-high`).props.style).backgroundColor,
      ).toBe(calendarIntensity.high);
      expect(within(view.getByTestId(day('2026-08-29'))).queryAllByText(/€/)).toHaveLength(0);
      // Revenue is never an Agenda dot.
      expect(view.queryAllByTestId(/-dot$/)).toHaveLength(0);

      // Spoken with the actual amount; the selected best day stays the selected day.
      expect(view.getByTestId(day('2026-08-29')).props.accessibilityLabel).toBe(
        'Samedi 29 août, aujourd’hui, 115 euros encaissés',
      );
      expect(view.getByTestId(day('2026-08-29')).props.accessibilityState).toEqual({ selected: true });
      expect(view.getByTestId(day('2026-08-22')).props.accessibilityLabel).toBe('Samedi 22 août, 30 euros encaissés');
      expect(view.getByTestId(day('2026-08-20')).props.accessibilityLabel).toBe('Jeudi 20 août');

      // Next month has no payment: the plain calendar, no message.
      await press(view, 'cash-register-month-calendar-navigation-next');
      expect(view.queryAllByTestId(/-intensity-/)).toHaveLength(0);
      await press(view, 'cash-register-month-calendar-navigation-previous');
      await press(view, 'cash-register-month-calendar-navigation-previous');
      expect(calendarMonth(view)).toBe('Juillet 2026');
      expect(view.queryAllByTestId(/-intensity-/)).toHaveLength(0);
      expect(view.getByTestId(day('2026-08-01'))).toBeTruthy();
    });

    it('announces on every day exactly the total its daily detail shows', async () => {
      const view = await renderCashRegister();
      await recordAugust(view);

      const expected: Record<string, number> = {
        '2026-08-15': 5000,
        '2026-08-20': 0,
        '2026-08-22': 3000,
        '2026-08-28': 4200,
        '2026-08-29': 11500,
      };
      for (const [id, cents] of Object.entries(expected)) {
        await press(view, 'cash-register-date-button');
        const label = view.getByTestId(day(id)).props.accessibilityLabel as string;
        await pickDay(view, id);

        expect(totals(view).total).toBe(formatEuroCents(cents));
        if (cents === 0) expect(label).not.toMatch(/encaiss/);
        else expect(label).toMatch(new RegExp(`, ${cents / 100} euros encaissés$`));
      }
    });

    it('recalculates the scale for the displayed month; adjacent days are spoken, never haloed', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      jest.setSystemTime(new Date(2026, 6, 10, 10, 0));
      await press(view, 'checkout-elodie');
      jest.setSystemTime(new Date(2026, 7, 3, 11, 0));
      await press(view, 'sell-standalone-mixed');
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      await press(view, 'checkout-sofia');

      // August: 9 500 is the best day; 5 000 is above a third of it.
      await press(view, 'cash-register-date-button');
      expect(intensityOf(view, '2026-08-29')).toEqual(['high']);
      expect(intensityOf(view, '2026-08-03')).toEqual(['medium']);

      // July: 4 000, alone in its month, is July's best day.
      await press(view, 'cash-register-month-calendar-navigation-previous');
      expect(intensityOf(view, '2026-07-10')).toEqual(['high']);
      // 3 August trails the July grid: muted, no halo, its amount still spoken.
      expect(intensityOf(view, '2026-08-03')).toEqual([]);
      expect(view.queryAllByTestId(/-intensity-/)).toHaveLength(1);
      expect(view.getByTestId(day('2026-08-03')).props.accessibilityLabel).toBe('Lundi 3 août, 50 euros encaissés');
    });
  });

  describe('heatmap hint', () => {
    const HINT = 'cash-register-heatmap-hint';
    const calendarMonth = (view: Awaited<ReturnType<typeof render>>) =>
      view.getByTestId('cash-register-month-calendar-month').props.children as string;
    const seen = (db: SourisDatabase) => readMetadata(db, CASH_REGISTER_HEATMAP_HINT_SEEN_KEY);
    /** Lets the card's exit finish: it stays mounted while it leaves. */
    const settleHintExit = async () => {
      await act(async () => {
        jest.advanceTimersByTime(HEATMAP_HINT_MOTION.exit.duration + 40);
      });
    };
    const closeCalendar = async (view: Awaited<ReturnType<typeof render>>) => {
      await act(async () => {
        fireEvent.press(view.getByLabelText('Fermer le calendrier'));
      });
      await settleSheetTransition();
    };

    it('explains the halos on the first opening, relative to the month, without marking anything seen', async () => {
      const db = openTestDatabase();
      const view = await renderCashRegister(db);
      // The day detail alone never marks the hint seen.
      await press(view, 'cash-register-next');
      expect(view.queryByTestId(HINT)).toBeNull();
      expect(seen(db)).toBeUndefined();

      await press(view, 'cash-register-date-button');

      const hint = view.getByTestId(HINT);
      expect(within(view.getByTestId('cash-register-month-calendar-overlay')).getByTestId(HINT)).toBe(hint);
      expect(view.getByRole('header', { name: 'Intensité du chiffre d’affaires' })).toBeTruthy();
      expect(view.getByTestId(`${HINT}-body`).props.children).toBe(
        'Plus la teinte est soutenue, plus le chiffre d’affaires de cette journée est élevé par rapport aux autres jours du mois.',
      );
      expect(view.getByTestId(`${HINT}-legend`).props.accessibilityLabel).toBe('Légende : faible, moyen, élevé');
      for (const label of ['Faible', 'Moyen', 'Élevé']) expect(within(hint).getByText(label)).toBeTruthy();
      expect(within(hint).queryByText(/€|euro/)).toBeNull();
      expect(view.getByRole('button', { name: 'Compris' })).toBeTruthy();
      // The month navigation stays uncovered and usable.
      expect(view.getByTestId('cash-register-month-calendar-navigation')).toBeTruthy();
      // Mounting the card wrote nothing.
      expect(seen(db)).toBeUndefined();
    });

    it('« Compris » hides the card only and remembers it on this device', async () => {
      const db = openTestDatabase();
      const view = await renderCashRegister(db);
      await press(view, 'cash-register-previous');
      await press(view, 'cash-register-date-button');
      await press(view, 'cash-register-month-calendar-navigation-next');
      expect(calendarMonth(view)).toBe('Septembre 2026');

      await press(view, `${HINT}-dismiss`);

      // The exit plays first: the same card, no longer tappable, then gone.
      expect(view.getByTestId(`${HINT}-reveal`).props.pointerEvents).toBe('none');
      await settleHintExit();
      expect(view.queryByTestId(HINT)).toBeNull();
      expect(view.getByTestId('cash-register-month-calendar')).toBeTruthy();
      expect(calendarMonth(view)).toBe('Septembre 2026');
      expect(totals(view).period).toBe('Vendredi 28 août');
      expect(seen(db)).toBe('1');

      // Closed and reopened: it never shows by itself again.
      await closeCalendar(view);
      await press(view, 'cash-register-date-button');
      expect(view.queryByTestId(HINT)).toBeNull();
      expect(calendarMonth(view)).toBe('Août 2026');
    });

    it('comes back on the next opening when the calendar was closed before « Compris »', async () => {
      const db = openTestDatabase();
      const view = await renderCashRegister(db);

      await press(view, 'cash-register-calendar');
      expect(view.getByTestId(HINT)).toBeTruthy();
      await closeCalendar(view);
      expect(seen(db)).toBeUndefined();

      await press(view, 'cash-register-calendar');
      expect(view.getByTestId(HINT)).toBeTruthy();
    });

    it('reopens from the discreet info control, without resetting the seen flag', async () => {
      const db = openTestDatabase();
      const view = await renderCashRegister(db);
      await press(view, 'cash-register-date-button');
      await press(view, `${HINT}-dismiss`);
      await settleHintExit();

      const info = view.getByTestId('cash-register-heatmap-info');
      expect(info.props.accessibilityRole).toBe('button');
      expect(info.props.accessibilityLabel).toBe('À propos des couleurs du chiffre d’affaires');
      // Not a month arrow: outside the glass navigation row.
      expect(within(view.getByTestId('cash-register-month-calendar-navigation')).queryByTestId('cash-register-heatmap-info')).toBeNull();

      await press(view, 'cash-register-heatmap-info');
      // The same reveal wrapper as the first opening.
      expect(view.getByTestId(`${HINT}-reveal`).props.pointerEvents).toBe('auto');
      expect(view.getByRole('header', { name: 'Intensité du chiffre d’affaires' })).toBeTruthy();
      await press(view, `${HINT}-dismiss`);
      await settleHintExit();
      expect(view.queryByTestId(HINT)).toBeNull();
      expect(view.getByTestId('cash-register-month-calendar')).toBeTruthy();
      expect(seen(db)).toBe('1');
    });

    it('never stacks cards under fast repeated taps', async () => {
      const db = openTestDatabase();
      const view = await renderCashRegister(db);
      await press(view, 'cash-register-date-button');

      await press(view, `${HINT}-dismiss`);
      await press(view, `${HINT}-dismiss`);
      expect(view.getAllByTestId(HINT)).toHaveLength(1);
      await settleHintExit();
      expect(view.queryByTestId(HINT)).toBeNull();
      expect(seen(db)).toBe('1');

      await press(view, 'cash-register-heatmap-info');
      await press(view, 'cash-register-heatmap-info');
      await press(view, 'cash-register-heatmap-info');
      expect(view.getAllByTestId(HINT)).toHaveLength(1);

      // Reopened while leaving: the same card turns back, still one.
      await press(view, `${HINT}-dismiss`);
      await press(view, 'cash-register-heatmap-info');
      await settleHintExit();
      expect(view.getAllByTestId(HINT)).toHaveLength(1);
      expect(view.getByTestId(`${HINT}-reveal`).props.pointerEvents).toBe('auto');
    });
  });

  it('sums the calendar month from both sources in Month mode and navigates by month', async () => {
    const view = await renderCashRegister();
    await press(view, 'stock-products');
    await press(view, 'checkout-sofia');
    jest.setSystemTime(new Date(2026, 7, 1, 10, 0));
    await press(view, 'checkout-elodie');
    jest.setSystemTime(new Date(2026, 7, 15, 10, 0));
    await press(view, 'sell-standalone-card');
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));

    await act(async () => {
      fireEvent.press(view.getByLabelText('Mois'));
    });

    expect(view.getByLabelText('Mois').props.accessibilityState.selected).toBe(true);
    // Month mode keeps its own navigation: no shared day navigator, no calendar.
    expect(view.queryByTestId('cash-register-date')).toBeNull();
    expect(view.queryByTestId('cash-register-calendar')).toBeNull();
    expect(totals(view)).toMatchObject({
      total: formatEuroCents(18700),
      card: formatEuroCents(14500),
      cash: formatEuroCents(4200),
      count: '3 encaissements',
      caption: 'encaissé ce mois-ci',
      period: 'Août 2026',
    });
    expect(view.queryByTestId('cash-register-current')).toBeNull();
    expect(view.getByTestId('cash-register-this-month')).toBeTruthy();

    await press(view, 'cash-register-previous');
    expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Juillet 2026', caption: 'encaissé ce mois' });
    expect(view.getByRole('button', { name: 'Revenir à ce mois-ci' })).toBe(view.getByTestId('cash-register-current'));
    expect(view.queryByTestId('cash-register-this-month')).toBeNull();

    await press(view, 'cash-register-current');
    expect(totals(view)).toMatchObject({ total: formatEuroCents(18700), period: 'Août 2026' });

    await press(view, 'cash-register-next');
    expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Septembre 2026' });
  });

  it('never counts automatically completed appointments without a checkout, nor Sales without payment', async () => {
    const view = await renderCashRegister();
    await press(view, 'stock-products');
    await press(view, 'sell-linked-sofia');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Mois'));
    });

    // The development seed holds previous-day fixtures already COMPLETED by reconciliation.
    expect(totals(view)).toMatchObject({ total: formatEuroCents(0), count: 'Aucun encaissement' });
  });

  it('navigates with the shared glass controls, labelled for the mode, one period per press', async () => {
    const view = await renderCashRegister();

    // Day mode renders through the shared DateNavigator, calendar included.
    expect(view.getByRole('button', { name: 'Choisir une date' })).toBe(view.getByTestId('cash-register-calendar'));

    for (const testID of ['cash-register-previous', 'cash-register-calendar', 'cash-register-next']) {
      const arrow = view.getByTestId(testID);
      expect(arrow.props.accessibilityRole).toBe('button');
      expect(StyleSheet.flatten(arrow.props.style)).toMatchObject({
        borderRadius: glassIconButtonSize / 2,
        height: glassIconButtonSize,
        width: glassIconButtonSize,
      });
      expect(within(arrow).getByTestId('glass-surface', { includeHiddenElements: true })).toBeTruthy();
    }
    // Each arrow is the only button answering to its label: no wrapper doubles the interaction.
    expect(view.getAllByRole('button', { name: 'Jour précédent' })).toHaveLength(1);
    expect(view.getAllByRole('button', { name: 'Jour suivant' })).toHaveLength(1);

    await press(view, 'cash-register-next');
    expect(totals(view).period).toBe('Dimanche 30 août');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Mois'));
    });

    expect(view.queryByLabelText('Jour précédent')).toBeNull();
    expect(view.getByTestId('cash-register-previous').props.accessibilityLabel).toBe('Mois précédent');
    expect(view.getByTestId('cash-register-next').props.accessibilityLabel).toBe('Mois suivant');

    await press(view, 'cash-register-previous');
    expect(totals(view).period).toBe('Juillet 2026');
  });

  it('returns through the back control', async () => {
    const view = await renderCashRegister();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Retour'));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  describe('distinct paying clients', () => {
    it('shows a second compact counter « Clients » after the Encaissements count, zero included', async () => {
      const view = await renderCashRegister();

      const header = view.getByTestId('cash-register-count');
      const counter = within(header).getByTestId('cash-register-client-count');
      expect(within(counter).getByText('Clients')).toBeTruthy();
      expect(within(counter).getByTestId('cash-register-client-count-value').props.children).toBe(0);
      // Both pills share one geometry; the header wraps rather than truncating on narrow phones.
      const pills = within(header)
        .getAllByText('0')
        .map((figure) => StyleSheet.flatten(figure.parent!.props.style));
      expect(pills).toHaveLength(2);
      expect(pills[1]).toEqual(pills[0]);
      expect(StyleSheet.flatten(within(header).getByText('Encaissements').parent!.props.style)).toMatchObject({
        flexWrap: 'wrap',
      });
      expect(totals(view)).toMatchObject({ count: 'Aucun encaissement', clients: 'Aucun client', clientPill: 0 });
    });

    it('counts a client once across a service checkout, a deposit and a product purchase', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await press(view, 'deposit-sofia');
      await press(view, 'checkout-sofia-rest');
      await press(view, 'sell-standalone-card');

      expect(totals(view)).toMatchObject({
        total: formatEuroCents(14500),
        count: '3 encaissements',
        clients: '1 client',
        clientPill: 1,
      });
    });

    it('counts each distinct client, never an anonymous Sale, and keeps the transaction count', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await press(view, 'checkout-sofia');
      await press(view, 'checkout-ines');
      await press(view, 'checkout-elodie');
      await press(view, 'sell-standalone-mixed');
      await press(view, 'sell-anonymous');

      expect(totals(view)).toMatchObject({
        total: formatEuroCents(9500 + 4200 + 4200 + 5000 + 1500),
        count: '5 encaissements',
        clients: '3 clients',
        clientPill: 3,
      });
      expect(view.getByTestId('cash-register-count').props.accessibilityLabel).toBe(
        'Encaissements, 5 encaissements, 3 clients',
      );
    });

    it('follows the selected day and month', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      // Sofia: a product purchase last month, then her checkout today.
      jest.setSystemTime(new Date(2026, 6, 31, 18, 0));
      await press(view, 'sell-standalone-card');
      jest.setSystemTime(new Date(2026, 7, 28, 18, 0));
      await press(view, 'checkout-elodie');
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      await press(view, 'checkout-sofia');

      expect(totals(view)).toMatchObject({ count: '1 encaissement', clients: '1 client', clientPill: 1 });
      await press(view, 'cash-register-previous');
      expect(totals(view)).toMatchObject({ count: '1 encaissement', clients: '1 client', clientPill: 1 });

      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });
      expect(totals(view)).toMatchObject({ count: '2 encaissements', clients: '2 clients', clientPill: 2 });
      // July: Sofia alone again — the same person, counted in her own month.
      await press(view, 'cash-register-previous');
      expect(totals(view)).toMatchObject({ count: '1 encaissement', clients: '1 client', clientPill: 1 });
    });

    it('a VOIDED deposit identifies nobody, like the money it no longer counts', async () => {
      const view = await renderCashRegister();
      await press(view, 'deposit-sofia');
      expect(totals(view)).toMatchObject({ count: '1 encaissement', clients: '1 client' });

      await press(view, 'void-deposit-sofia');
      expect(totals(view)).toMatchObject({ count: 'Aucun encaissement', clients: 'Aucun client', clientPill: 0 });
    });
  });

  describe('deposits', () => {
    it('counts a deposit on the day it was received, on its own method, as an « Acompte » entry', async () => {
      const view = await renderCashRegister();

      await press(view, 'deposit-sofia');

      expect(totals(view)).toMatchObject({
        total: formatEuroCents(3000),
        card: formatEuroCents(0),
        cash: formatEuroCents(3000),
        count: '1 encaissement',
      });
      const row = view.getByTestId('cash-register-entry-deposit-sofia');
      expect(within(row).getByText(/^Acompte · /)).toBeTruthy();
      expect(view.getByTestId('cash-register-entry-amount-deposit-sofia').props.children).toBe(formatEuroCents(3000));
      expect(row.props.accessibilityLabel).toContain('Acompte');

      // It opens the Appointment it was paid for.
      await press(view, 'cash-register-entry-deposit-sofia');
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'agenda-sofia' },
      });
    });

    it('the final checkout adds only the remaining money: 30 € + 65 € = 95 €, never 125 €', async () => {
      const view = await renderCashRegister();

      await press(view, 'deposit-sofia');
      await press(view, 'checkout-sofia-rest');

      expect(totals(view)).toMatchObject({
        total: formatEuroCents(9500),
        card: formatEuroCents(6500),
        cash: formatEuroCents(3000),
        count: '2 encaissements',
      });
      expect(entryRows(view)).toHaveLength(2);
    });

    it('a VOIDED deposit counts nowhere', async () => {
      const view = await renderCashRegister();

      await press(view, 'deposit-sofia');
      await press(view, 'void-deposit-sofia');

      expect(totals(view)).toMatchObject({ total: formatEuroCents(0), count: 'Aucun encaissement' });
      expect(view.queryByTestId('cash-register-entry-deposit-sofia')).toBeNull();
    });
  });

  describe('comparisons and products', () => {
    const NOW = new Date(2026, 7, 29, 15, 0);

    /** Records money at `at` through a probe, then comes back to the fake « now ». */
    async function collectAt(view: Awaited<ReturnType<typeof render>>, at: Date, probe: string) {
      jest.setSystemTime(at);
      await press(view, probe);
      jest.setSystemTime(NOW);
    }

    function badgeFill(view: Awaited<ReturnType<typeof render>>, testID: string) {
      return StyleSheet.flatten(view.getByTestId(testID).props.style).backgroundColor;
    }

    it('Jour keeps the compact card: no comparison, and no products card without a product sold', async () => {
      const view = await renderCashRegister();
      await press(view, 'checkout-sofia');

      expect(view.queryByTestId('cash-register-trends')).toBeNull();
      expect(view.queryByTestId('cash-register-products')).toBeNull();
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé aujourd’hui : ${formatEuroCents(9500)}`,
      );
    });

    it('the « Produits vendus » card opens the sale history on the period the Caisse shows', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await press(view, 'sell-standalone-card');

      // Jour: the selected day.
      await press(view, 'cash-register-previous');
      await press(view, 'cash-register-next');
      await press(view, 'cash-register-products-open');
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: '/sales',
        params: { period: 'day', date: '2026-08-29' },
      });

      // Mois: the 1st of the selected month, a month back.
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });
      await press(view, 'cash-register-previous');
      // July sold nothing and has no unit trend: no card, no entry point to an empty history.
      expect(view.queryByTestId('cash-register-products')).toBeNull();
      await press(view, 'cash-register-next');
      await press(view, 'cash-register-products-open');
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: '/sales',
        params: { period: 'month', date: '2026-08-01' },
      });
      // The totals are exactly what they were: the history changes nothing here.
      expect(totals(view)).toMatchObject({ total: formatEuroCents(5000), count: '1 encaissement' });
    });

    it('a product refund counts NEGATIVELY on the day it happened, by its own method, opening its Sale — the sale day is unchanged', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      // Sold yesterday by card (50 €), refunded today in cash.
      jest.setSystemTime(new Date(2026, 7, 28, 11, 0));
      await press(view, 'sell-standalone-card');
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      await press(view, 'refund-standalone-card');

      expect(totals(view)).toMatchObject({
        total: formatEuroCents(-5000),
        card: formatEuroCents(0),
        cash: formatEuroCents(-5000),
        count: 'Aucun encaissement',
        clients: 'Aucun client',
      });
      const row = view.getByTestId('cash-register-entry-refund-1');
      expect(within(row).getByText(/^Remboursement · /)).toBeTruthy();
      expect(view.getByTestId('cash-register-entry-amount-refund-1').props.children).toBe(formatSignedEuroCents(-5000));
      expect(within(row).getByText('Espèces')).toBeTruthy();
      await press(view, 'cash-register-entry-refund-1');
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/sales/[saleId]', params: { saleId: 'sale-standalone-card' } });
      expect(view.getByTestId('cash-register-products-refunds-value').props.children).toBe(formatSignedEuroCents(-5000));

      // Yesterday still reads the 50 € received.
      await press(view, 'cash-register-previous');
      expect(totals(view)).toMatchObject({ total: formatEuroCents(5000), count: '1 encaissement' });
      // The month nets to zero.
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });
      expect(totals(view)).toMatchObject({ total: formatEuroCents(0), count: '1 encaissement' });
    });

    it('Mois compares the month to date with the same elapsed span of the previous month, written and spoken', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      // Recorded since 1 June (50 €); 50 € on 10 July, inside 1 → 29 July 15:00; 95 € in August.
      await collectAt(view, new Date(2026, 5, 1, 10, 0), 'sell-standalone-card');
      await collectAt(view, new Date(2026, 6, 10, 10, 0), 'sell-standalone-mixed');
      await press(view, 'checkout-sofia');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });

      expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), count: '1 encaissement' });
      // (95 − 50) / 50: a rise, on the mint tone, glyph and figure written.
      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toMatch(/^\+90,0\s%$/);
      expect(view.getByTestId('cash-register-trend-reference').props.children).toBe('vs 1er–29 juil.');
      expect(badgeFill(view, 'cash-register-trend-badge')).toBe(statePillTones.positive.fill);
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toMatch(
        new RegExp(
          `^Total encaissé ce mois-ci : ${formatEuroCents(9500)}\\. En hausse de 90,0\\s% par rapport à la période du 1er au 29 juillet$`,
        ),
      );
      // Nothing recorded in August 2025: no year-over-year line, no placeholder.
      expect(view.queryByTestId('cash-register-trend-year')).toBeNull();
      // The existing figures are untouched.
      expect(view.getByTestId('cash-register-count').props.accessibilityLabel).toBe(
        'Encaissements, 1 encaissement, 1 client',
      );

      // July, completed, against the whole of June: 50 € against 50 €.
      await press(view, 'cash-register-previous');
      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toBe('Stable');
      expect(view.getByTestId('cash-register-trend-reference').props.children).toBe('vs juin');
      expect(badgeFill(view, 'cash-register-trend-badge')).toBe(statePillTones.neutral.fill);
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois : ${formatEuroCents(5000)}. Stable par rapport à juin`,
      );

      // June against May: nothing was recorded before 1 June, so no trend is claimed — and the
      // month, which collected money, says why in one quiet sentence.
      await press(view, 'cash-register-previous');
      expect(totals(view)).toMatchObject({ total: formatEuroCents(5000) });
      expect(view.queryByTestId('cash-register-trend')).toBeNull();
      expect(view.getByTestId('cash-register-comparison-note-text').props.children).toBe(
        'Historique insuffisant pour comparer avec mai',
      );
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois : ${formatEuroCents(5000)}. Historique insuffisant pour comparer avec mai`,
      );
    });

    it('explains an uncovered previous month once there is money, and stays silent on empty history', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      // A business that started recording on 10 July: July holds 50 €, August 95 €.
      await collectAt(view, new Date(2026, 6, 10, 10, 0), 'sell-standalone-card');
      await press(view, 'checkout-sofia');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });

      // August against 1 → 29 July: the history begins on the 10th, after the span's first day, so
      // July's 50 € is not a known baseline. No invented growth: a quiet explanation, no badge.
      expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), count: '1 encaissement' });
      expect(view.queryByTestId('cash-register-trend')).toBeNull();
      expect(view.queryByTestId('cash-register-trend-year')).toBeNull();
      const note = view.getByTestId('cash-register-comparison-note');
      expect(within(note).getByText('Historique insuffisant pour comparer avec juillet')).toBeTruthy();
      // Quiet metadata, soft colour, wrapping sentence next to a glyph pinned to its first line.
      const text = view.getByTestId('cash-register-comparison-note-text');
      expect(StyleSheet.flatten(text.props.style)).toMatchObject({ color: foregroundSoft, flex: 1 });
      expect(StyleSheet.flatten(note.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start' });
      expect(view.queryByText(/⚠|Attention/)).toBeNull();
      // Spoken with the total by VoiceOver / TalkBack; the card stays the one accessible element.
      expect(view.getByTestId('cash-register-total-card').props.accessible).toBe(true);
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois-ci : ${formatEuroCents(9500)}. Historique insuffisant pour comparer avec juillet`,
      );
      // The existing figures are untouched.
      expect(totals(view)).toMatchObject({ clients: '1 client', clientPill: 1 });

      // July (50 €) against June: uncovered too, named correctly.
      await press(view, 'cash-register-previous');
      expect(view.getByTestId('cash-register-comparison-note-text').props.children).toBe(
        'Historique insuffisant pour comparer avec juin',
      );

      // June, May…: empty months before the history began say nothing — no repeated message.
      await press(view, 'cash-register-previous');
      expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Juin 2026' });
      expect(view.queryByTestId('cash-register-trends')).toBeNull();
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois : ${formatEuroCents(0)}`,
      );
      await press(view, 'cash-register-previous');
      expect(view.queryByTestId('cash-register-trends')).toBeNull();

      // A future month compares nothing and explains nothing either.
      await press(view, 'cash-register-current');
      await press(view, 'cash-register-next');
      expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Septembre 2026' });
      expect(view.queryByTestId('cash-register-trends')).toBeNull();
    });

    it('two covered empty months compare nothing and explain nothing', async () => {
      const view = await renderCashRegister();
      // Recorded since 1 May: a deposit taken and voided the same day — a trace, no money.
      await collectAt(view, new Date(2026, 4, 1, 10, 0), 'deposit-sofia');
      await collectAt(view, new Date(2026, 4, 1, 10, 5), 'void-deposit-sofia');
      await press(view, 'checkout-sofia');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });

      // August (95 €) against July (0 €, covered): the change itself.
      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toBe(`+${formatEuroCents(9500)}`);
      expect(view.queryByTestId('cash-register-comparison-note')).toBeNull();
      // July (0) against June (0), June (0) against May (0): nothing to compare, nothing to explain.
      await press(view, 'cash-register-previous');
      expect(view.queryByTestId('cash-register-trends')).toBeNull();
      await press(view, 'cash-register-previous');
      expect(view.queryByTestId('cash-register-trends')).toBeNull();
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois : ${formatEuroCents(0)}`,
      );
    });

    it('on the 31st against a 30-day month, names the missing day rather than the history', async () => {
      // Friday 31 July 2026: June has no 31st.
      jest.setSystemTime(new Date(2026, 6, 31, 15, 0));
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await press(view, 'sell-standalone-card');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });

      expect(totals(view)).toMatchObject({ total: formatEuroCents(5000), period: 'Juillet 2026' });
      expect(view.queryByTestId('cash-register-trend')).toBeNull();
      expect(view.getByTestId('cash-register-comparison-note-text').props.children).toBe(
        'Pas de 31 juin : comparaison indisponible aujourd’hui',
      );
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois-ci : ${formatEuroCents(5000)}. Pas de 31 juin : comparaison indisponible aujourd’hui`,
      );
      // Jour is untouched by any of this.
      await act(async () => {
        fireEvent.press(view.getByLabelText('Jour'));
      });
      expect(view.queryByTestId('cash-register-trends')).toBeNull();
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé aujourd’hui : ${formatEuroCents(5000)}`,
      );
    });

    it('shows a fall on the rose tone, and the products card with its unit trend and direct sales', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await collectAt(view, new Date(2026, 5, 1, 10, 0), 'sell-standalone-card');
      // July: 50 € + 15 €, two units. August: one anonymous 15 € sale, one unit.
      await collectAt(view, new Date(2026, 6, 10, 10, 0), 'sell-standalone-mixed');
      await collectAt(view, new Date(2026, 6, 12, 10, 0), 'sell-anonymous');
      await press(view, 'sell-anonymous-again');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });

      // (15 − 65) / 65 = −76,9 %.
      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toMatch(/^−76,9\s%$/);
      expect(badgeFill(view, 'cash-register-trend-badge')).toBe(statePillTones.exception.fill);
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toMatch(
        /En baisse de 76,9\s% par rapport à la période du 1er au 29 juillet$/,
      );

      const products = view.getByTestId('cash-register-products');
      expect(within(products).getByTestId('cash-register-products-units').props.children).toBe('1 unité');
      expect(within(products).getByTestId('cash-register-products-trend-badge-value').props.children).toBe('−1');
      expect(within(products).getByTestId('cash-register-products-trend-reference').props.children).toBe(
        'vs 1er–29 juil.',
      );
      expect(within(products).getByTestId('cash-register-products-direct-value').props.children).toBe(
        formatEuroCents(1500),
      );
      // Every unit was a direct sale: no split, no Revente note.
      expect(within(products).queryByTestId('cash-register-products-split')).toBeNull();
      expect(within(products).queryByTestId('cash-register-products-note')).toBeNull();
      expect(view.getByTestId('cash-register-products-summary').props.accessibilityLabel).toBe(
        'Produits vendus, 1 unité. En baisse de 1 unité par rapport à la période du 1er au 29 juillet',
      );
      expect(view.getByTestId('cash-register-products-direct').props.accessibilityLabel).toBe(
        `Ventes directes encaissées : ${formatEuroCents(1500)}`,
      );
      // A walk-in sale is money and a unit, but identifies nobody.
      expect(totals(view)).toMatchObject({ count: '1 encaissement', clients: 'Aucun client' });
    });

    it('a zero reference shows the change itself, never a percentage', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      // Recorded since 1 June; nothing in July; 95 € in August.
      await collectAt(view, new Date(2026, 5, 1, 10, 0), 'sell-standalone-card');
      await press(view, 'checkout-sofia');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });

      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toBe(`+${formatEuroCents(9500)}`);
      expect(view.getByTestId('cash-register-total-card').props.accessibilityLabel).toBe(
        `Total encaissé ce mois-ci : ${formatEuroCents(9500)}. En hausse de ${formatEuroCents(9500)} par rapport à la période du 1er au 29 juillet`,
      );

      // July (0 €) against June (50 €): a real, covered zero.
      await press(view, 'cash-register-previous');
      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toMatch(/^−100,0\s%$/);
      expect(within(view.getByTestId('cash-register-empty')).getByText('Aucun encaissement ce mois')).toBeTruthy();
    });

    it('shows the year-over-year comparison as a quieter pill, and one tap switches both pills between percent and euros', async () => {
      const selection = jest.spyOn(haptics, 'selection');
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      // Recorded since 1 July 2025; 15 € on 10 August 2025; 50 € on 10 July 2026; 95 € in August 2026.
      await collectAt(view, new Date(2025, 6, 1, 10, 0), 'sell-standalone-card');
      await collectAt(view, new Date(2025, 7, 10, 10, 0), 'sell-anonymous');
      await collectAt(view, new Date(2026, 6, 10, 10, 0), 'sell-standalone-mixed');
      await press(view, 'checkout-sofia');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });
      // Only the toggles count from here (the segmented switch ticks too).
      selection.mockClear();

      const card = () => view.getByTestId('cash-register-total-card');
      const value = (id: string) => view.getByTestId(`${id}-badge-value`).props.children as string;

      // Percent first. Previous month (95 − 50) / 50; a year earlier (95 − 15) / 15.
      expect(value('cash-register-trend')).toMatch(/^\+90,0\s%$/);
      expect(value('cash-register-trend-year')).toMatch(/^\+533,3\s%$/);
      expect(view.getByTestId('cash-register-trend-year-reference').props.children).toBe('vs 1er–29 août 2025');
      // Both are pills; the year's is the quieter one (plain surface, soft ink), primary first.
      expect(badgeFill(view, 'cash-register-trend-badge')).toBe(statePillTones.positive.fill);
      expect(badgeFill(view, 'cash-register-trend-year-badge')).toBe(statePillTones.neutral.fill);
      expect(StyleSheet.flatten(view.getByTestId('cash-register-trend-year-badge-value').props.style).color).toBe(
        foregroundSoft,
      );
      const rows = within(view.getByTestId('cash-register-trends-toggle')).getAllByTestId(/^cash-register-trend(-year)?$/);
      expect(rows.map((row) => row.props.testID)).toEqual(['cash-register-trend', 'cash-register-trend-year']);
      // The card is the one accessible button, spoken in the display shown.
      expect(card().props.accessibilityRole).toBe('button');
      expect(card().props.accessibilityLabel).toMatch(
        new RegExp(
          `^Total encaissé ce mois-ci : ${formatEuroCents(9500)}\\. En hausse de 90,0\\s% par rapport à la période du 1er au 29 juillet\\. En hausse de 533,3\\s% par rapport à la période du 1er au 29 août 2025$`,
        ),
      );
      expect(card().props.accessibilityHint).toBe('Touchez pour afficher la variation en euros');
      // ONE quiet ⇄ cue for the card, on the primary pill only.
      expect(view.getByTestId('cash-register-trend-badge-toggle-cue')).toBeTruthy();
      expect(view.queryByTestId('cash-register-trend-year-badge-toggle-cue')).toBeNull();

      // One tap: both pills switch to euros, one light haptic.
      await press(view, 'cash-register-trends-toggle');
      expect(value('cash-register-trend')).toBe(`+${formatEuroCents(4500)}`);
      expect(value('cash-register-trend-year')).toBe(`+${formatEuroCents(8000)}`);
      expect(card().props.accessibilityLabel).toBe(
        `Total encaissé ce mois-ci : ${formatEuroCents(9500)}. En hausse de ${formatEuroCents(4500)} par rapport à la période du 1er au 29 juillet. En hausse de ${formatEuroCents(8000)} par rapport à la période du 1er au 29 août 2025`,
      );
      expect(card().props.accessibilityHint).toBe('Touchez pour afficher la variation en pourcentage');
      expect(selection).toHaveBeenCalledTimes(1);
      // The total and its caption stay as they were.
      expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), count: '1 encaissement' });

      // VoiceOver / TalkBack activate the card: back to percent.
      await act(async () => {
        fireEvent(card(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      });
      expect(value('cash-register-trend')).toMatch(/^\+90,0\s%$/);
      expect(value('cash-register-trend-year')).toMatch(/^\+533,3\s%$/);
      expect(selection).toHaveBeenCalledTimes(2);

      // « Produits vendus » keeps its own display, untouched by the total's: units first.
      expect(view.getByTestId('cash-register-products-trend-badge-value').props.children).toBe('−1');

      // July 2026 against June, covered since July 2025 and empty: 50 € against a real zero reads the
      // change itself in either display — nothing would switch, so no button.
      await press(view, 'cash-register-previous');
      expect(value('cash-register-trend')).toBe(`+${formatEuroCents(5000)}`);
      // 50 € against July 2025's 50 €: « Stable » in either display too.
      expect(value('cash-register-trend-year')).toBe('Stable');
      expect(card().props.accessibilityRole).toBeUndefined();
      expect(card().props.accessibilityHint).toBeUndefined();
      expect(view.getByTestId('cash-register-trends-toggle').props.onPress).toBeUndefined();
      expect(view.queryByTestId('cash-register-trend-badge-toggle-cue')).toBeNull();
      expect(selection).toHaveBeenCalledTimes(2);
      selection.mockRestore();
    });

    it('« Produits vendus » opens on the unit change; one tap switches it to percent and back', async () => {
      const selection = jest.spyOn(haptics, 'selection');
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await collectAt(view, new Date(2026, 5, 1, 10, 0), 'sell-standalone-card');
      // July: two units; August: one.
      await collectAt(view, new Date(2026, 6, 10, 10, 0), 'sell-standalone-mixed');
      await collectAt(view, new Date(2026, 6, 12, 10, 0), 'sell-anonymous');
      await press(view, 'sell-anonymous-again');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Mois'));
      });
      // Only the toggles count from here (the segmented switch ticks too).
      selection.mockClear();

      const summary = () => view.getByTestId('cash-register-products-summary');
      const value = () => view.getByTestId('cash-register-products-trend-badge-value').props.children as string;
      expect(value()).toBe('−1');
      expect(summary().props.accessibilityRole).toBe('button');
      expect(summary().props.accessibilityHint).toBe('Touchez pour afficher la variation en pourcentage');

      await press(view, 'cash-register-products-trend-toggle');
      expect(value()).toMatch(/^−50,0\s%$/);
      expect(summary().props.accessibilityLabel).toMatch(
        /^Produits vendus, 1 unité\. En baisse de 50,0\s% par rapport à la période du 1er au 29 juillet$/,
      );
      expect(summary().props.accessibilityHint).toBe('Touchez pour afficher la variation en unités');
      expect(selection).toHaveBeenCalledTimes(1);
      // Each card keeps its own display: the total is still in percent.
      expect(view.getByTestId('cash-register-trend-badge-value').props.children).toMatch(/^−76,9\s%$/);

      await press(view, 'cash-register-products-trend-toggle');
      expect(value()).toBe('−1');
      expect(selection).toHaveBeenCalledTimes(2);
      selection.mockRestore();
    });

    it('Jour counts the units of a product sold during a checkout once, and never splits that checkout', async () => {
      const view = await renderCashRegister();
      await press(view, 'stock-products');
      await press(view, 'sell-linked-sofia');
      await press(view, 'checkout-sofia-with-product');
      await press(view, 'sell-standalone-card');

      // 145 € (95 € + the 50 € Masque) + 50 € direct: the Revente adds nothing of its own.
      expect(totals(view)).toMatchObject({ total: formatEuroCents(19500), count: '2 encaissements', clients: '1 client' });
      const products = view.getByTestId('cash-register-products');
      expect(within(products).getByTestId('cash-register-products-units').props.children).toBe('2 unités');
      expect(within(products).getByTestId('cash-register-products-split').props.children).toBe(
        '1 en vente directe · 1 pendant des rendez-vous',
      );
      expect(within(products).getByTestId('cash-register-products-direct-value').props.children).toBe(
        formatEuroCents(5000),
      );
      expect(within(products).getByText('Les produits vendus pendant un rendez-vous sont encaissés avec celui-ci.')).toBeTruthy();
      expect(view.getByTestId('cash-register-products-direct').props.accessibilityLabel).toBe(
        `Ventes directes encaissées : ${formatEuroCents(5000)}. Les produits vendus pendant un rendez-vous sont encaissés avec celui-ci.`,
      );
      // Jour: no trend anywhere.
      expect(within(products).queryByTestId('cash-register-products-trend')).toBeNull();
      expect(view.queryByTestId('cash-register-trends')).toBeNull();
    });
  });
});
