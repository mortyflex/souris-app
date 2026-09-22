import { act, fireEvent, render } from '@testing-library/react-native';

import { SheetEditingHeader } from '../SheetEditingHeader';

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
