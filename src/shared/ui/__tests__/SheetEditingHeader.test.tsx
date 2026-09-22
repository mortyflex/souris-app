import { act, fireEvent, render, within } from '@testing-library/react-native';

import { StyleSheet } from 'react-native';

import { SheetEditingHeader } from '../SheetEditingHeader';
import { typography } from '../theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('SheetEditingHeader', () => {
  it('leads with « Annuler », then the title as the heading, and cancels through the handler', async () => {
    const onCancel = jest.fn();
    const view = await render(
      <SheetEditingHeader cancelAccessibilityLabel="Annuler la vente" onCancel={onCancel} title="Nouvelle vente" />,
    );

    const buttons = view.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBe(view.getByRole('button', { name: 'Annuler la vente' }));
    expect(view.getByText('Annuler')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Nouvelle vente' })).toBeTruthy();

    await act(async () => {
      fireEvent.press(buttons[0]);
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the title at the readable sectionTitle size and never scales it down', async () => {
    const view = await render(<SheetEditingHeader onCancel={jest.fn()} title="Encaisser le rendez-vous" />);

    const title = view.getByRole('header', { name: 'Encaisser le rendez-vous' });
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(typography.sectionTitle.fontSize);
    expect(title.props.adjustsFontSizeToFit).toBeFalsy();
    expect(title.props.minimumFontScale).toBeUndefined();
    expect(title.props.numberOfLines).toBe(1);
  });

  describe('centered title', () => {
    const layer = (view: Awaited<ReturnType<typeof render>>) =>
      StyleSheet.flatten(view.getByTestId('sheet-editing-header-title').props.style);

    async function layout(view: Awaited<ReturnType<typeof render>>, testID: string, width: number) {
      await act(async () => {
        fireEvent(view.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
      });
    }

    it('centers the title on the whole header, independently of « Annuler », with equal side insets', async () => {
      const view = await render(<SheetEditingHeader onCancel={jest.fn()} title="Encaisser le rendez-vous" />);

      const title = view.getByRole('header', { name: 'Encaisser le rendez-vous' });
      expect(StyleSheet.flatten(title.props.style).textAlign).toBe('center');
      // Its own layer over the full header height, not a flex sibling pushed by the button.
      expect(layer(view)).toMatchObject({ position: 'absolute', top: 0, bottom: 0 });
      expect(layer(view).left).toBe(layer(view).right);
      expect(layer(view).left).toBeGreaterThan(0);
      // Decorative for touches: « Annuler » stays fully tappable.
      expect(view.getByTestId('sheet-editing-header-title').props.pointerEvents).toBe('none');
    });

    it('reserves the measured width of « Annuler » on BOTH sides, so a long title never reaches it', async () => {
      const view = await render(<SheetEditingHeader onCancel={jest.fn()} title="Modifier l’encaissement" />);

      await layout(view, 'sheet-editing-header-leading', 83);
      expect(layer(view)).toMatchObject({ left: 83, right: 83 });

      await layout(view, 'sheet-editing-header-leading', 120);
      expect(layer(view)).toMatchObject({ left: 120, right: 120 });
    });

    it('uses the wider side when a distinct right action exists', async () => {
      const view = await render(
        <SheetEditingHeader
          onCancel={jest.fn()}
          rightAction={{ label: 'Enregistrer', onPress: jest.fn() }}
          title="Modifier le rendez-vous"
        />,
      );

      await layout(view, 'sheet-editing-header-leading', 83);
      await layout(view, 'sheet-editing-header-trailing', 118);
      expect(layer(view)).toMatchObject({ left: 118, right: 118 });
    });

    it('keeps the reading order « Annuler », then the title', async () => {
      const view = await render(
        <SheetEditingHeader onCancel={jest.fn()} testID="header" title="Nouvelle vente" />,
      );

      expect(
        within(view.getByTestId('header'))
          .getAllByText(/^(Annuler|Nouvelle vente)$/)
          .map((node) => node.props.children),
      ).toEqual(['Annuler', 'Nouvelle vente']);
    });
  });

  it('speaks the label when no accessibility label is given', async () => {
    const view = await render(<SheetEditingHeader onCancel={jest.fn()} title="Nouveau rendez-vous" />);

    expect(view.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('places a distinct right action after the title', async () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    const view = await render(
      <SheetEditingHeader
        onCancel={onCancel}
        rightAction={{ label: 'Enregistrer', onPress: onSave }}
        title="Modifier le rendez-vous"
      />,
    );

    const buttons = view.getAllByRole('button');
    expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual(['Annuler', 'Enregistrer']);

    await act(async () => {
      fireEvent.press(buttons[1]);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
