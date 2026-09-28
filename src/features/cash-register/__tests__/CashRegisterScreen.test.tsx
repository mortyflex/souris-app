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
import { formatEuroCents } from '@/shared/lib/money';
import { formatNavigatorDate } from '@/shared/ui/DateNavigator';
import { glassIconButtonSize } from '@/shared/ui/GlassIconButton';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { calendarIntensity, watermark as watermarkTheme } from '@/shared/ui/theme';

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
  const { completeSale } = useSaleSession();
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
      <Pressable testID="sell-linked-sofia" onPress={() => sell('sale-linked-sofia', 'agenda-sofia')} />
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
  // The period caption is spoken with the KPI: « Total encaissé aujourd’hui : 0,00 € ».
  const totalLabel = view.getByTestId('cash-register-total-card').props.accessibilityLabel as string;
  const countLabel = view.getByTestId('cash-register-count').props.accessibilityLabel as string;
  return {
    total,
    card: within(view.getByTestId('cash-register-card')).getAllByText(/€/)[0]!.props.children as string,
    cash: within(view.getByTestId('cash-register-cash')).getAllByText(/€/)[0]!.props.children as string,
    count: countLabel.replace('Encaissements, ', ''),
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
    expect(view.getByTestId('cash-register-count').props.accessibilityLabel).toBe('Encaissements, Aucun encaissement');
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
    expect(view.getByTestId('cash-register-count').props.accessibilityLabel).toBe('Encaissements, 2 encaissements');

    const rows = entryRows(view);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'cash-register-entry-sale-standalone-mixed',
      'cash-register-entry-agenda-sofia',
    ]);

    // A standalone Sale names its source and its mixed payment; no detail exists, so it is read-only.
    const sale = view.getByTestId('cash-register-entry-sale-standalone-mixed');
    expect(sale.props.accessibilityRole).toBeUndefined();
    expect(within(sale).getByText('10:30')).toBeTruthy();
    expect(within(sale).getByText('Sofia Petit')).toBeTruthy();
    expect(within(sale).getByText(/^Vente · /)).toBeTruthy();
    expect(within(sale).getByText(formatEuroCents(5000))).toBeTruthy();
    expect(within(sale).getByText('Carte + Espèces')).toBeTruthy();

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
});
