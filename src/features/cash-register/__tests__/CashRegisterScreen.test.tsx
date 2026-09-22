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
import { watermark as watermarkTheme } from '@/shared/ui/theme';

import { CashRegisterScreen } from '../CashRegisterScreen';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The canonical date picker is native; the mock exposes its value change so a
// test can pick a historical day.
let mockPickerDate: Date | undefined;
jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable: MockPressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: ({
      onValueChange,
    }: {
      readonly onValueChange: (event: unknown, date?: Date) => void;
    }) =>
      React.createElement(MockPressable, {
        onPress: () => onValueChange({}, mockPickerDate),
        testID: 'mock-date-picker',
      }),
  };
});

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
  const { checkoutAppointment, updateAppointmentPayment } = useAppointmentSession();
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
      <Pressable
        testID="checkout-sofia"
        onPress={() => checkoutAppointment('agenda-sofia', { cardAmountCents: 9500, cashAmountCents: 0 })}
      />
      <Pressable
        testID="checkout-ines"
        onPress={() => checkoutAppointment('agenda-ines', { cardAmountCents: 2000, cashAmountCents: 2200 })}
      />
      <Pressable
        testID="checkout-elodie"
        onPress={() => checkoutAppointment('agenda-elodie', { cardAmountCents: 0, cashAmountCents: 4000 })}
      />
      <Pressable
        testID="edit-sofia"
        onPress={() => updateAppointmentPayment('agenda-sofia', { cardAmountCents: 3000, cashAmountCents: 6500 })}
      />
    </>
  );
}

function renderCashRegister() {
  return render(
    <TestPersistenceProvider>
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
    mockPickerDate = undefined;
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
    expect(totals(view)).toMatchObject({ total: formatEuroCents(18500), count: '3 encaissements' });
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
      fireEvent.press(view.getByTestId('checkout-sofia'));
    });
    expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), count: '1 encaissement' });

    await press(view, 'sell-standalone-card');
    await press(view, 'sell-standalone-mixed');

    expect(totals(view)).toMatchObject({
      total: formatEuroCents(19500),
      card: formatEuroCents(15500),
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
      total: formatEuroCents(4000),
      card: formatEuroCents(0),
      cash: formatEuroCents(4000),
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

  it('jumps directly to a historical day through the canonical date picker', async () => {
    const view = await renderCashRegister();
    await press(view, 'stock-products');
    jest.setSystemTime(new Date(2026, 7, 3, 11, 0));
    await press(view, 'sell-standalone-mixed');
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    expect(totals(view)).toMatchObject({ total: formatEuroCents(0), period: 'Samedi 29 août' });

    await press(view, 'cash-register-calendar');
    expect(view.getByTestId('cash-register-day-picker')).toBeTruthy();
    // Headed by the violet « CAISSE DU » eyebrow alone: no « Choisir un jour » title.
    expect(view.getByRole('header', { name: 'CAISSE DU' }).props.testID).toBe(
      'cash-register-day-picker-heading',
    );
    expect(view.queryByText('Choisir un jour')).toBeNull();
    expect(view.queryByText('Choisir une date')).toBeNull();
    mockPickerDate = new Date(2026, 7, 3, 23, 59);
    await press(view, 'mock-date-picker');
    await press(view, 'cash-register-day-picker-confirm');

    expect(totals(view)).toMatchObject({
      total: formatEuroCents(5000),
      card: formatEuroCents(1000),
      cash: formatEuroCents(4000),
      period: 'Lundi 3 août',
      caption: 'encaissé ce jour',
    });

    await press(view, 'cash-register-go-to-today');
    expect(totals(view)).toMatchObject({ period: 'Samedi 29 août', caption: 'encaissé aujourd’hui' });
  });

  it('leaves the selected day and its totals unchanged when the date picker is cancelled', async () => {
    const view = await renderCashRegister();
    await press(view, 'checkout-sofia');

    await press(view, 'cash-register-calendar');
    mockPickerDate = new Date(2026, 7, 3);
    await press(view, 'mock-date-picker');
    await act(async () => {
      fireEvent.press(view.getAllByText('Annuler')[0]!);
    });

    expect(totals(view)).toMatchObject({ total: formatEuroCents(9500), period: 'Samedi 29 août' });
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
      total: formatEuroCents(18500),
      card: formatEuroCents(14500),
      cash: formatEuroCents(4000),
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
    expect(totals(view)).toMatchObject({ total: formatEuroCents(18500), period: 'Août 2026' });

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
});
