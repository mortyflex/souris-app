import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { getAppointmentDaySummary, getAppointmentPeriodSummary } from '@/domain/appointments';
import { getWeekDays } from '@/features/agenda/calendar/week';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { getClientDisplayName } from '@/domain/clients';
import { loadAppointmentDeposits } from '@/persistence/stores/appointment-deposits';
import {
  checkoutAppointment,
  deleteAppointment,
  loadAppointments,
} from '@/persistence/stores/appointments';
import { loadClients } from '@/persistence/stores/clients';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { createFakeSubscriptionSource } from '@/features/access/testing/fake-subscription-source';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider, type TestBusinessAccessOptions } from '@/providers/testing/TestPersistenceProvider';
import { formatCompactEuroCents } from '@/shared/lib/money';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { fontFamilies, foregroundSoft, semanticColors } from '@/shared/ui/theme';

import { HOME_HERO_ROW_MIN_WIDTH, HomeScreen } from '../HomeScreen';
import { HOME_LOGO_SIZE } from '../components/HomeHeader';
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

/** The seed with every Appointment removed: nothing to come, nothing today. */
function emptyDatabase(): SourisDatabase {
  const database = seededDatabase();
  for (const appointment of loadAppointments(database)) deleteAppointment(database, appointment.id);
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

function renderHome(database: SourisDatabase, access?: TestBusinessAccessOptions) {
  return render(
    <TestPersistenceProvider access={access} database={database}>
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

  it('opens on the BeautIzzy logo alone: larger, and no date or text beside it', async () => {
    const view = await renderHome(seededDatabase());

    const header = within(view.getByTestId('home-header'));
    // The canonical brand asset, announced once.
    const logo = header.getByLabelText('BeautIzzy');
    expect(logo.props.accessibilityRole).toBe('image');
    expect(logo).toHaveStyle({ width: HOME_LOGO_SIZE });
    expect(HOME_LOGO_SIZE).toBeGreaterThan(125);
    expect(header.queryAllByText(/./)).toHaveLength(0);
    expect(view.queryByText('Lundi 1 juin')).toBeNull();
  });

  it('greets in a plain white card: a compact greeting and one quiet line', async () => {
    const view = await renderHome(seededDatabase());

    const card = view.getByTestId('home-greeting');
    expect(card).toHaveStyle({ backgroundColor: semanticColors.surfaceElevated });
    const greeting = within(card).getByRole('header', { name: 'Bonjour' });
    // One step under a screen title: important, never dominant.
    expect(greeting).toHaveStyle({ fontSize: 23 });
    expect(within(card).getByText('Votre journée en un coup d’œil.')).toBeTruthy();
  });

  // The seed's morning: « agenda-lea » 09:00 → 10:15 (95 €) and « agenda-camille »
  // 09:20 → 10:05 (42 €). With the 15-minute grace Camille is due from 10:20,
  // Léa from 10:30.
  describe('reminds of an Appointment left to collect', () => {
    const at = (hour: number, minute: number) => new Date(2026, 5, 1, hour, minute);
    const collect = (database: SourisDatabase, appointmentId: string, cents: number) =>
      checkoutAppointment(database, appointmentId, {
        paidAt: at(10, 16),
        cardAmountCents: cents,
        cashAmountCents: 0,
      });

    it('keeps the quiet line, and no button, until the grace period has elapsed', async () => {
      jest.setSystemTime(at(10, 19));
      const view = await renderHome(seededDatabase());

      const card = view.getByTestId('home-greeting');
      expect(within(card).getByText('Votre journée en un coup d’œil.')).toBeTruthy();
      expect(within(card).getByRole('header', { name: 'Bonjour' })).toBeTruthy();
      expect(card.props.accessibilityRole).toBeUndefined();
      await act(async () => fireEvent.press(card));
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('names the one Appointment by time and client and opens its Details', async () => {
      jest.setSystemTime(at(10, 20));
      const database = seededDatabase();
      const camille = loadAppointments(database).find(({ id }) => id === 'agenda-camille');
      const client = loadClients(database).find(({ id }) => id === camille?.clientId);
      if (!client?.lastName) throw new Error('the seeded client needs a surname');
      const view = await renderHome(database);

      const card = view.getByTestId('home-greeting');
      expect(within(card).queryByText('Votre journée en un coup d’œil.')).toBeNull();
      // Same surface and greeting: a nudge, never an alert.
      expect(card).toHaveStyle({ backgroundColor: semanticColors.surfaceElevated });
      expect(within(card).getByText('Bonjour')).toHaveStyle({ fontSize: 23 });
      // The first name alone, whatever the phone: the surname is only spoken.
      const detail = within(card).getByText(`09:20 · ${client.firstName}`);
      expect(detail.props.numberOfLines).toBe(1);
      expect(detail).toHaveStyle({ color: foregroundSoft });
      expect(within(card).getByText('Reste à encaisser')).toHaveStyle({
        color: semanticColors.accent,
        fontFamily: fontFamilies['600'],
      });
      // ONE button saying it all, the client name in full; no nested header.
      const clientName = getClientDisplayName(client);
      expect(clientName).not.toBe(client.firstName);
      expect(card.props.accessibilityRole).toBe('button');
      expect(card.props.accessibilityLabel).toBe(
        `Bonjour. Rendez-vous de 09:20 avec ${clientName}. Reste à encaisser. Ouvrir le rendez-vous.`,
      );
      expect(within(card).queryByRole('header')).toBeNull();

      await act(async () => fireEvent.press(card));
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'agenda-camille' },
      });
    });

    it('counts several Appointments and opens the oldest one', async () => {
      jest.setSystemTime(at(10, 30));
      const view = await renderHome(seededDatabase());

      const card = view.getByTestId('home-greeting');
      expect(within(card).getByText('2 rendez-vous')).toBeTruthy();
      expect(within(card).getByText('restent à encaisser')).toHaveStyle({
        color: semanticColors.accent,
      });
      expect(within(card).queryByText(/·/)).toBeNull();
      expect(card.props.accessibilityLabel).toBe(
        'Bonjour. 2 rendez-vous restent à encaisser. Ouvrir le plus ancien.',
      );

      // Léa started first, although Camille ended first.
      await act(async () => fireEvent.press(card));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'agenda-lea' },
      });
    });

    it('moves on to the next outstanding Appointment once the oldest is collected', async () => {
      jest.setSystemTime(at(10, 30));
      const database = seededDatabase();
      collect(database, 'agenda-lea', 9500);
      const view = await renderHome(database);

      const card = view.getByTestId('home-greeting');
      expect(within(card).getByText(/^09:20 · .+/)).toBeTruthy();
      await act(async () => fireEvent.press(card));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'agenda-camille' },
      });
    });

    it('returns to the quiet line once everything is collected', async () => {
      jest.setSystemTime(at(10, 30));
      const database = seededDatabase();
      collect(database, 'agenda-lea', 9500);
      collect(database, 'agenda-camille', 4200);
      const view = await renderHome(database);

      const card = view.getByTestId('home-greeting');
      expect(within(card).getByText('Votre journée en un coup d’œil.')).toBeTruthy();
      expect(card.props.accessibilityRole).toBeUndefined();
    });

    it.each([
      ['iPhone SE', 375],
      ['iPhone 17', 402],
      ['iPhone 17 Pro Max', 440],
    ])('keeps the 35 : 65 row on %s', async (_device, width) => {
      jest.setSystemTime(at(10, 20));
      const device = Dimensions.get('window');
      Dimensions.set({ window: { ...device, fontScale: 1, width } });
      const view = await renderHome(seededDatabase());

      const hero = view.getByTestId('home-hero');
      expect(hero).toHaveStyle({ flexDirection: 'row', gap: 10, minHeight: 136 });
      expect(hero.children).toHaveLength(2);
      expect(within(hero).getByTestId('home-greeting')).toHaveStyle({ flex: 35 });
      expect(within(hero).getByTestId('home-next-appointment')).toHaveStyle({ flex: 65 });
      // The compact lines of the narrow column, whatever the phone.
      expect(within(hero).getByText(/^09:20 · .+/)).toHaveStyle({ fontSize: 13.5 });
      expect(within(hero).getByText('Reste à encaisser')).toHaveStyle({ fontSize: 13.5 });
      await act(async () => {
        Dimensions.set({ window: device });
      });
    });
  });

  it.each([
    ['iPhone SE', 375],
    ['iPhone 17', 402],
    ['iPhone 17 Pro Max', 440],
  ])('keeps the greeting and the next Appointment side by side on %s', async (_device, width) => {
    const device = Dimensions.get('window');
    Dimensions.set({ window: { ...device, fontScale: 1, width } });
    const view = await renderHome(seededDatabase());

    // One row, asymmetrical: the appointment is the wide, dominant column.
    const hero = view.getByTestId('home-hero');
    expect(hero).toHaveStyle({ flexDirection: 'row' });
    const gap = StyleSheet.flatten(hero.props.style).gap as number;
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(12);
    expect(within(hero).getByTestId('home-greeting')).toHaveStyle({ flex: 35 });
    expect(within(hero).getByTestId('home-next-appointment')).toHaveStyle({ flex: 65 });
    // The quiet line is whole and free to wrap in its narrow column.
    const subtitle = within(hero).getByText('Votre journée en un coup d’œil.');
    expect(subtitle.props.numberOfLines).toBeUndefined();
    await act(async () => {
      Dimensions.set({ window: device });
    });
  });

  it.each([
    ['iPhone SE', 375],
    ['iPhone 17', 402],
    ['iPhone 17 Pro Max', 440],
  ])('keeps the two cards side by side on %s when nothing is to come', async (_device, width) => {
    const device = Dimensions.get('window');
    Dimensions.set({ window: { ...device, fontScale: 1, width } });
    const view = await renderHome(emptyDatabase());

    // The very row of the usual state: same direction, gap, height and 35 : 65.
    const hero = view.getByTestId('home-hero');
    expect(hero).toHaveStyle({ flexDirection: 'row', gap: 10, minHeight: 136 });
    expect(hero.children).toHaveLength(2);
    expect(within(hero).getByTestId('home-greeting')).toHaveStyle({ flex: 35 });
    expect(within(hero).getByTestId('home-next-appointment-empty')).toHaveStyle({ flex: 65 });
    // The greeting keeps its compact quiet line, as beside an appointment.
    expect(within(hero).getByText('Votre journée en un coup d’œil.')).toHaveStyle({ fontSize: 13.5 });
    await act(async () => {
      Dimensions.set({ window: device });
    });
  });

  it('stacks the greeting and the empty card for enlarged accessibility text', async () => {
    const device = Dimensions.get('window');
    Dimensions.set({ window: { ...device, fontScale: 1.5, width: 375 } });
    const view = await renderHome(emptyDatabase());

    const hero = view.getByTestId('home-hero');
    expect(StyleSheet.flatten(hero.props.style).flexDirection).toBeUndefined();
    expect(within(hero).getByTestId('home-greeting')).not.toHaveStyle({ flex: 35 });
    expect(within(hero).getByTestId('home-next-appointment-empty')).not.toHaveStyle({ flex: 65 });
    await act(async () => {
      Dimensions.set({ window: device });
    });
  });

  it('stacks the two cards only for enlarged accessibility text', async () => {
    const device = Dimensions.get('window');
    Dimensions.set({ window: { ...device, fontScale: 1.5, width: 375 } });
    const view = await renderHome(seededDatabase());

    expect(375 / 1.5).toBeLessThan(HOME_HERO_ROW_MIN_WIDTH);
    const hero = view.getByTestId('home-hero');
    expect(StyleSheet.flatten(hero.props.style).flexDirection).toBeUndefined();
    expect(within(hero).getByTestId('home-greeting')).not.toHaveStyle({ flex: 35 });
    expect(within(hero).getByTestId('home-next-appointment')).not.toHaveStyle({ flex: 65 });
    await act(async () => {
      Dimensions.set({ window: device });
    });
  });

  it('shows the next Appointment first and opens the existing Appointment Details', async () => {
    const database = seededDatabase();
    const first = loadAppointments(database)
      .filter((appointment) => appointment.startAt.getTime() >= NOW.getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    const view = await renderHome(database);

    const card = view.getByTestId('home-next-appointment');
    expect(within(card).getByText('Prochain rendez-vous')).toBeTruthy();
    // Today: the time alone, the day is not repeated.
    expect(within(card).getByText(/^\d{2}:\d{2}$/)).toBeTruthy();
    expect(within(card).queryByText(/Aujourd’hui/)).toBeNull();
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
    const when = within(card).getByText(/^\d{2}:\d{2}$/);
    expect(when).toHaveStyle({ fontSize: 16 });
    const texts = within(card).getAllByText(/./);
    // Eyebrow, time, (initials), then the name and the prestation close the card.
    const name = texts[texts.length - 2];
    expect(name).toHaveStyle({ fontSize: 21 });
    // In its column the name may wrap; only the prestation is ever cut.
    expect(name.props.numberOfLines).toBe(2);
    const summary = texts[texts.length - 1];
    expect(summary).toHaveStyle({ fontSize: 13.5 });
    expect(summary.props.numberOfLines).toBe(1);
    // The time has a line of its own, right under the eyebrow.
    expect(texts.indexOf(when)).toBe(1);
    expect(when.props.numberOfLines).toBe(1);
    expect(within(card).getByTestId('client-avatar')).toHaveStyle({ height: 44, width: 44 });
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

  it('stays calm on an empty day: the empty card takes the appointment slot, and zeros', async () => {
    const view = await renderHome(emptyDatabase());

    expect(view.queryByTestId('home-next-appointment')).toBeNull();
    // The greeting card stays.
    expect(within(view.getByTestId('home-greeting')).getByText('Bonjour')).toBeTruthy();
    const empty = view.getByTestId('home-next-appointment-empty');
    // The same card surface as a real appointment, holding ONE statement:
    // no eyebrow repeating it, free to wrap, centred beside its glyph.
    expect(view.queryByText('Prochain rendez-vous')).toBeNull();
    expect(within(empty).getAllByText(/./)).toHaveLength(1);
    const message = within(empty).getByText('Aucun rendez-vous à venir.');
    expect(message.props.numberOfLines).toBeUndefined();
    expect(empty).toHaveStyle({
      alignItems: 'center',
      backgroundColor: semanticColors.surfaceLavenderStrong,
      flexDirection: 'row',
    });
    expect(empty.props.accessibilityLabel).toBe('Aucun rendez-vous à venir');
    // A statement, not a button: it opens nothing.
    expect(empty.props.accessibilityRole).toBeUndefined();
    expect(empty.props.onPress).toBeUndefined();
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

  it('sums up the Agenda week in TWO cards, from the domain period summary', async () => {
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
    const section = view.getByTestId('home-week-summary');
    expect(section).toHaveStyle({ flexDirection: 'row' });
    // Card A: when and how many — the range without its year.
    const countCard = within(view.getByTestId('home-week-appointments-card'));
    expect(countCard.getByText('1–7 juin')).toBeTruthy();
    expect(view.queryByText(/2026/)).toBeNull();
    expect(countCard.getByTestId('home-week-appointments').props.children).toBe(
      week.appointmentCount,
    );
    expect(countCard.getByText('rendez-vous')).toBeTruthy();
    expect(countCard.queryByText(/€/)).toBeNull();
    // Card B: money only.
    const moneyCard = within(view.getByTestId('home-week-money-card'));
    expect(moneyCard.getAllByText(/./).map((node) => node.props.children)).toEqual([
      'Déjà encaissé',
      formatCompactEuroCents(week.collectedCents),
      'CA potentiel',
      formatCompactEuroCents(week.potentialRevenueCents),
    ]);
    // Two plain white columns, the money one a little wider; compact, never a fixed height.
    expect(view.getByTestId('home-week-appointments-card')).toHaveStyle({ flex: 42 });
    expect(view.getByTestId('home-week-money-card')).toHaveStyle({ flex: 58 });
    for (const testID of ['home-week-appointments-card', 'home-week-money-card']) {
      const card = view.getByTestId(testID);
      expect(card).toHaveStyle({ backgroundColor: semanticColors.surfaceElevated });
      expect(StyleSheet.flatten(card.props.style).height).toBeUndefined();
    }
    const sectionStyle = StyleSheet.flatten(section.props.style);
    expect(sectionStyle.minHeight).toBeLessThanOrEqual(115);
    // The count and its label share one baseline row.
    const count = view.getByTestId('home-week-appointments');
    expect(count).toHaveStyle({ fontSize: 26 });
    expect(count.parent).toHaveStyle({ alignItems: 'baseline', flexDirection: 'row' });
    // Each amount faces its label on one row: stronger than it, never auto-shrunk.
    for (const [label, testID] of [
      ['Déjà encaissé', 'home-week-collected'],
      ['CA potentiel', 'home-week-potential'],
    ]) {
      const amount = view.getByTestId(testID);
      expect(amount).toHaveStyle({ fontSize: 18, textAlign: 'right' });
      expect(amount.props.adjustsFontSizeToFit).toBeUndefined();
      expect(amount.parent).toHaveStyle({ flexDirection: 'row' });
      expect(moneyCard.getByText(label)).toHaveStyle({ fontSize: 12.5 });
    }
    expect(
      view.getByLabelText(`1–7 juin, ${week.appointmentCount} rendez-vous cette semaine`),
    ).toBeTruthy();
    expect(
      view.getByLabelText(
        `CA potentiel cette semaine, ${formatCompactEuroCents(week.potentialRevenueCents)}`,
      ),
    ).toBeTruthy();
  });

  it('keeps the week cards valid at zero', async () => {
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

  it('shows no read-only status with enforcement disabled, whatever the store says (the shipped state)', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const source = createFakeSubscriptionSource();
    source.respondWith({ kind: 'verified', status: { kind: 'expired' } });
    const view = await renderHome(seededDatabase(), { enforcement: SUBSCRIPTION_ENFORCEMENT, source });

    await waitFor(() => expect(source.calls.verify).toHaveLength(1));
    expect(view.queryByTestId('read-only-status')).toBeNull();
    expect(view.getByTestId('home-hero')).toBeTruthy();
    expect(view.getByTestId('home-quick-actions')).toBeTruthy();
  });

  it('shows the subtle read-only status under enforced read-only access, under the top area, with everything else intact', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith({ kind: 'verified', status: { kind: 'expired' } });
    const view = await renderHome(seededDatabase(), { enforcement: 'enabled', source });

    const status = await view.findByTestId('read-only-status');
    expect(within(status).getByText('Votre activité est en lecture seule.')).toBeTruthy();
    expect(within(status).getByText('Votre abonnement BeautIzzy Plus n’est plus actif.')).toBeTruthy();
    // Under the hero row, before « Aujourd’hui »: the page keeps reading top-down.
    const tree = JSON.stringify(view.toJSON());
    const order = ['home-hero', 'read-only-status', 'home-stat-appointments'].map((id) =>
      tree.indexOf(`"testID":"${id}"`),
    );
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    expect(view.getByTestId('home-quick-actions')).toBeTruthy();
    expect(view.getByTestId('home-tools')).toBeTruthy();
  });
});
