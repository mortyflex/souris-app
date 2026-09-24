// Souris — Agenda month calendar: French Monday-first grid, month browsing
// through the shared glass PeriodNavigator, one quiet dot per busy day,
// today vs selected, and a direct tap on any shown day.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { glassIconButtonSize } from '@/shared/ui/GlassIconButton';
import { radii, semanticColors } from '@/shared/ui/theme';

import { getLocalDateKey } from '../calendar/week';
import {
  getCalendarDayAccessibilityLabel,
  MonthCalendarSheet,
  MONTH_CALENDAR_WEEKDAYS,
} from '../components/MonthCalendarSheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const TODAY = new Date(2026, 8, 16);
const SELECTED = new Date(2026, 8, 23);

type SheetProps = React.ComponentProps<typeof MonthCalendarSheet>;

async function renderCalendar(props: Partial<SheetProps> = {}) {
  const handlers = { onClose: jest.fn(), onSelect: jest.fn() };
  const baseProps: SheetProps = {
    appointmentDayKeys: new Set<string>(),
    day: SELECTED,
    today: TODAY,
    testID: 'calendar',
    visible: true,
    ...handlers,
    ...props,
  };
  const view = await render(<MonthCalendarSheet {...baseProps} />);
  return { view, handlers, baseProps };
}

type View = Awaited<ReturnType<typeof renderCalendar>>['view'];

const month = (view: View) => view.getByTestId('calendar-month').props.children as string;
const press = async (view: View, testID: string) => {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
};
const markStyle = (view: View, id: string) =>
  StyleSheet.flatten(view.getByTestId(`calendar-day-${id}-mark`).props.style);

describe('MonthCalendarSheet', () => {
  it('opens on the month of the selected day, weeks starting on Monday', async () => {
    const { view } = await renderCalendar();

    expect(month(view)).toBe('Septembre 2026');
    expect(view.getByRole('header', { name: 'Septembre 2026' })).toBeTruthy();
    expect(MONTH_CALENDAR_WEEKDAYS).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
    const weekdays = within(view.getByTestId('calendar-weekdays'))
      .getAllByText(/^[A-Z][a-z]{2}$/)
      .map((header) => header.props.children);
    expect(weekdays).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
    // 1 September 2026 is a Tuesday: Monday 31 August leads the grid.
    expect(view.getByTestId('calendar-day-2026-08-31')).toBeTruthy();
    expect(view.getByTestId('calendar-day-2026-09-01')).toBeTruthy();
    expect(view.getByTestId('calendar-day-2026-09-30')).toBeTruthy();
    // No redundant titles or confirmation.
    expect(view.queryByText(/choisir/i)).toBeNull();
    expect(view.queryByText('Calendrier')).toBeNull();
    expect(view.queryByText(/valider|confirmer/i)).toBeNull();
  });

  it('browses months with the shared glass arrows without selecting anything', async () => {
    const { view, handlers } = await renderCalendar();

    await press(view, 'calendar-navigation-previous');
    expect(month(view)).toBe('Août 2026');
    await press(view, 'calendar-navigation-next');
    await press(view, 'calendar-navigation-next');
    expect(month(view)).toBe('Octobre 2026');
    await press(view, 'calendar-navigation-next');
    await press(view, 'calendar-navigation-next');
    await press(view, 'calendar-navigation-next');
    expect(month(view)).toBe('Janvier 2027');

    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
    // The selected day is not in this month: nothing reads as selected.
    expect(
      view.getAllByRole('button').filter((button) => button.props.accessibilityState?.selected),
    ).toHaveLength(0);
  });

  it('uses the very same glass period control as the day navigator', async () => {
    const { view } = await renderCalendar();

    const navigation = view.getByTestId('calendar-navigation');
    expect(StyleSheet.flatten(navigation.props.style)).toMatchObject({
      backgroundColor: semanticColors.surfaceElevated,
      borderColor: semanticColors.borderSubtle,
      borderRadius: radii.large,
      flexDirection: 'row',
    });
    const arrows = within(navigation).getAllByRole('button');
    expect(arrows.map((arrow) => arrow.props.accessibilityLabel)).toEqual(['Mois précédent', 'Mois suivant']);
    for (const arrow of arrows) {
      expect(StyleSheet.flatten(arrow.props.style)).toMatchObject({
        height: glassIconButtonSize,
        width: glassIconButtonSize,
      });
      expect(within(arrow).getByTestId('glass-surface', { includeHiddenElements: true })).toBeTruthy();
    }

    // Built on the shared PeriodNavigator — no calendar-specific arrow button.
    const source = readFileSync(join(__dirname, '..', 'components', 'MonthCalendarSheet.tsx'), 'utf8');
    expect(source).toMatch(/from ['"]@\/shared\/ui\/PeriodNavigator['"]/);
    expect(source).not.toMatch(/chevron/);
  });

  it('puts ONE dot on busy days and none on free days, announced in words', async () => {
    const busy = new Date(2026, 8, 3);
    const { view } = await renderCalendar({
      appointmentDayKeys: new Set([getLocalDateKey(busy), getLocalDateKey(SELECTED)]),
    });

    expect(view.getByTestId('calendar-day-2026-09-03-dot')).toBeTruthy();
    expect(view.getByTestId('calendar-day-2026-09-23-dot')).toBeTruthy();
    expect(view.queryByTestId('calendar-day-2026-09-04-dot')).toBeNull();
    expect(within(view.getByTestId('calendar-day-2026-09-03')).queryAllByText(/\d+ rdv|•/)).toHaveLength(0);

    expect(view.getByTestId('calendar-day-2026-09-03').props.accessibilityLabel).toBe(
      'Jeudi 3 septembre, rendez-vous prévus',
    );
    expect(view.getByTestId('calendar-day-2026-09-04').props.accessibilityLabel).toBe('Vendredi 4 septembre');
  });

  it('tells today and the selected day apart, and combines them on one mark', async () => {
    const { view } = await renderCalendar();

    // Today only: the violet ring, no fill, not selected.
    expect(markStyle(view, '2026-09-16')).toMatchObject({ borderColor: semanticColors.accent });
    expect(markStyle(view, '2026-09-16').backgroundColor).toBeUndefined();
    expect(view.getByTestId('calendar-day-2026-09-16').props.accessibilityState).toEqual({ selected: false });
    expect(view.getByTestId('calendar-day-2026-09-16').props.accessibilityLabel).toBe(
      'Mercredi 16 septembre, aujourd’hui',
    );

    // Selected only: the lavender fill, no ring.
    expect(markStyle(view, '2026-09-23')).toMatchObject({
      backgroundColor: semanticColors.surfaceLavenderStrong,
      borderColor: 'transparent',
    });
    expect(view.getByTestId('calendar-day-2026-09-23').props.accessibilityState).toEqual({ selected: true });

    // Neither.
    expect(markStyle(view, '2026-09-24')).toMatchObject({ borderColor: 'transparent' });
    expect(markStyle(view, '2026-09-24').backgroundColor).toBeUndefined();

    expect(getCalendarDayAccessibilityLabel(TODAY, true, true)).toBe(
      'Mercredi 16 septembre, aujourd’hui, rendez-vous prévus',
    );
  });

  it('rings the fill when today is also the selected day', async () => {
    const { view } = await renderCalendar({ day: TODAY });

    expect(markStyle(view, '2026-09-16')).toMatchObject({
      backgroundColor: semanticColors.surfaceLavenderStrong,
      borderColor: semanticColors.accent,
    });
    expect(view.getByTestId('calendar-day-2026-09-16').props.accessibilityState).toEqual({ selected: true });
  });

  it('selects the tapped day at local midnight, adjacent-month days included', async () => {
    const { view, handlers } = await renderCalendar();

    await press(view, 'calendar-day-2026-09-25');
    expect(handlers.onSelect).toHaveBeenLastCalledWith(new Date(2026, 8, 25));

    // A muted trailing day is the real 1 October.
    await press(view, 'calendar-day-2026-10-01');
    expect(handlers.onSelect).toHaveBeenLastCalledWith(new Date(2026, 9, 1));
    const outsideNumber = within(view.getByTestId('calendar-day-2026-10-01')).getByText('1');
    expect(StyleSheet.flatten(outsideNumber.props.style)).toMatchObject({ color: semanticColors.foregroundMuted });
  });

  it('reopens on the month of the selected day, never on the last browsed one', async () => {
    const { view, baseProps } = await renderCalendar({ day: new Date(2026, 9, 15) });
    await press(view, 'calendar-navigation-next');
    await press(view, 'calendar-navigation-next');
    expect(month(view)).toBe('Décembre 2026');

    await act(async () => {
      view.rerender(<MonthCalendarSheet {...baseProps} day={new Date(2026, 9, 15)} visible={false} />);
    });
    await act(async () => {
      view.rerender(<MonthCalendarSheet {...baseProps} day={new Date(2026, 9, 17)} visible />);
    });

    expect(month(view)).toBe('Octobre 2026');
    expect(view.getByTestId('calendar-day-2026-10-17').props.accessibilityState).toEqual({ selected: true });
  });
});
