import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { radii, receiptPrint, semanticColors } from '@/shared/ui/theme';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { formatNavigatorDate } from '@/shared/ui/DateNavigator';
import { settleFloatingReveal, settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { AgendaScreen } from '../AgendaScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The « Résumé du jour » receipt printer: nothing animates under test.
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

// The canonical date picker is native; the mock exposes its value change so a
// test can pick any day.
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

function renderAgenda() {
  return render(
    <TestPersistenceProvider>
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

  it('offers « Nouveau rendez-vous », « Résumé du jour » and « Tops & tendances » from the floating +', async () => {
    const view = await renderAgenda();
    await settleFloatingReveal();

    expect(view.queryByTestId('agenda-create-menu')).toBeNull();
    await act(async () => fireEvent.press(view.getByTestId('agenda-create')));

    const options = view.getAllByRole('menuitem');
    expect(options.map((option) => option.props.accessibilityLabel)).toEqual([
      'Nouveau rendez-vous',
      'Résumé du jour',
      'Tops & tendances',
    ]);
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

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    // Wednesday: the fixtures put Julie on Tuesday 15 and Anaïs on Thursday 17.
    jest.setSystemTime(new Date(2026, 8, 16, 15, 0));
    mockPickerDate = undefined;
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

  it('jumps to any date through the calendar, and leaves it unchanged on cancel', async () => {
    const view = await renderAgenda();

    await press(view, 'agenda-date-calendar');
    expect(view.getByTestId('agenda-day-picker')).toBeTruthy();
    // Headed by the violet « AGENDA DU » eyebrow alone: no « Choisir un jour » title.
    const heading = view.getByRole('header', { name: 'AGENDA DU' });
    expect(heading.props.testID).toBe('agenda-day-picker-heading');
    expect(StyleSheet.flatten(heading.props.style)).toMatchObject({ color: semanticColors.accent });
    expect(view.queryByText('Choisir un jour')).toBeNull();
    expect(view.queryByText('Choisir une date')).toBeNull();
    mockPickerDate = new Date(2026, 8, 17, 23, 59);
    await press(view, 'mock-date-picker');
    await press(view, 'agenda-day-picker-confirm');
    await settleSheetTransition();

    expect(selectedDate(view)).toBe('Jeudi 17 sept.');
    expect(view.getByLabelText(/^Anaïs/)).toBeTruthy();

    // A cancelled pick — even after scrolling the wheel — changes nothing.
    await press(view, 'agenda-date-calendar');
    mockPickerDate = new Date(2027, 0, 1);
    await press(view, 'mock-date-picker');
    await act(async () => {
      fireEvent.press(view.getAllByText('Annuler')[0]!);
    });
    await settleSheetTransition();

    expect(selectedDate(view)).toBe('Jeudi 17 sept.');
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

  it('still prints a neutral summary on a free day', async () => {
    const view = await renderAgenda();
    await press(view, 'agenda-date-calendar');
    mockPickerDate = new Date(2026, 10, 3);
    await press(view, 'mock-date-picker');
    await press(view, 'agenda-day-picker-confirm');
    await settleSheetTransition();

    await openDaySummary(view);

    expect(view.getByTestId('day-summary-date').props.children).toBe('Mardi 3 novembre');
    expect(view.getByTestId('day-summary-count').props.children).toBe('Aucun rendez-vous');
    expect(view.getByText('Cette journée est libre')).toBeTruthy();
    expect(view.queryByTestId('day-summary-list')).toBeNull();
    expect(view.getByLabelText(`CA potentiel, ${formatEuroCents(0)}`)).toBeTruthy();
    expect(view.getByLabelText('Temps total, 0 min')).toBeTruthy();
  });

  const openInsights = async (view: AgendaView) => {
    await settleFloatingReveal();
    await press(view, 'agenda-create');
    await press(view, 'agenda-insights');
  };
  const periodLabel = (view: AgendaView) =>
    view.getByTestId('business-insights-period-label').props.children as string;
  const receipt = (view: AgendaView) => within(view.getByTestId('business-insights-receipt'));
  const pickAgendaDay = async (view: AgendaView, day: Date) => {
    await press(view, 'agenda-date-calendar');
    mockPickerDate = day;
    await press(view, 'mock-date-picker');
    await press(view, 'agenda-day-picker-confirm');
    await settleSheetTransition();
  };

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
    // No ranking is interactive, nothing is shared yet, and there is no « moins ».
    expect(view.queryByText(/Partager/)).toBeNull();
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
      'Clientes les plus fidèles, 4 sur 4',
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
