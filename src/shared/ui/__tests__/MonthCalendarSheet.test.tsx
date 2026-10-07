// BeautIzzy — shared month calendar: French Monday-first grid, month browsing
// through the shared glass PeriodNavigator, caller-provided decorations (a
// quiet dot, an intensity halo), today vs selected, and a direct tap on any
// shown day.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { glassIconButtonSize } from '@/shared/ui/GlassIconButton';
import { calendarIntensity, radii, semanticColors } from '@/shared/ui/theme';

import {
  getCalendarDayAccessibilityLabel,
  MonthCalendarSheet,
  MONTH_CALENDAR_WEEKDAYS,
  type MonthCalendarDayDecoration,
} from '../MonthCalendarSheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const TODAY = new Date(2026, 8, 16);
const SELECTED = new Date(2026, 8, 23);

type SheetProps = React.ComponentProps<typeof MonthCalendarSheet>;

async function renderCalendar(props: Partial<SheetProps> = {}) {
  const handlers = { onClose: jest.fn(), onSelect: jest.fn() };
  const baseProps: SheetProps = {
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
const numberStyle = (view: View, id: string) =>
  StyleSheet.flatten(within(view.getByTestId(`calendar-day-${id}`)).getByText(String(Number(id.slice(8)))).props.style);
const dayId = (day: Date) =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

/** A decorator from explicit presentation data, keyed by `YYYY-MM-DD`. */
const decorations =
  (byDay: Record<string, MonthCalendarDayDecoration>) =>
  () =>
  (day: Date) =>
    byDay[dayId(day)];

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
    const source = readFileSync(join(__dirname, '..', 'MonthCalendarSheet.tsx'), 'utf8');
    expect(source).toMatch(/from ['"]\.\/PeriodNavigator['"]/);
    expect(source).not.toMatch(/chevron/);
    // Domain-agnostic: a caller hands it presentation data, never its records.
    expect(source).not.toMatch(/from ['"]@\/(domain|features)\//);
  });

  it('puts ONE dot on busy days and none on free days, announced in words', async () => {
    const busy = { dot: true, accessibilityDetail: 'rendez-vous prévus' };
    const { view } = await renderCalendar({
      decorateMonth: decorations({ '2026-09-03': busy, '2026-09-23': busy }),
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

    expect(getCalendarDayAccessibilityLabel(TODAY, true, 'rendez-vous prévus')).toBe(
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

  describe('intensity decoration', () => {
    const decorateMonth = decorations({
      '2026-09-03': { intensity: 'low', accessibilityDetail: '20 euros encaissés' },
      '2026-09-16': { intensity: 'medium', accessibilityDetail: '50 euros encaissés' },
      '2026-09-23': { intensity: 'high', accessibilityDetail: '245 euros encaissés' },
    });
    const haloColor = (view: View, id: string, level: string) =>
      StyleSheet.flatten(view.getByTestId(`calendar-day-${id}-intensity-${level}`).props.style).backgroundColor;

    it('draws ONE soft halo per level behind the number, no amount written, spoken in words', async () => {
      const { view } = await renderCalendar({ decorateMonth, day: new Date(2026, 8, 10) });

      expect(haloColor(view, '2026-09-03', 'low')).toBe(calendarIntensity.low);
      expect(haloColor(view, '2026-09-16', 'medium')).toBe(calendarIntensity.medium);
      expect(haloColor(view, '2026-09-23', 'high')).toBe(calendarIntensity.high);
      // A plain day has no halo, no dot, no zero.
      expect(view.queryByTestId(/calendar-day-2026-09-04-intensity/)).toBeNull();
      expect(view.queryByTestId('calendar-day-2026-09-04-dot')).toBeNull();
      expect(within(view.getByTestId('calendar-day-2026-09-23')).queryAllByText(/€|euro/)).toHaveLength(0);

      expect(view.getByTestId('calendar-day-2026-09-23').props.accessibilityLabel).toBe(
        'Mercredi 23 septembre, 245 euros encaissés',
      );
      expect(view.getByTestId('calendar-day-2026-09-16').props.accessibilityLabel).toBe(
        'Mercredi 16 septembre, aujourd’hui, 50 euros encaissés',
      );
    });

    it('keeps the selected fill and the today ring on top of the halo', async () => {
      const { view } = await renderCalendar({ decorateMonth });

      // Selected + high: the lavender fill, a violet number, the halo behind.
      expect(markStyle(view, '2026-09-23')).toMatchObject({
        backgroundColor: semanticColors.surfaceLavenderStrong,
        borderColor: 'transparent',
      });
      expect(numberStyle(view, '2026-09-23')).toMatchObject({ color: semanticColors.accent });
      expect(view.getByTestId('calendar-day-2026-09-23-intensity-high')).toBeTruthy();
      expect(view.getByTestId('calendar-day-2026-09-23').props.accessibilityState).toEqual({ selected: true });

      // Today + medium: the violet ring, no fill; the number stays navy on the halo.
      expect(markStyle(view, '2026-09-16')).toMatchObject({ borderColor: semanticColors.accent });
      expect(markStyle(view, '2026-09-16').backgroundColor).toBeUndefined();
      expect(numberStyle(view, '2026-09-16')).toMatchObject({ color: semanticColors.foreground });
      expect(view.getByTestId('calendar-day-2026-09-16-intensity-medium')).toBeTruthy();
    });

    it('combines today, selected and intensity on one day', async () => {
      const { view } = await renderCalendar({ decorateMonth, day: TODAY });

      expect(markStyle(view, '2026-09-16')).toMatchObject({
        backgroundColor: semanticColors.surfaceLavenderStrong,
        borderColor: semanticColors.accent,
      });
      expect(numberStyle(view, '2026-09-16')).toMatchObject({ color: semanticColors.accent });
      expect(view.getByTestId('calendar-day-2026-09-16-intensity-medium')).toBeTruthy();
      expect(view.getByTestId('calendar-day-2026-09-16').props.accessibilityState).toEqual({ selected: true });
    });

    it('shows a selected day without intensity as the plain selected day', async () => {
      const { view } = await renderCalendar({ decorateMonth, day: new Date(2026, 8, 24) });

      expect(markStyle(view, '2026-09-24')).toMatchObject({ backgroundColor: semanticColors.surfaceLavenderStrong });
      expect(view.queryByTestId(/calendar-day-2026-09-24-intensity/)).toBeNull();
      expect(view.getByTestId('calendar-day-2026-09-24').props.accessibilityLabel).toBe('Jeudi 24 septembre');
    });

    it('asks the caller for each displayed month as it is browsed', async () => {
      const decorate = jest.fn(() => () => undefined);
      const { view } = await renderCalendar({ decorateMonth: decorate });

      expect(decorate).toHaveBeenLastCalledWith(new Date(2026, 8, 1));
      await press(view, 'calendar-navigation-next');
      expect(decorate).toHaveBeenLastCalledWith(new Date(2026, 9, 1));
    });
  });
});
