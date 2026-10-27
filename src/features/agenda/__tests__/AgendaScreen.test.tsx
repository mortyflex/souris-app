import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { radii, receiptPrint, semanticColors } from '@/shared/ui/theme';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import type { SourisDatabase } from '@/persistence/database';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { brandAssets } from '@/shared/ui/BrandMark';
import { RECEIPT_SIGNATURE_SIZE } from '@/shared/ui/ReceiptPaper';
import { formatEuroCents } from '@/shared/lib/money';
import { insertCalendarBlock } from '@/persistence/stores/calendar-blocks';
import { loadAppointmentDeposits, insertAppointmentDeposit } from '@/persistence/stores/appointment-deposits';
import { deleteAppointment, insertAppointment, loadAppointments } from '@/persistence/stores/appointments';
import { getAppointmentDaySummary, type Appointment } from '@/domain/appointments';
import { getWeekDays } from '../calendar/week';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { formatNavigatorDate } from '@/shared/ui/DateNavigator';
import { settleFloatingReveal, settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { INSIGHTS_SAVED_NOTICE_DURATION } from '@/features/insights/BusinessInsightsTicket';

import { AgendaScreen } from '../AgendaScreen';
import { formatCalendarMonth } from '@/shared/ui/MonthCalendarSheet';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// Native image capture and share sheet: observed, never real.
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
// The captured file is measured natively: here it always has the export size already.
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
const mockMediaLibrary = jest.requireMock('expo-media-library') as {
  readonly requestPermissionsAsync: jest.Mock;
  readonly Asset: { readonly create: jest.Mock };
};
const mockViewShot = jest.requireMock('react-native-view-shot') as {
  readonly captureRef: jest.Mock;
  readonly releaseCapture: jest.Mock;
};
const mockSharing = jest.requireMock('expo-sharing') as {
  readonly isAvailableAsync: jest.Mock;
  readonly shareAsync: jest.Mock;
};

// The « Résumé du jour » receipt printer: nothing animates under test.
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

function renderAgenda(database?: SourisDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <ProductCatalogProvider>
            <SaleSessionProvider>
              <CalendarBlockSessionProvider>
                <AgendaScreen />
              </CalendarBlockSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </AppointmentSessionProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

describe('AgendaScreen', () => {
  beforeEach(() => mockPush.mockClear());

  it('anchors the decorative calendar watermark to the title block, hidden from accessibility', async () => {
    const view = await renderAgenda();

    expect(view.getByRole('header')).toBeTruthy();
    expect(view.queryByTestId('screen-watermark-agenda')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-agenda', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
    expect(watermark.props.importantForAccessibility).toBe('no-hide-descendants');
    // The watermark shares the title block, never the device edge.
    expect(watermark.parent).toBe(view.getByRole('header').parent);
    // The title remains; the date itself belongs to the day navigator.
    // No eyebrow: the Jour / Semaine switch already says which view this is.
    expect(view.queryByText('Vue jour')).toBeNull();
    expect(view.getByRole('header', { name: 'Agenda' })).toBeTruthy();
  });

  it('lets the day timeline scroll above the native tab bar through the system content inset', async () => {
    const view = await renderAgenda();
    const timelines = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  it('offers « Nouveau rendez-vous », « Estimation », « Résumé du jour » and « Tops & tendances » from the floating +', async () => {
    const view = await renderAgenda();
    await settleFloatingReveal();

    expect(view.queryByTestId('agenda-create-menu')).toBeNull();
    await act(async () => fireEvent.press(view.getByTestId('agenda-create')));

    const options = view.getAllByRole('menuitem');
    expect(options.map((option) => option.props.accessibilityLabel)).toEqual([
      'Nouveau rendez-vous',
      'Estimation',
      'Résumé du jour',
      'Tops & tendances',
    ]);
  });

  it('opens the « Estimation » flow from the + menu, with no schedule attached', async () => {
    const view = await renderAgenda();
    await settleFloatingReveal();

    await act(async () => fireEvent.press(view.getByTestId('agenda-create')));
    await act(async () => fireEvent.press(view.getByTestId('agenda-estimation')));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/estimations/new');
  });

  it('opens the existing Appointment creation flow from the + menu', async () => {
    const view = await renderAgenda();
    await settleFloatingReveal();

    await act(async () => fireEvent.press(view.getByTestId('agenda-create')));
    await act(async () => fireEvent.press(view.getByTestId('agenda-new-appointment')));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const [destination] = mockPush.mock.calls[0] as [{ pathname: string; params: { startAt: string } }];
    expect(destination.pathname).toBe('/appointments/new');
    expect(new Date(destination.params.startAt).getHours()).toBe(8);
  });
});

describe('AgendaScreen — day navigation', () => {
  type AgendaView = Awaited<ReturnType<typeof render>>;

  const press = async (view: AgendaView, testID: string) => {
    await act(async () => {
      fireEvent.press(view.getByTestId(testID));
    });
  };
  const selectedDate = (view: AgendaView) =>
    view.getByTestId('agenda-date-date').props.children as string;
  const calendarMonth = (view: AgendaView) =>
    view.getByTestId('agenda-month-calendar-month').props.children as string;
  const formatDayId = (day: Date) =>
    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  /** Opens the month calendar, browses forward to the month of `day`, taps it. */
  const pickAgendaDay = async (view: AgendaView, day: Date) => {
    await press(view, 'agenda-date-date-button');
    for (let step = 0; calendarMonth(view) !== formatCalendarMonth(day); step += 1) {
      if (step > 24) throw new Error(`Month of ${day.toDateString()} not reached`);
      await press(view, 'agenda-month-calendar-navigation-next');
    }
    await press(view, `agenda-month-calendar-day-${formatDayId(day)}`);
    await settleSheetTransition();
  };

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    // Wednesday: the fixtures put Julie on Tuesday 15 and Anaïs on Thursday 17.
    jest.setSystemTime(new Date(2026, 8, 16, 15, 0));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('shows the single selected date instead of the seven-day strip', async () => {
    const view = await renderAgenda();

    expect(selectedDate(view)).toBe('Mercredi 16 sept.');
    // The shared formatter, the same one the Caisse shows.
    expect(selectedDate(view)).toBe(formatNavigatorDate(new Date(2026, 8, 16)));
    expect(view.getByTestId('agenda-date-today')).toBeTruthy();
    // No weekday cell and no week range: one date, three controls.
    expect(view.queryByLabelText(/^(lun|mar|mer|jeu|ven|sam|dim)\. \d+$/)).toBeNull();
    expect(view.queryByText('14 – 20 sept')).toBeNull();
    expect(view.queryByLabelText('Semaine précédente')).toBeNull();
    expect(view.getByRole('button', { name: 'Jour précédent' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Choisir une date' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Jour suivant' })).toBeTruthy();
  });

  it('paints the Agenda on the white operational canvas, not the app background', async () => {
    const view = await renderAgenda();

    const background = StyleSheet.flatten(view.getByTestId('agenda-screen').props.style).backgroundColor;
    expect(background).toBe(semanticColors.canvas);
    expect(background).not.toBe(semanticColors.screen);
  });

  it('groups previous, date, calendar and next into ONE period surface, like Caisse', async () => {
    const view = await renderAgenda();

    const surface = view.getByTestId('agenda-date');
    expect(StyleSheet.flatten(surface.props.style)).toMatchObject({
      backgroundColor: semanticColors.surfaceElevated,
      borderRadius: radii.large,
      flexDirection: 'row',
    });
    for (const testID of ['agenda-date-previous', 'agenda-date-date', 'agenda-date-today', 'agenda-date-calendar', 'agenda-date-next']) {
      expect(within(surface).getByTestId(testID)).toBeTruthy();
    }
    expect(view.getByLabelText('Jour').props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText('Semaine').props.accessibilityState.selected).toBe(false);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine'));
    });

    const week = view.getByTestId('agenda-week');
    expect(StyleSheet.flatten(week.props.style)).toMatchObject({
      backgroundColor: semanticColors.surfaceElevated,
      borderRadius: radii.large,
    });
    expect(within(week).getByRole('button', { name: 'Semaine précédente' })).toBeTruthy();
    expect(within(week).getByRole('button', { name: 'Semaine suivante' })).toBeTruthy();
    expect(within(week).getByTestId('agenda-week-range').props.children).toBe('14 – 20 sept');
    expect(within(week).getByText('Cette semaine')).toBeTruthy();
    // Week mode keeps its own controls: no calendar was added.
    expect(within(week).queryByRole('button', { name: 'Choisir une date' })).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine suivante'));
    });
    expect(view.getByTestId('agenda-week-range').props.children).toBe('21 – 27 sept');
    expect(view.queryByTestId('agenda-week-current')).toBeNull();
  });

  it('moves exactly one day per arrow press and shows that day on the timeline', async () => {
    const view = await renderAgenda();
    expect(view.getByLabelText(/^Nadia/)).toBeTruthy();

    await press(view, 'agenda-date-next');
    expect(selectedDate(view)).toBe('Jeudi 17 sept.');
    expect(view.queryByTestId('agenda-date-today')).toBeNull();
    expect(view.getByLabelText(/^Anaïs/)).toBeTruthy();
    expect(view.queryByLabelText(/^Nadia/)).toBeNull();

    await press(view, 'agenda-date-previous');
    await press(view, 'agenda-date-previous');
    expect(selectedDate(view)).toBe('Mardi 15 sept.');
    expect(view.getAllByLabelText(/^Julie/).length).toBeGreaterThan(0);

    await press(view, 'agenda-date-go-to-today');
    expect(selectedDate(view)).toBe('Mercredi 16 sept.');
    expect(view.getByTestId('agenda-date-today')).toBeTruthy();
  });

  it('opens the month calendar from the date itself, instead of the old date wheel', async () => {
    const view = await renderAgenda();
    for (let day = 0; day < 7; day += 1) await press(view, 'agenda-date-next');
    expect(selectedDate(view)).toBe('Mercredi 23 sept.');

    const date = view.getByTestId('agenda-date-date-button');
    expect(date.props.accessibilityRole).toBe('button');
    expect(date.props.accessibilityLabel).toBe('Mercredi 23 sept.');
    await press(view, 'agenda-date-date-button');

    expect(view.getByTestId('agenda-month-calendar')).toBeTruthy();
    expect(calendarMonth(view)).toBe('Septembre 2026');
    expect(view.getByTestId('agenda-month-calendar-day-2026-09-23').props.accessibilityState).toEqual({
      selected: true,
    });
    // The wheel sheet and its « AGENDA DU » eyebrow are gone from the Agenda.
    expect(view.queryByTestId('agenda-day-picker')).toBeNull();
    expect(view.queryByText('AGENDA DU')).toBeNull();
    expect(view.queryByText(/valider|confirmer/i)).toBeNull();
  });

  it('opens the same month calendar from the calendar button', async () => {
    const view = await renderAgenda();

    await press(view, 'agenda-date-calendar');
    expect(calendarMonth(view)).toBe('Septembre 2026');
    expect(
      within(view.getByTestId('agenda-month-calendar-weekdays'))
        .getAllByText(/^[A-Z][a-z]{2}$/)
        .map((header) => header.props.children),
    ).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
  });

  it('keeps its appointment dots on the shared calendar, never a revenue halo', async () => {
    const view = await renderAgenda();
    await press(view, 'agenda-date-date-button');

    // Nadia (today) and Anaïs (17 September) hold appointments.
    expect(view.getByTestId('agenda-month-calendar-day-2026-09-16-dot')).toBeTruthy();
    expect(view.getByTestId('agenda-month-calendar-day-2026-09-17-dot')).toBeTruthy();
    expect(view.getByTestId('agenda-month-calendar-day-2026-09-17').props.accessibilityLabel).toBe(
      'Jeudi 17 septembre, rendez-vous prévus',
    );
    expect(view.queryAllByTestId(/-intensity-/)).toHaveLength(0);
    expect(view.queryByText(/encaiss/)).toBeNull();
    // The Caisse heatmap hint and its info control never reach the Agenda.
    expect(view.queryByText('Intensité du chiffre d’affaires')).toBeNull();
    expect(view.queryByLabelText('À propos des couleurs du chiffre d’affaires')).toBeNull();
    expect(view.queryByTestId('agenda-month-calendar-overlay')).toBeNull();
  });

  it('browses months without moving the Agenda, then opens a tapped day and keeps the arrows in step', async () => {
    const view = await renderAgenda();
    await press(view, 'agenda-date-date-button');

    await press(view, 'agenda-month-calendar-navigation-next');
    expect(calendarMonth(view)).toBe('Octobre 2026');
    await press(view, 'agenda-month-calendar-navigation-previous');
    await press(view, 'agenda-month-calendar-navigation-previous');
    expect(calendarMonth(view)).toBe('Août 2026');
    // Browsing is not selecting: the Agenda still shows today.
    expect(selectedDate(view)).toBe('Mercredi 16 sept.');

    await press(view, 'agenda-month-calendar-navigation-next');
    await press(view, 'agenda-month-calendar-navigation-next');
    await press(view, 'agenda-month-calendar-day-2026-10-07');
    await settleSheetTransition();

    expect(view.queryByTestId('agenda-month-calendar')).toBeNull();
    expect(selectedDate(view)).toBe('Mercredi 7 oct.');
    await press(view, 'agenda-date-previous');
    expect(selectedDate(view)).toBe('Mardi 6 oct.');
    await press(view, 'agenda-date-next');
    await press(view, 'agenda-date-next');
    expect(selectedDate(view)).toBe('Jeudi 8 oct.');

    // Reopened after the arrows moved: the month of the day now shown.
    await press(view, 'agenda-date-date-button');
    expect(calendarMonth(view)).toBe('Octobre 2026');
    expect(view.getByTestId('agenda-month-calendar-day-2026-10-08').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('shows the tapped day on the timeline, adjacent-month days included', async () => {
    const view = await renderAgenda();
    expect(view.getByLabelText(/^Nadia/)).toBeTruthy();

    await pickAgendaDay(view, new Date(2026, 8, 17));
    expect(selectedDate(view)).toBe('Jeudi 17 sept.');
    expect(view.getByLabelText(/^Anaïs/)).toBeTruthy();
    expect(view.queryByLabelText(/^Nadia/)).toBeNull();

    // The September grid ends on Sunday 11 October: a real October day.
    await press(view, 'agenda-date-date-button');
    await press(view, 'agenda-month-calendar-day-2026-10-01');
    await settleSheetTransition();
    expect(view.queryByTestId('agenda-month-calendar')).toBeNull();
    expect(selectedDate(view)).toBe('Jeudi 1 oct.');
  });

  it('dots the days of the Agenda appointments only — never a personal block', async () => {
    const database = openTestDatabase();
    bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
    // Friday 18 holds no appointment, only personal unavailability.
    insertCalendarBlock(database, {
      id: 'block-friday',
      businessId: testBusiness.id,
      staffMemberId: 'staff-amelie',
      startAt: new Date(2026, 8, 18, 12),
      endAt: new Date(2026, 8, 18, 13),
      reason: 'Pause',
    });
    const view = await renderAgenda(database);
    await press(view, 'agenda-date-date-button');

    const dot = (id: string) => view.queryByTestId(`agenda-month-calendar-day-${id}-dot`);
    // The fixtures: Julie on the 15th, several on the 16th, Anaïs on the 17th — one dot each.
    for (const id of ['2026-09-15', '2026-09-16', '2026-09-17']) {
      expect(dot(id)).toBeTruthy();
      expect(view.getByTestId(`agenda-month-calendar-day-${id}`).props.accessibilityLabel).toMatch(
        /rendez-vous prévus$/,
      );
    }
    expect(view.getAllByTestId(/^agenda-month-calendar-day-2026-09-16-dot$/)).toHaveLength(1);
    expect(dot('2026-09-18')).toBeNull();
    expect(view.getByTestId('agenda-month-calendar-day-2026-09-18').props.accessibilityLabel).toBe(
      'Vendredi 18 septembre',
    );
    expect(dot('2026-09-21')).toBeNull();

    // The Day view does show the block on the 18th: only the calendar ignores it.
    await press(view, 'agenda-month-calendar-day-2026-09-18');
    await settleSheetTransition();
    expect(view.getAllByLabelText(/Indisponible/).length).toBeGreaterThan(0);
  });

  const openDaySummary = async (view: AgendaView) => {
    await settleFloatingReveal();
    await press(view, 'agenda-create');
    await press(view, 'agenda-day-summary');
  };

  it('prints the summary of today from the + menu, with every figure of the day', async () => {
    const print = jest.spyOn(haptics, 'print');
    const view = await renderAgenda();
    expect(view.queryByTestId('day-summary-receipt')).toBeNull();

    await openDaySummary(view);

    expect(view.getByRole('header', { name: 'Résumé du jour' })).toBeTruthy();
    expect(view.getByTestId('day-summary-date').props.children).toBe('Mercredi 16 septembre');
    expect(view.getByTestId('day-summary-count').props.children).toBe('5 rendez-vous');
    // Two techniques at 95 € and three services at 42 €, nothing checked out yet.
    expect(view.getByLabelText(`CA potentiel, ${formatEuroCents(31600)}`)).toBeTruthy();
    expect(view.getByLabelText(`Déjà encaissé, ${formatEuroCents(0)}`)).toBeTruthy();
    expect(view.getByLabelText(`Reste à encaisser, ${formatEuroCents(31600)}`)).toBeTruthy();
    expect(view.getByLabelText('Temps total, 5 h 15 min')).toBeTruthy();
    expect(view.getByLabelText(`Panier moyen, ${formatEuroCents(6320)}`)).toBeTruthy();
    expect(
      view.getByLabelText(`09:00, Coloration, Léa Martin, ${formatEuroCents(9500)}`),
    ).toBeTruthy();

    // ONE haptic, when the paper — once laid out — starts feeding.
    expect(print).not.toHaveBeenCalled();
    for (const height of [520, 524]) {
      await act(async () =>
        fireEvent(view.getByTestId('day-summary-paper'), 'layout', {
          nativeEvent: { layout: { height, width: 340, x: 0, y: 0 } },
        }),
      );
    }
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('summarises the day the Agenda is showing, and closes through « Fermer »', async () => {
    const view = await renderAgenda();
    await press(view, 'agenda-date-next');

    await openDaySummary(view);
    expect(view.getByTestId('day-summary-date').props.children).toBe('Jeudi 17 septembre');
    expect(view.getByLabelText(/^\d{2}:\d{2}, .*Anaïs/)).toBeTruthy();

    await press(view, 'day-summary-close');
    await act(async () => {
      jest.advanceTimersByTime(receiptPrint.dismiss);
    });
    expect(view.queryByTestId('day-summary-receipt')).toBeNull();
    // The Agenda is untouched underneath.
    expect(selectedDate(view)).toBe('Jeudi 17 sept.');
  });

  it('prints ONE natural-height paper the printer scrolls, its BeautIzzy footer inside it', async () => {
    const view = await renderAgenda();
    await press(view, 'agenda-date-next');
    await openDaySummary(view);

    const receipt = within(view.getByTestId('day-summary-scroll')).getByTestId('day-summary-receipt');
    // Nothing scrolls inside the paper, and nothing bounds its height: no line can leave it.
    expect(receipt.queryAll((node) => node.type === 'RCTScrollView')).toHaveLength(0);
    expect(StyleSheet.flatten(receipt.props.style).maxHeight).toBeUndefined();
    expect(within(receipt).getByTestId('day-summary-list')).toBeTruthy();
    // The wordmark comes after the breakdown, in the same paper.
    const tail = receipt.queryAll(
      (node) => node.props.resizeMode === 'contain' || node.props.testID === 'day-summary-metric-averageBasket',
    );
    expect(tail).toHaveLength(2);
    expect(tail[1]!.props.resizeMode).toBe('contain');
    // The closing signature is the BeautIzzy symbol alone (taller than wide), never the wordmark.
    expect(StyleSheet.flatten(tail[1]!.props.style)).toMatchObject({
      width: RECEIPT_SIGNATURE_SIZE,
      height: Math.round((RECEIPT_SIGNATURE_SIZE * brandAssets.symbol.height) / brandAssets.symbol.width),
    });
  });

  it('still prints a neutral summary on a free day', async () => {
    const view = await renderAgenda();
    await pickAgendaDay(view, new Date(2026, 10, 3));

    await openDaySummary(view);

    expect(view.getByTestId('day-summary-date').props.children).toBe('Mardi 3 novembre');
    expect(view.getByTestId('day-summary-count').props.children).toBe('Aucun rendez-vous');
    expect(view.getByText('Cette journée est libre')).toBeTruthy();
    expect(view.queryByTestId('day-summary-list')).toBeNull();
    expect(view.getByLabelText(`CA potentiel, ${formatEuroCents(0)}`)).toBeTruthy();
    expect(view.getByLabelText('Temps total, 0 min')).toBeTruthy();
  });

  const switchToWeek = async (view: AgendaView) => {
    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine'));
    });
  };
  const menuLabels = async (view: AgendaView) => {
    await settleFloatingReveal();
    await press(view, 'agenda-create');
    const labels = view.getAllByRole('menuitem').map((option) => option.props.accessibilityLabel);
    await press(view, 'agenda-create');
    return labels;
  };
  const openWeekSummary = async (view: AgendaView) => {
    await settleFloatingReveal();
    await press(view, 'agenda-create');
    await press(view, 'agenda-week-summary');
  };
  const closeWeekSummary = async (view: AgendaView) => {
    await press(view, 'week-summary-close');
    await act(async () => {
      jest.advanceTimersByTime(receiptPrint.dismiss);
    });
  };
  const weekRange = (view: AgendaView) => view.getByTestId('week-summary-date').props.children as string;

  describe('« Résumé de la semaine »', () => {
    it('follows the Jour / Semaine mode in the + menu, never both', async () => {
      const view = await renderAgenda();
      const day = ['Nouveau rendez-vous', 'Estimation', 'Résumé du jour', 'Tops & tendances'];
      const week = ['Nouveau rendez-vous', 'Estimation', 'Résumé de la semaine', 'Tops & tendances'];

      expect(await menuLabels(view)).toEqual(day);
      await switchToWeek(view);
      expect(await menuLabels(view)).toEqual(week);
      await act(async () => {
        fireEvent.press(view.getByLabelText('Jour'));
      });
      expect(await menuLabels(view)).toEqual(day);
      expect(view.queryByTestId('agenda-week-summary')).toBeNull();
    });

    it('prints the week the Agenda shows, and follows the week navigation', async () => {
      const view = await renderAgenda();
      await switchToWeek(view);

      await openWeekSummary(view);
      expect(view.getByRole('header', { name: 'Résumé de la semaine' })).toBeTruthy();
      expect(weekRange(view)).toBe('14 – 20 septembre 2026');
      expect(view.queryByTestId('day-summary-receipt')).toBeNull();
      // The week's big picture: no Appointment list.
      expect(view.queryByTestId('week-summary-list')).toBeNull();
      expect(view.getByTestId('week-summary-activity')).toBeTruthy();
      await closeWeekSummary(view);
      expect(view.queryByTestId('week-summary-receipt')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByLabelText('Semaine suivante'));
      });
      await openWeekSummary(view);
      expect(weekRange(view)).toBe('21 – 27 septembre 2026');
      await closeWeekSummary(view);

      await act(async () => {
        fireEvent.press(view.getByLabelText('Semaine suivante'));
      });
      await openWeekSummary(view);
      expect(weekRange(view)).toBe('28 septembre – 4 octobre 2026');
    });

    it('adds up a mixed current week with the rules of « Résumé du jour », blocks and deletions left out', async () => {
      const database = openTestDatabase();
      bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
      const [template] = loadAppointments(database);
      const extra = (overrides: Partial<Appointment> & Pick<Appointment, 'id' | 'startAt'>): Appointment => ({
        ...template,
        status: 'SCHEDULED',
        payment: undefined,
        discount: undefined,
        cancellation: undefined,
        noShow: undefined,
        ...overrides,
      });
      // Monday 14 → Sunday 20 September; today is Wednesday 16.
      insertAppointment(
        database,
        extra({
          id: 'week-paid',
          startAt: new Date(2026, 8, 14, 18, 0),
          status: 'COMPLETED',
          discount: { type: 'PERCENT', percent: 20 },
          payment: { paidAt: new Date(2026, 8, 14, 19, 0), cardAmountCents: 5000, cashAmountCents: 0 },
        }),
      );
      insertAppointment(
        database,
        extra({
          id: 'week-no-show',
          startAt: new Date(2026, 8, 15, 18, 0),
          status: 'NO_SHOW',
          noShow: { recordedAt: new Date(2026, 8, 15, 18, 30) },
        }),
      );
      insertAppointment(
        database,
        extra({
          id: 'week-cancelled',
          startAt: new Date(2026, 8, 17, 18, 0),
          status: 'CANCELLED',
          cancellation: { cancelledAt: new Date(2026, 8, 12), cancelledBy: 'CLIENT' },
        }),
      );
      insertAppointment(database, extra({ id: 'week-deposit', startAt: new Date(2026, 8, 19, 10, 0) }));
      insertAppointmentDeposit(database, {
        id: 'deposit-week',
        businessId: testBusiness.id,
        appointmentId: 'week-deposit',
        amountCents: 2000,
        paymentMethod: 'CASH',
        paidAt: new Date(2026, 8, 2, 12, 0),
        status: 'ACTIVE',
        createdAt: new Date(2026, 8, 2, 12, 0),
      });
      insertAppointment(database, extra({ id: 'week-deleted', startAt: new Date(2026, 8, 19, 15, 0) }));
      deleteAppointment(database, 'week-deleted');
      insertCalendarBlock(database, {
        id: 'block-week',
        businessId: testBusiness.id,
        staffMemberId: 'staff-amelie',
        startAt: new Date(2026, 8, 18, 12),
        endAt: new Date(2026, 8, 18, 13),
        reason: 'Pause',
      });
      // Next week: never part of this one.
      insertAppointment(database, extra({ id: 'next-week', startAt: new Date(2026, 8, 21, 10, 0) }));

      const view = await renderAgenda(database);
      await switchToWeek(view);
      await openWeekSummary(view);

      // The session state at print time (past fixtures auto-completed at mount),
      // summed day by day with the authoritative day summary.
      const appointments = loadAppointments(database);
      const deposits = loadAppointmentDeposits(database);
      const days = getWeekDays(new Date(2026, 8, 16)).map((day) =>
        getAppointmentDaySummary({ appointments, sales: [], deposits }, day),
      );
      const sum = (pick: (day: (typeof days)[number]) => number) =>
        days.reduce((total, day) => total + pick(day), 0);
      const inWeek = appointments.filter(
        (entry) => entry.startAt >= new Date(2026, 8, 14) && entry.startAt < new Date(2026, 8, 21),
      );
      const count = sum((day) => day.appointmentCount);
      const completed = inWeek.filter((entry) => entry.status === 'COMPLETED').length;

      expect(inWeek.map((entry) => entry.id)).not.toContain('week-deleted');
      expect(completed).toBeGreaterThanOrEqual(1);
      expect(view.getByTestId('week-summary-count').props.children).toBe(`${count} rendez-vous`);
      expect(view.getByLabelText(`CA potentiel, ${formatEuroCents(sum((day) => day.potentialRevenueCents))}`)).toBeTruthy();
      expect(view.getByLabelText(`Déjà encaissé, ${formatEuroCents(sum((day) => day.collectedCents))}`)).toBeTruthy();
      expect(
        view.getByLabelText(`Reste à encaisser, ${formatEuroCents(sum((day) => day.remainingToCollectCents))}`),
      ).toBeTruthy();
      // The discounted checkout and the early deposit are in; no-show and cancelled are not.
      expect(sum((day) => day.collectedCents)).toBe(7000);
      expect(view.getByLabelText(`Panier moyen, ${formatEuroCents(Math.round(sum((day) => day.potentialRevenueCents) / count))}`)).toBeTruthy();

      const activity = within(view.getByTestId('week-summary-activity'));
      expect(activity.getByTestId('week-summary-activity-completed')).toHaveProp(
        'accessibilityLabel',
        `${completed} rendez-vous réalisé${completed > 1 ? 's' : ''}`,
      );
      const planned = count - completed;
      expect(activity.getByTestId('week-summary-activity-planned')).toHaveProp(
        'accessibilityLabel',
        `${planned} rendez-vous prévu${planned > 1 ? 's' : ''}`,
      );
      expect(activity.getByLabelText('1 rendez-vous annulé')).toBeTruthy();
      expect(activity.getByLabelText('1 absence')).toBeTruthy();
      // Calendar Blocks are never a rendez-vous: the Week view shows the block, the receipt never does.
      expect(view.getAllByText('Indisponible').length).toBeGreaterThan(0);
      expect(within(view.getByTestId('week-summary-receipt')).queryByText(/Indisponible/)).toBeNull();
    });

    it('prints a zero week safely', async () => {
      const view = await renderAgenda();
      await pickAgendaDay(view, new Date(2026, 10, 4));
      await switchToWeek(view);

      await openWeekSummary(view);

      expect(weekRange(view)).toBe('2 – 8 novembre 2026');
      expect(view.getByTestId('week-summary-count').props.children).toBe('Aucun rendez-vous');
      expect(view.getByLabelText(`CA potentiel, ${formatEuroCents(0)}`)).toBeTruthy();
      expect(view.getByLabelText(`Déjà encaissé, ${formatEuroCents(0)}`)).toBeTruthy();
      expect(view.getByLabelText(`Reste à encaisser, ${formatEuroCents(0)}`)).toBeTruthy();
      expect(view.getByLabelText('0 rendez-vous réalisé')).toBeTruthy();
      expect(view.getByLabelText('0 absence')).toBeTruthy();
    });
  });

  const openInsights = async (view: AgendaView) => {
    await settleFloatingReveal();
    await press(view, 'agenda-create');
    await press(view, 'agenda-insights');
  };
  const periodLabel = (view: AgendaView) =>
    view.getByTestId('business-insights-period-label').props.children as string;
  const receipt = (view: AgendaView) => within(view.getByTestId('business-insights-receipt'));

  it('prints « Tops & tendances » on the month of the Agenda date, with ONE print haptic', async () => {
    const print = jest.spyOn(haptics, 'print');
    const view = await renderAgenda();
    expect(view.queryByTestId('business-insights-receipt')).toBeNull();

    await openInsights(view);

    expect(view.getByRole('header', { name: 'Tops & tendances' })).toBeTruthy();
    expect(periodLabel(view)).toBe('Septembre 2026');
    expect(receipt(view).getByRole('tab', { name: 'Mois' }).props.accessibilityState).toEqual({ selected: true });
    expect(receipt(view).getByRole('tab', { name: 'Jour' }).props.accessibilityState).toEqual({ selected: false });
    expect(view.getByLabelText(/^Encaissé, /)).toBeTruthy();
    // The seeded visit of Tuesday 15 was completed by the past-day rule.
    expect(view.getByTestId('business-insights-completed').props.accessibilityLabel).toMatch(
      /^[1-9]\d* rendez-vous réalisés?$/,
    );
    expect(view.getByLabelText(/^Panier moyen, /)).toBeTruthy();
    // ONE horizontal carousel, first on Top prestations, with its podium.
    expect(view.getByTestId('business-insights-rankings').props.horizontal).toBe(true);
    expect(view.getByTestId('business-insights-pagination').props.accessibilityLabel).toBe(
      'Top prestations, 1 sur 4',
    );
    expect(view.getByLabelText(/^Première place, .+, \d+ prestations?$/)).toBeTruthy();
    // Service places are not interactive (client places are: BusinessInsightsTicket test),
    // « Partager » sits next to « Fermer », and there is no « moins ».
    expect(view.getByRole('button', { name: 'Partager' })).toBeTruthy();
    expect(view.getByTestId('business-insights-close')).toBeTruthy();
    expect(view.queryByText(/dépensent le moins/)).toBeNull();

    expect(print).not.toHaveBeenCalled();
    for (const height of [560, 580]) {
      await act(async () =>
        fireEvent(view.getByTestId('business-insights-paper'), 'layout', {
          nativeEvent: { layout: { height, width: 340, x: 0, y: 0 } },
        }),
      );
    }
    // Swiping categories and browsing periods re-lay the paper out: it never prints again.
    await act(async () =>
      fireEvent(view.getByTestId('business-insights-rankings'), 'momentumScrollEnd', {
        // Past the end: the carousel settles on its last category.
        nativeEvent: { contentOffset: { x: 10_000, y: 0 } },
      }),
    );
    expect(view.getByTestId('business-insights-pagination').props.accessibilityLabel).toBe(
      'Clients les plus fidèles, 4 sur 4',
    );
    expect(view.getByLabelText(/^Première place, .+, \d+ rendez-vous$/)).toBeTruthy();
    await press(view, 'business-insights-period-year');
    await act(async () =>
      fireEvent(view.getByTestId('business-insights-paper'), 'layout', {
        nativeEvent: { layout: { height: 600, width: 340, x: 0, y: 0 } },
      }),
    );
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('anchors on the Agenda date and browses its own periods without moving the Agenda', async () => {
    const selection = jest.spyOn(haptics, 'selection');
    const view = await renderAgenda();
    await pickAgendaDay(view, new Date(2027, 0, 1));
    const agendaDate = selectedDate(view);

    await openInsights(view);
    expect(periodLabel(view)).toBe('Janvier 2027');

    selection.mockClear();
    await press(view, 'business-insights-period-month');
    expect(selection).not.toHaveBeenCalled();

    await press(view, 'business-insights-period-day');
    expect(selection).toHaveBeenCalledTimes(1);
    expect(periodLabel(view)).toBe('1 janv. 2027');
    expect(receipt(view).getByRole('button', { name: 'Jour précédent' })).toBeTruthy();
    await press(view, 'business-insights-navigator-previous');
    expect(periodLabel(view)).toBe('31 déc. 2026');

    await press(view, 'business-insights-period-week');
    expect(periodLabel(view)).toBe('28 déc. 2026 – 3 janv. 2027');
    await press(view, 'business-insights-navigator-previous');
    expect(periodLabel(view)).toBe('21 – 27 déc. 2026');
    expect(receipt(view).getByRole('button', { name: 'Semaine suivante' })).toBeTruthy();

    await press(view, 'business-insights-period-year');
    expect(periodLabel(view)).toBe('2026');
    await press(view, 'business-insights-navigator-next');
    expect(periodLabel(view)).toBe('2027');
    expect(receipt(view).getByRole('button', { name: 'Année précédente' })).toBeTruthy();

    await press(view, 'business-insights-period-month');
    expect(periodLabel(view)).toBe('Décembre 2027');
    await press(view, 'business-insights-navigator-next');
    expect(periodLabel(view)).toBe('Janvier 2028');
    expect(receipt(view).getByRole('button', { name: 'Mois précédent' })).toBeTruthy();

    await press(view, 'business-insights-close');
    await act(async () => {
      jest.advanceTimersByTime(receiptPrint.dismiss);
    });
    expect(view.queryByTestId('business-insights-receipt')).toBeNull();
    expect(selectedDate(view)).toBe(agendaDate);

    // Every opening starts again from the Agenda date, on the month.
    await openInsights(view);
    expect(periodLabel(view)).toBe('Janvier 2027');
    expect(receipt(view).getByRole('tab', { name: 'Mois' }).props.accessibilityState).toEqual({ selected: true });
    selection.mockRestore();
  });

  it('prints a complete zero ticket for a period without activity, and closes from the dimmed page', async () => {
    const view = await renderAgenda();
    await openInsights(view);
    await press(view, 'business-insights-period-year');
    for (let step = 0; step < 4; step += 1) {
      await press(view, 'business-insights-navigator-next');
    }
    expect(periodLabel(view)).toBe('2030');

    expect(view.getByLabelText(`Encaissé, ${formatEuroCents(0)}`)).toBeTruthy();
    expect(view.getByLabelText('0 rendez-vous réalisés')).toBeTruthy();
    expect(view.getByLabelText(`Panier moyen, ${formatEuroCents(0)}`)).toBeTruthy();
    expect(view.getByText('Aucune activité sur cette période')).toBeTruthy();
    // Each category keeps its own quiet message; no placeholder place.
    expect(view.getByText('Aucune prestation sur cette période')).toBeTruthy();
    expect(view.queryByLabelText(/place,/)).toBeNull();

    await press(view, 'business-insights-backdrop');
    await act(async () => {
      jest.advanceTimersByTime(receiptPrint.dismiss);
    });
    expect(view.queryByTestId('business-insights-receipt')).toBeNull();
  });

  describe('sharing « Tops & tendances »', () => {
    const shareCard = (view: AgendaView) =>
      within(view.getByTestId('business-insights-share-card', { includeHiddenElements: true }));
    const shareCardText = (view: AgendaView, testID: string) =>
      view.getByTestId(`business-insights-share-card-${testID}`, { includeHiddenElements: true }).props
        .children as string;
    const shareButton = (view: AgendaView) => view.getByTestId('business-insights-share');
    // The card is mounted off screen and hidden from assistive technology.
    const HIDDEN = { includeHiddenElements: true } as const;

    beforeEach(() => {
      mockViewShot.captureRef.mockReset().mockResolvedValue('/tmp/ReactNative/insights.png');
      mockViewShot.releaseCapture.mockReset();
      mockSharing.isAvailableAsync.mockReset().mockResolvedValue(true);
      mockSharing.shareAsync.mockReset().mockResolvedValue(undefined);
      mockMediaLibrary.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, status: 'granted' });
      mockMediaLibrary.Asset.create.mockReset().mockResolvedValue({ id: 'asset-1' });
    });

    const noticeText = (view: AgendaView) =>
      view.queryByTestId('business-insights-notice')?.props.children as string | undefined;
    const capturedFrameIDs = () =>
      mockViewShot.captureRef.mock.calls.map(
        ([target]) => (target as { current: { props: { testID?: string } } }).current.props.testID,
      );

    it('is offered by « Tops & tendances » only, never by « Résumé du jour »', async () => {
      const view = await renderAgenda();
      await openDaySummary(view);
      // The same icon-only close button as « Tops & tendances », alone.
      expect(view.getByTestId('day-summary-close').props.accessibilityLabel).toBe('Fermer');
      expect(view.queryByText('Fermer')).toBeNull();
      expect(view.queryByTestId('business-insights-save')).toBeNull();
      expect(view.queryByLabelText(/^(Enregistrer|Partager)/)).toBeNull();
      expect(view.queryByText('Partager')).toBeNull();
      expect(view.queryByTestId('day-summary-offstage', { includeHiddenElements: true })).toBeNull();
      await press(view, 'day-summary-close');
      await act(async () => {
        jest.advanceTimersByTime(receiptPrint.dismiss);
      });

      await openInsights(view);
      const button = shareButton(view);
      expect(button.props.accessibilityLabel).toBe('Partager');
      expect(button.props.accessibilityRole).toBe('button');
      // Icon-only: the label is spoken, not written.
      expect(within(button).queryByText('Partager')).toBeNull();
    });

    it('shares the browsed period and the settled category, as one image, without closing the ticket', async () => {
      const action = jest.spyOn(haptics, 'action');
      const view = await renderAgenda();
      await openInsights(view);
      await press(view, 'business-insights-period-year');
      await act(async () =>
        fireEvent(view.getByTestId('business-insights-rankings'), 'momentumScrollEnd', {
          nativeEvent: { contentOffset: { x: 10_000, y: 0 } },
        }),
      );
      await press(view, 'business-insights-page-indicator-products');
      expect(periodLabel(view)).toBe('2026');

      // The public card follows the screen — not the Agenda month.
      expect(shareCardText(view, 'period')).toBe('2026');
      expect(shareCard(view).getByText('Top produits', HIDDEN)).toBeTruthy();
      // The ticket shows its turnover; the public card frosts it: no amount is ever rendered.
      const cash = (view.getByTestId('business-insights-cash').props.accessibilityLabel as string).replace(
        'Encaissé, ',
        '',
      );
      expect(shareCard(view).queryByText(cash, HIDDEN)).toBeNull();
      expect(
        within(view.getByTestId('business-insights-share-card-cash', { includeHiddenElements: true })).getByText(
          '€',
          HIDDEN,
        ),
      ).toBeTruthy();

      await press(view, 'business-insights-share');

      expect(action).toHaveBeenCalledTimes(1);
      expect(mockViewShot.captureRef).toHaveBeenCalledTimes(1);
      const [target, options] = mockViewShot.captureRef.mock.calls[0] as [
        { current: unknown },
        Record<string, unknown>,
      ];
      // The dedicated export frame is captured, never the receipt or the screen.
      expect((target.current as { props: { testID?: string } }).props.testID).toBe('business-insights-share-frame');
      expect(options).toMatchObject({ format: 'png', result: 'tmpfile' });
      expect(mockSharing.shareAsync).toHaveBeenCalledWith(
        'file:///tmp/ReactNative/insights.png',
        expect.objectContaining({ mimeType: 'image/png' }),
      );
      // The temporary image is released once the sheet is dismissed.
      expect(mockViewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/insights.png');

      // Dismissing the share sheet leaves the ticket open, where it was.
      expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
      expect(periodLabel(view)).toBe('2026');
      expect(view.getByTestId('business-insights-pagination').props.accessibilityLabel).toBe(
        'Top produits, 2 sur 4',
      );
      expect(shareButton(view).props.accessibilityState).toMatchObject({ busy: false, disabled: false });

      // The carousel keeps working after a share.
      await act(async () =>
        fireEvent(view.getByTestId('business-insights-rankings'), 'momentumScrollEnd', {
          nativeEvent: { contentOffset: { x: 0, y: 0 } },
        }),
      );
      expect(view.getByTestId('business-insights-pagination').props.accessibilityLabel).toBe(
        'Top prestations, 1 sur 4',
      );
      expect(shareCard(view).getByText('Top prestations', HIDDEN)).toBeTruthy();
      action.mockRestore();
    });

    it('prepares ONE image from a double tap, busy until the sheet is gone', async () => {
      let finishCapture: (uri: string) => void = () => undefined;
      mockViewShot.captureRef.mockReturnValue(
        new Promise<string>((resolve) => {
          finishCapture = resolve;
        }),
      );
      const action = jest.spyOn(haptics, 'action');
      const view = await renderAgenda();
      await openInsights(view);

      await press(view, 'business-insights-share');
      expect(shareButton(view).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
      // The second tap lands on the busy capsule: ignored.
      await press(view, 'business-insights-share');

      await act(async () => {
        finishCapture('/tmp/ReactNative/once.png');
      });
      expect(mockViewShot.captureRef).toHaveBeenCalledTimes(1);
      expect(mockSharing.shareAsync).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledTimes(1);
      expect(shareButton(view).props.accessibilityState).toMatchObject({ busy: false });
      action.mockRestore();
    });

    it('offers Fermer, Enregistrer and Partager as labelled icon buttons, in that order', async () => {
      const view = await renderAgenda();
      await openInsights(view);
      const actions = ['business-insights-close', 'business-insights-save', 'business-insights-share'].map(
        (testID) => view.getByTestId(testID).props.accessibilityLabel as string,
      );
      expect(actions).toEqual(['Fermer', 'Enregistrer l’image', 'Partager']);
      for (const testID of ['business-insights-close', 'business-insights-save', 'business-insights-share']) {
        expect(view.getByTestId(testID).props.accessibilityRole).toBe('button');
      }
      // Icon-only buttons: no visible words in the action row.
      expect(view.queryByText(/^(Fermer|Enregistrer|Partager)$/)).toBeNull();

      // « Fermer » still closes the ticket.
      await press(view, 'business-insights-close');
      await act(async () => {
        jest.advanceTimersByTime(receiptPrint.dismiss);
      });
      expect(view.queryByTestId('business-insights-receipt')).toBeNull();
    });

    it('saves the SAME card to Photos, confirms it once with one success haptic, and keeps the ticket as it was', async () => {
      const success = jest.spyOn(haptics, 'success');
      const view = await renderAgenda();
      await openInsights(view);
      await press(view, 'business-insights-period-year');
      await press(view, 'business-insights-page-indicator-products');

      await press(view, 'business-insights-save');

      expect(mockMediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
      expect(mockMediaLibrary.Asset.create).toHaveBeenCalledTimes(1);
      expect(mockMediaLibrary.Asset.create).toHaveBeenCalledWith('file:///tmp/ReactNative/insights.png');
      expect(mockViewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/insights.png');
      expect(mockSharing.shareAsync).not.toHaveBeenCalled();
      expect(noticeText(view)).toBe('Image enregistrée dans Photos');
      expect(success).toHaveBeenCalledTimes(1);
      // Same period, same category, still open.
      expect(periodLabel(view)).toBe('2026');
      expect(view.getByTestId('business-insights-pagination').props.accessibilityLabel).toBe('Top produits, 2 sur 4');

      // Save and share capture the very same export frame.
      await press(view, 'business-insights-share');
      expect(capturedFrameIDs()).toEqual(['business-insights-share-frame', 'business-insights-share-frame']);
      // Sharing never claims a save, and clears the previous confirmation.
      expect(noticeText(view)).toBeUndefined();
      expect(success).toHaveBeenCalledTimes(1);
      success.mockRestore();
    });

    it('lets the save confirmation go away on its own', async () => {
      const view = await renderAgenda();
      await openInsights(view);
      await press(view, 'business-insights-save');
      expect(noticeText(view)).toBe('Image enregistrée dans Photos');

      await act(async () => {
        jest.advanceTimersByTime(INSIGHTS_SAVED_NOTICE_DURATION);
      });
      expect(noticeText(view)).toBeUndefined();
      expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
    });

    it('never confirms a save when the share sheet closes', async () => {
      const success = jest.spyOn(haptics, 'success');
      const view = await renderAgenda();
      await openInsights(view);
      await press(view, 'business-insights-share');

      expect(mockSharing.shareAsync).toHaveBeenCalledTimes(1);
      expect(noticeText(view)).toBeUndefined();
      expect(view.queryByText('Image enregistrée dans Photos')).toBeNull();
      expect(mockMediaLibrary.Asset.create).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
      success.mockRestore();
    });

    it('saves ONE image from a double tap, and holds Partager while saving', async () => {
      let finishSave: () => void = () => undefined;
      mockMediaLibrary.Asset.create.mockReturnValue(
        new Promise((resolve) => {
          finishSave = () => resolve({ id: 'asset-1' });
        }),
      );
      const success = jest.spyOn(haptics, 'success');
      const view = await renderAgenda();
      await openInsights(view);

      await press(view, 'business-insights-save');
      expect(view.getByTestId('business-insights-save').props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      });
      expect(view.getByTestId('business-insights-share').props.accessibilityState).toMatchObject({ disabled: true });
      await press(view, 'business-insights-save');
      await press(view, 'business-insights-share');

      await act(async () => {
        finishSave();
      });
      expect(mockViewShot.captureRef).toHaveBeenCalledTimes(1);
      expect(mockMediaLibrary.Asset.create).toHaveBeenCalledTimes(1);
      expect(mockSharing.shareAsync).not.toHaveBeenCalled();
      expect(success).toHaveBeenCalledTimes(1);
      expect(view.getByTestId('business-insights-save').props.accessibilityState).toMatchObject({ busy: false });
      success.mockRestore();
    });

    it('explains a declined Photos permission inline, without capturing or confirming anything', async () => {
      mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
      const view = await renderAgenda();
      await openInsights(view);

      await press(view, 'business-insights-save');

      expect(noticeText(view)).toBe(
        'BeautIzzy n’a pas accès à Photos. Autorisez-le dans Réglages pour enregistrer l’image.',
      );
      expect(mockViewShot.captureRef).not.toHaveBeenCalled();
      expect(mockMediaLibrary.Asset.create).not.toHaveBeenCalled();
      expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
    });

    it('shows a retryable error when the image cannot be saved', async () => {
      mockMediaLibrary.Asset.create.mockRejectedValueOnce(new Error('library failed'));
      const success = jest.spyOn(haptics, 'success');
      const view = await renderAgenda();
      await openInsights(view);

      await press(view, 'business-insights-save');
      expect(noticeText(view)).toBe('Impossible d’enregistrer l’image.');
      expect(success).not.toHaveBeenCalled();
      expect(view.getByTestId('business-insights-receipt')).toBeTruthy();

      await press(view, 'business-insights-save');
      expect(noticeText(view)).toBe('Image enregistrée dans Photos');
      expect(success).toHaveBeenCalledTimes(1);
      success.mockRestore();
    });

    it('shows a retryable message when the image cannot be prepared, and keeps the ticket open', async () => {
      mockViewShot.captureRef.mockRejectedValueOnce(new Error('capture failed'));
      const view = await renderAgenda();
      await openInsights(view);

      await press(view, 'business-insights-share');

      expect(view.getByTestId('business-insights-notice').props.children).toBe(
        'Impossible de préparer le partage.',
      );
      expect(mockSharing.shareAsync).not.toHaveBeenCalled();
      expect(view.getByTestId('business-insights-receipt')).toBeTruthy();

      // Retry succeeds and clears the message.
      await press(view, 'business-insights-share');
      expect(mockSharing.shareAsync).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId('business-insights-notice')).toBeNull();
      expect(view.getByTestId('business-insights-receipt')).toBeTruthy();
    });

    it('shares the client podiums of the ticket: same people as « Prénom N. », same order, « rdv »', async () => {
      const view = await renderAgenda();
      await openInsights(view);
      const placesOf = (root: ReturnType<AgendaView['getByTestId']>) =>
        within(root)
          .queryAllByLabelText(/^(Première|Deuxième|Troisième) place, /, HIDDEN)
          .map((node) => (node.props.accessibilityLabel as string).split(', '));
      const cardPlaces = () =>
        placesOf(view.getByTestId('business-insights-share-card-highlight', { includeHiddenElements: true }));

      // Loyalty: identical places — same names, same visit counts.
      await press(view, 'business-insights-page-indicator-loyalClients');
      const loyal = placesOf(view.getByTestId('business-insights-podium-loyalClients'));
      expect(loyal.length).toBeGreaterThan(0);
      expect(cardPlaces()).toEqual(loyal);
      // Visits read « rdv » on both podiums, never a truncated « rendez-v… ».
      expect(within(view.getByTestId('business-insights-podium-loyalClients')).getAllByText(/^\d+ rdv$/).length).toBe(
        loyal.length,
      );
      expect(shareCard(view).getAllByText(/^\d+ rdv$/, HIDDEN).length).toBe(loyal.length);

      // Spending: same people in the same order; the amount is written compactly.
      await press(view, 'business-insights-page-indicator-spendingClients');
      const spending = placesOf(view.getByTestId('business-insights-podium-spendingClients'));
      expect(cardPlaces().map(([place, name]) => [place, name])).toEqual(
        spending.map(([place, name]) => [place, name]),
      );
    });
  });

  it('keeps Week mode on its own week navigation and opens a tapped day in Day mode', async () => {
    const view = await renderAgenda();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine'));
    });
    expect(view.queryByText('Vue semaine')).toBeNull();
    expect(view.queryByText('Vue jour')).toBeNull();
    expect(view.getByRole('header', { name: 'Agenda' })).toBeTruthy();
    expect(view.queryByTestId('agenda-date')).toBeNull();
    expect(view.getByText('14 – 20 sept')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine suivante'));
    });
    expect(view.getByText('21 – 27 sept')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Semaine précédente'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText(/^Jeu 17,/));
    });
    expect(selectedDate(view)).toBe('Jeudi 17 sept.');
  });
});
