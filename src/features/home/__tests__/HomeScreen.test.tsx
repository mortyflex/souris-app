import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { getAppointmentDaySummary, getAppointmentPeriodSummary } from '@/domain/appointments';
import { getWeekDays } from '@/features/agenda/calendar/week';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { loadAppointmentDeposits } from '@/persistence/stores/appointment-deposits';
import { deleteAppointment, loadAppointments } from '@/persistence/stores/appointments';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { formatCompactEuroCents } from '@/shared/lib/money';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { semanticColors } from '@/shared/ui/theme';

import { HomeScreen } from '../HomeScreen';
import { LABEL_OVERHANG } from '../components/HomeQuickAction';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// Native image capture and share sheet of « Tops & tendances »: never real.
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
// The captured file is measured natively: here it always has the export size already.
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  Asset: { create: jest.fn() },
}));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
});
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

// A pinned Monday morning: the development seed and the screen share one now.
const NOW = new Date(2026, 5, 1, 8, 0);

function seededDatabase(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(NOW));
  return database;
}

function todaySummary(database: SourisDatabase) {
  return getAppointmentDaySummary(
    {
      appointments: loadAppointments(database),
      sales: [],
      deposits: loadAppointmentDeposits(database),
    },
    NOW,
  );
}

function renderHome(database: SourisDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <ProductCatalogProvider>
            <SaleSessionProvider>
              <CalendarBlockSessionProvider>
                <HomeScreen />
              </CalendarBlockSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </AppointmentSessionProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    mockPush.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('welcomes with the BeautIzzy logo, a compact greeting and a quiet date', async () => {
    const view = await renderHome(seededDatabase());

    const header = within(view.getByTestId('home-header'));
    // The canonical brand asset, announced once.
    expect(header.getByLabelText('BeautIzzy').props.accessibilityRole).toBe('image');
    const greeting = header.getByRole('header', { name: 'Bonjour' });
    // One step under a screen title: important, never dominant.
    expect(greeting).toHaveStyle({ fontSize: 23 });
    expect(header.getByText('Votre journée en un coup d’œil.')).toBeTruthy();
    expect(header.getByText('Lundi 1 juin')).toHaveStyle({ fontSize: 13.5 });
  });

  it('shows the next Appointment first and opens the existing Appointment Details', async () => {
    const database = seededDatabase();
    const first = loadAppointments(database)
      .filter((appointment) => appointment.startAt.getTime() >= NOW.getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    const view = await renderHome(database);

    const card = view.getByTestId('home-next-appointment');
    expect(within(card).getByText('Prochain rendez-vous')).toBeTruthy();
    expect(within(card).getByText(/^Aujourd’hui · \d{2}:\d{2}$/)).toBeTruthy();
    expect(card.props.accessibilityRole).toBe('button');
    await act(async () => fireEvent.press(card));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId: first.id },
    });
  });

  it('makes the next Appointment the one tinted hero card', async () => {
    const view = await renderHome(seededDatabase());

    const card = view.getByTestId('home-next-appointment');
    expect(card).toHaveStyle({ backgroundColor: semanticColors.surfaceLavenderStrong });
    // The client is the identity of the appointment; when it starts supports it.
    const when = within(card).getByText(/^Aujourd’hui · \d{2}:\d{2}$/);
    expect(when).toHaveStyle({ fontSize: 16 });
    const texts = within(card).getAllByText(/./);
    const name = texts[texts.indexOf(when) + 1];
    expect(name).toHaveStyle({ fontSize: 21 });
    expect(texts[texts.indexOf(when) + 2]).toHaveStyle({ fontSize: 13.5 });
    expect(within(card).getByTestId('client-avatar')).toHaveStyle({ height: 56, width: 56 });
  });

  it('pairs two strong figures — Rendez-vous and CA potentiel — with the same large value', async () => {
    const database = seededDatabase();
    const summary = todaySummary(database);
    const view = await renderHome(database);

    expect(summary.appointmentCount).toBeGreaterThan(0);
    const count = view.getByTestId('home-stat-appointments');
    const potential = view.getByTestId('home-stat-potential');
    expect(count.props.children).toBe(String(summary.appointmentCount));
    expect(potential.props.children).toBe(formatCompactEuroCents(summary.potentialRevenueCents));
    // A pair: the count is as large as the amount, and never auto-shrunk.
    for (const value of [count, potential]) {
      expect(value).toHaveStyle({ fontSize: 30 });
      expect(value.props.adjustsFontSizeToFit).toBeUndefined();
    }
    expect(view.getByLabelText(`Rendez-vous aujourd’hui, ${summary.appointmentCount}`)).toBeTruthy();
    expect(
      view.getByLabelText(
        `CA potentiel aujourd’hui, ${formatCompactEuroCents(summary.potentialRevenueCents)}`,
      ),
    ).toBeTruthy();
  });

  it('demotes collected and remaining money to ONE compact secondary card', async () => {
    const database = seededDatabase();
    const summary = todaySummary(database);
    const view = await renderHome(database);

    const button = view.getByTestId('home-collection-summary');
    const card = within(button);
    expect(card.getByText('Encaissements du jour')).toBeTruthy();
    const collected = card.getByTestId('home-stat-collected');
    const remaining = card.getByTestId('home-stat-remaining');
    expect(collected.props.children).toBe(formatCompactEuroCents(summary.collectedCents));
    expect(remaining.props.children).toBe(formatCompactEuroCents(summary.remainingToCollectCents));
    expect(card.getByText('encaissé')).toBeTruthy();
    expect(card.getByText('restant')).toBeTruthy();
    // Visibly lighter than the primary figures.
    for (const value of [collected, remaining]) expect(value).toHaveStyle({ fontSize: 16 });
    // ONE button: it speaks both amounts and says where it leads.
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(
      `Encaissements du jour, déjà encaissé ${formatCompactEuroCents(
        summary.collectedCents,
      )}, reste à encaisser ${formatCompactEuroCents(summary.remainingToCollectCents)}`,
    );
    expect(button.props.accessibilityHint).toBe('Ouvre la Caisse');
    // The chevron belongs to the card, centred on its whole height at the right edge.
    expect(button).toHaveStyle({ alignItems: 'center', flexDirection: 'row' });
    const chevron = card.getByTestId('home-collection-chevron');
    expect(chevron.parent).toBe(card.getByText('Encaissements du jour').parent?.parent);
    expect(within(view.getByTestId('home-collection-summary')).queryAllByRole('button')).toHaveLength(0);
  });

  it('opens the existing Caisse from anywhere on the collection card', async () => {
    const view = await renderHome(seededDatabase());

    await act(async () => fireEvent.press(view.getByTestId('home-stat-remaining')));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/cash-register');
  });

  it('reads top-down: welcome, next appointment, figures, collection, quick actions, week, pilotage', async () => {
    const view = await renderHome(seededDatabase());

    const order = view
      .getAllByText(
        /^(Bonjour|Prochain rendez-vous|Aujourd’hui|Encaissements du jour|Actions rapides|Cette semaine|Pilotage)$/,
      )
      .map((node) => node.props.children);
    expect(order).toEqual([
      'Bonjour',
      'Prochain rendez-vous',
      'Aujourd’hui',
      'Encaissements du jour',
      'Actions rapides',
      'Cette semaine',
      'Pilotage',
    ]);
  });

  it('stays calm on an empty day: one compact line instead of a hero card, and zeros', async () => {
    const database = seededDatabase();
    for (const appointment of loadAppointments(database)) deleteAppointment(database, appointment.id);
    const view = await renderHome(database);

    expect(view.queryByTestId('home-next-appointment')).toBeNull();
    expect(view.queryByText('Prochain rendez-vous')).toBeNull();
    const empty = view.getByTestId('home-next-appointment-empty');
    expect(within(empty).getByText('Aucun rendez-vous à venir.')).toBeTruthy();
    expect(empty).toHaveStyle({ flexDirection: 'row', minHeight: 44 });
    expect(view.getByTestId('home-stat-appointments').props.children).toBe('0');
    expect(view.getByTestId('home-stat-potential').props.children).toBe(formatCompactEuroCents(0));
    expect(view.getByTestId('home-stat-collected').props.children).toBe(formatCompactEuroCents(0));
    expect(view.getByTestId('home-quick-actions')).toBeTruthy();
  });

  it('offers four light shortcuts — a small white square over a short label — each spoken in full', async () => {
    const view = await renderHome(seededDatabase());

    const row = view.getByTestId('home-quick-actions');
    expect(row).toHaveStyle({ flexDirection: 'row' });
    const actions = within(row).getAllByRole('button');
    expect(actions.map((action) => action.props.accessibilityLabel)).toEqual([
      'Nouveau rendez-vous',
      'Ajouter un client',
      'Ajouter un produit',
      'Nouvelle vente',
    ]);
    for (const action of actions) {
      // The column is the button; only the small square is a surface.
      expect(action).toHaveStyle({ flex: 1 });
      expect(action).not.toHaveStyle({ backgroundColor: semanticColors.surfaceElevated });
      expect(within(action).getByTestId(`${action.props.testID}-surface`)).toHaveStyle({
        backgroundColor: semanticColors.surfaceElevated,
        height: 56,
        width: 56,
      });
    }
    // Whole words on ONE line at full size: the label borrows the gutter of its column
    // (never more than half of it, so two neighbours cannot overlap) instead of shrinking.
    const rowGap = StyleSheet.flatten(row.props.style).gap as number;
    expect(LABEL_OVERHANG).toBeGreaterThan(0);
    expect(LABEL_OVERHANG * 2).toBeLessThanOrEqual(rowGap);
    for (const label of ['Rendez-vous', 'Client', 'Produit', 'Vente']) {
      const text = within(row).getByText(label);
      expect(text.props.adjustsFontSizeToFit).toBeUndefined();
      expect(text.props.numberOfLines).toBe(1);
      expect(text).toHaveStyle({ marginHorizontal: -LABEL_OVERHANG });
    }
  });

  it('marks Produit and Vente with the small « + » their glyphs lack, and adds none to the others', async () => {
    const view = await renderHome(seededDatabase());

    // The box and the bag carry no plus of their own.
    expect(view.getByTestId('home-new-product-plus')).toBeTruthy();
    expect(view.getByTestId('home-new-sale-plus')).toBeTruthy();
    // calendar.badge.plus and person.badge.plus already do.
    expect(view.queryByTestId('home-new-appointment-plus')).toBeNull();
    expect(view.queryByTestId('home-new-client-plus')).toBeNull();
  });

  it('sums up the Agenda week in ONE card, from the domain period summary', async () => {
    const database = seededDatabase();
    const weekDays = getWeekDays(NOW);
    const week = getAppointmentPeriodSummary(
      {
        appointments: loadAppointments(database),
        sales: [],
        deposits: loadAppointmentDeposits(database),
      },
      { firstDay: weekDays[0], lastDay: weekDays[6] },
    );
    const view = await renderHome(database);

    expect(week.appointmentCount).toBeGreaterThan(todaySummary(database).appointmentCount);
    const card = within(view.getByTestId('home-week-summary'));
    expect(card.getByText('1 – 7 juin 2026')).toBeTruthy();
    expect(card.getByTestId('home-week-appointments').props.children).toBe(week.appointmentCount);
    expect(card.getByTestId('home-week-collected').props.children).toBe(
      formatCompactEuroCents(week.collectedCents),
    );
    expect(card.getByTestId('home-week-potential').props.children).toBe(
      formatCompactEuroCents(week.potentialRevenueCents),
    );
    // One strong number; the amounts stay quiet.
    expect(card.getByTestId('home-week-appointments')).toHaveStyle({ fontSize: 26 });
    expect(card.getByTestId('home-week-potential')).toHaveStyle({ fontSize: 16 });
    expect(view.getByLabelText(`${week.appointmentCount} rendez-vous cette semaine`)).toBeTruthy();
  });

  it('keeps the week card valid at zero', async () => {
    const database = seededDatabase();
    for (const appointment of loadAppointments(database)) deleteAppointment(database, appointment.id);
    const view = await renderHome(database);

    const card = within(view.getByTestId('home-week-summary'));
    expect(card.getByTestId('home-week-appointments').props.children).toBe(0);
    expect(card.getByTestId('home-week-collected').props.children).toBe(formatCompactEuroCents(0));
    expect(card.getByTestId('home-week-potential').props.children).toBe(formatCompactEuroCents(0));
    expect(view.getByTestId('home-tools')).toBeTruthy();
  });

  it('opens the existing « Résumé de la semaine » from the week section link', async () => {
    const view = await renderHome(seededDatabase());
    expect(view.queryByTestId('week-summary')).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('home-week-summary-link')));
    await settleSheetTransition();

    expect(view.getAllByTestId('week-summary').length).toBeGreaterThan(0);
  });

  it('lists the two Pilotage tools as navigation rows, not quick actions', async () => {
    const view = await renderHome(seededDatabase());

    const tools = within(view.getByTestId('home-tools'));
    expect(tools.getAllByRole('button').map((row) => row.props.accessibilityLabel)).toEqual([
      'Créer une estimation, Chiffrer des prestations pour un client',
      'Tops & tendances, Voir ce qui fonctionne le mieux',
    ]);
    expect(within(view.getByTestId('home-quick-actions')).queryByText(/estimation|tendances/i)).toBeNull();
    // A description wraps onto a second line on a narrow screen instead of being cut,
    // and the row grows with it: a minimum height, never a fixed one.
    for (const description of ['Chiffrer des prestations pour un client', 'Voir ce qui fonctionne le mieux']) {
      expect(tools.getByText(description).props.numberOfLines).toBe(2);
    }
    const row = StyleSheet.flatten(view.getByTestId('home-estimation').props.style);
    expect(row).toMatchObject({ alignItems: 'center', minHeight: 64 });
    expect(row.height).toBeUndefined();
  });

  it('opens the existing estimation flow from Pilotage', async () => {
    const view = await renderHome(seededDatabase());

    await act(async () => fireEvent.press(view.getByTestId('home-estimation')));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/estimations/new');
  });

  it('opens the existing « Tops & tendances » from Pilotage', async () => {
    const view = await renderHome(seededDatabase());
    expect(view.queryByTestId('business-insights')).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('home-insights')));
    await settleSheetTransition();

    expect(view.getAllByTestId('business-insights').length).toBeGreaterThan(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ['home-new-appointment', '/appointments/new'],
    ['home-new-product', '/products/new'],
    ['home-new-sale', '/sales/new'],
  ])('opens the existing flow from %s', async (testID, pathname) => {
    const view = await renderHome(seededDatabase());

    await act(async () => fireEvent.press(view.getByTestId(testID)));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(pathname);
  });

  it('opens the shared client creation form from « Client »', async () => {
    const view = await renderHome(seededDatabase());
    expect(view.queryByRole('header', { name: 'Nouveau client' })).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('home-new-client')));
    await settleSheetTransition();

    expect(view.getByRole('header', { name: 'Nouveau client' })).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the existing « Résumé du jour » for today from the section link', async () => {
    const view = await renderHome(seededDatabase());
    expect(view.queryByTestId('day-summary')).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('home-day-summary')));
    await settleSheetTransition();

    expect(view.getByTestId('day-summary')).toBeTruthy();
  });

  it('scrolls above the native tab bar through the system content inset', async () => {
    const view = await renderHome(seededDatabase());

    const scrollViews = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(scrollViews[0].props.contentInsetAdjustmentBehavior).toBe('automatic');
  });
});
