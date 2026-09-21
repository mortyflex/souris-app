import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { DateNavigator, formatNavigatorDate, navigatorDateFits } from '../DateNavigator';
import { glassIconButtonSize } from '../GlassIconButton';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const WEDNESDAY = new Date(2026, 8, 16);

function renderNavigator(props: Partial<React.ComponentProps<typeof DateNavigator>> = {}) {
  const handlers = {
    onPrevious: jest.fn(),
    onNext: jest.fn(),
    onOpenCalendar: jest.fn(),
    onGoToToday: jest.fn(),
  };
  return {
    handlers,
    view: render(<DateNavigator date={WEDNESDAY} isToday={false} {...handlers} {...props} />),
  };
}

describe('DateNavigator', () => {
  it('formats the date in French with an abbreviated month and no year', () => {
    expect(formatNavigatorDate(new Date(2026, 8, 16))).toBe('Mercredi 16 sept.');
    expect(formatNavigatorDate(new Date(2026, 9, 5))).toBe('Lundi 5 oct.');
    expect(formatNavigatorDate(new Date(2026, 11, 12))).toBe('Samedi 12 déc.');
    expect(formatNavigatorDate(new Date(2026, 8, 16), 'compact')).toBe('Mer. 16 sept.');

    const months = Array.from({ length: 12 }, (_, month) => formatNavigatorDate(new Date(2026, month, 1)).split(' ')[2]);
    expect(months).toEqual(['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']);
  });

  it('shows ONE selected date on ONE line, without the year', async () => {
    const { view: pending } = renderNavigator();
    const view = await pending;

    const date = view.getByTestId('date-navigator-date');
    expect(date.props.children).toBe('Mercredi 16 sept.');
    expect(date.props.numberOfLines).toBe(1);
    expect(view.queryByText(/2026/)).toBeNull();
    expect(view.queryByText('Mercredi')).toBeNull();
  });

  it('shortens the weekday — never wraps — when the space between the controls is too narrow', async () => {
    // Jest's default device reports a doubled text scale; this one is standard.
    const device = Dimensions.get('window');
    Dimensions.set({ window: { ...device, fontScale: 1 } });
    const { view: pending } = renderNavigator();
    const view = await pending;
    const copy = view.getByTestId('date-navigator-date').parent!;

    // The width left on a 375 pt phone: the full weekday still fits.
    await act(async () => {
      fireEvent(copy, 'layout', { nativeEvent: { layout: { width: 179, height: 44, x: 0, y: 0 } } });
    });
    expect(view.getByTestId('date-navigator-date').props.children).toBe('Mercredi 16 sept.');

    await act(async () => {
      fireEvent(copy, 'layout', { nativeEvent: { layout: { width: 124, height: 44, x: 0, y: 0 } } });
    });
    const date = view.getByTestId('date-navigator-date');
    expect(date.props.children).toBe('Mer. 16 sept.');
    expect(date.props.numberOfLines).toBe(1);
    // Still read aloud in full.
    expect(date.props.accessibilityLabel).toBe('Mercredi 16 sept.');
    await act(async () => {
      Dimensions.set({ window: device });
    });
  });

  it('decides the fit deterministically from the width and the text scale', () => {
    expect(navigatorDateFits('Mercredi 16 sept.', 179, 1)).toBe(true);
    expect(navigatorDateFits('Mercredi 16 sept.', 124, 1)).toBe(false);
    expect(navigatorDateFits('Mercredi 16 sept.', 179, 1.5)).toBe(false);
  });

  it('exposes previous day, choose date and next day as the shared glass controls', async () => {
    const { view: pending, handlers } = renderNavigator();
    const view = await pending;

    const controls = [
      ['Jour précédent', handlers.onPrevious],
      ['Choisir une date', handlers.onOpenCalendar],
      ['Jour suivant', handlers.onNext],
    ] as const;

    for (const [label, handler] of controls) {
      const button = view.getByRole('button', { name: label });
      expect(StyleSheet.flatten(button.props.style)).toMatchObject({
        height: glassIconButtonSize,
        width: glassIconButtonSize,
      });
      expect(within(button).getByTestId('glass-surface', { includeHiddenElements: true })).toBeTruthy();

      await act(async () => {
        fireEvent.press(button);
      });
      expect(handler).toHaveBeenCalledTimes(1);
    }
    expect(handlers.onGoToToday).not.toHaveBeenCalled();
  });

  it('indicates « Aujourd’hui » only on today, as plain text rather than a control', async () => {
    const { view: pending } = renderNavigator({ isToday: true });
    const view = await pending;

    expect(view.getByTestId('date-navigator-today').props.children).toBe('Aujourd’hui');
    expect(view.queryByRole('button', { name: /aujourd/i })).toBeNull();
  });

  it('never claims today elsewhere; it offers the way back instead when the caller has one', async () => {
    const { view: pending, handlers } = renderNavigator();
    const view = await pending;

    expect(view.queryByTestId('date-navigator-today')).toBeNull();
    expect(view.queryByText('Aujourd’hui')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Revenir à aujourd’hui' }));
    });
    expect(handlers.onGoToToday).toHaveBeenCalledTimes(1);
  });

  it('shows no secondary line elsewhere when the caller offers no way back', async () => {
    const { view: pending } = renderNavigator({ onGoToToday: undefined });
    const view = await pending;

    expect(view.queryByText(/aujourd/i)).toBeNull();
  });
});
