import { act, fireEvent, render } from '@testing-library/react-native';

import { formatEuroCents } from '@/shared/lib/money';

import { CheckoutSheet } from '../CheckoutSheet';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const summaryLines = [
  { label: 'Prestations', cents: 7500, testID: 'checkout-services-total' },
  { label: 'Produits', cents: 2000, testID: 'checkout-products-total' },
];

async function renderSheet(props: Partial<React.ComponentProps<typeof CheckoutSheet>> = {}) {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const view = await render(
    <CheckoutSheet
      confirmTitle="Encaisser"
      expectedTotalCents={9500}
      onClose={onClose}
      onConfirm={onConfirm}
      summaryLines={summaryLines}
      title="Encaisser le rendez-vous"
      visible
      {...props}
    />,
  );
  return { view, onConfirm, onClose };
}

async function type(view: Awaited<ReturnType<typeof render>>, method: 'card' | 'cash', text: string) {
  await act(async () => {
    fireEvent.changeText(view.getByTestId(`checkout-amount-${method}`), text);
  });
}

describe('CheckoutSheet', () => {
  it('opens with the keyboard closed, the expected breakdown, zero entries and a disabled confirm', async () => {
    const { view } = await renderSheet();

    expect(view.getByTestId('checkout-sheet')).toBeTruthy();
    expect(view.getByText('ENCAISSEMENT')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Encaisser le rendez-vous' })).toBeTruthy();
    expect(view.getByLabelText('Annuler l’encaissement')).toBeTruthy();
    for (const method of ['card', 'cash'] as const) {
      const input = view.getByTestId(`checkout-amount-${method}`);
      expect(input.props.autoFocus).toBeFalsy();
      expect(input.props.keyboardType).toBe('decimal-pad');
      expect(input.props.value).toBe('');
    }
    expect(view.getByText('Prestations')).toBeTruthy();
    expect(view.getByTestId('checkout-services-total').props.children).toBe(formatEuroCents(7500));
    expect(view.getByText('Produits')).toBeTruthy();
    expect(view.getByTestId('checkout-products-total').props.children).toBe(formatEuroCents(2000));
    expect(view.getByText('Total attendu')).toBeTruthy();
    expect(view.getByTestId('checkout-expected-total').props.children).toBe(formatEuroCents(9500));
    expect(view.getByText('Carte')).toBeTruthy();
    expect(view.getByText('Espèces')).toBeTruthy();
    expect(view.getByText('Total encaissé')).toBeTruthy();
    expect(view.getByTestId('checkout-entered-total').props.children).toBe(formatEuroCents(0));
    expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('Encaisser')).toBeTruthy();
  });

  it('records a card-only checkout with normalized cents', async () => {
    const { view, onConfirm } = await renderSheet();

    await type(view, 'card', '95,50');
    expect(view.getByTestId('checkout-entered-total').props.children).toBe(formatEuroCents(9550));
    expect(view.getByTestId('checkout-difference').props.children).toEqual([
      'Écart : ',
      `+${formatEuroCents(50)}`,
    ]);

    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-checkout'));
    });

    expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 9550, cashAmountCents: 0 });
  });

  it('records a mixed card + cash checkout', async () => {
    const { view, onConfirm } = await renderSheet();

    await type(view, 'card', '75');
    await type(view, 'cash', '20');

    expect(view.getByTestId('checkout-entered-total').props.children).toBe(formatEuroCents(9500));
    expect(view.queryByTestId('checkout-difference')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-checkout'));
    });
    expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 7500, cashAmountCents: 2000 });
  });

  it('fills the remaining expected amount with one explicit tap and never on its own', async () => {
    const { view } = await renderSheet();

    expect(view.getByTestId('checkout-amount-card').props.value).toBe('');
    expect(view.getByTestId('checkout-fill-card')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('checkout-fill-card'));
    });
    expect(view.getByTestId('checkout-amount-card').props.value).toBe('95,00');
    expect(view.queryByTestId('checkout-fill-cash')).toBeNull();

    await type(view, 'card', '75');
    expect(view.getByTestId('checkout-fill-cash')).toBeTruthy();
    expect(view.getByText(`Reste ${formatEuroCents(2000)}`)).toBeTruthy();
  });

  it('rejects negative or textual entries and keeps confirm disabled', async () => {
    const { view, onConfirm } = await renderSheet();

    await type(view, 'card', '-5');
    expect(view.getByText('Montant invalide')).toBeTruthy();
    expect(view.getByTestId('checkout-entered-total').props.children).toBe('—');
    expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-checkout'));
    });
    expect(onConfirm).not.toHaveBeenCalled();

    await type(view, 'card', '95');
    expect(view.queryByText('Montant invalide')).toBeNull();
    expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(false);
  });

  it('allows a zero checkout only when nothing is expected', async () => {
    const { view } = await renderSheet({ expectedTotalCents: 0, summaryLines: [] });

    expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(false);
    expect(view.queryByTestId('checkout-fill-card')).toBeNull();
  });

  it('opens prefilled with the recorded split in edit mode', async () => {
    const { view, onConfirm } = await renderSheet({
      confirmTitle: 'Enregistrer',
      title: 'Modifier l’encaissement',
      initialAmounts: { cardAmountCents: 5000, cashAmountCents: 2500 },
    });

    expect(view.getByRole('header', { name: 'Modifier l’encaissement' })).toBeTruthy();
    expect(view.getByTestId('checkout-amount-card').props.value).toBe('50,00');
    expect(view.getByTestId('checkout-amount-cash').props.value).toBe('25,00');
    expect(view.getByText('Enregistrer')).toBeTruthy();

    await type(view, 'cash', '45');
    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-checkout'));
    });
    expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 5000, cashAmountCents: 4500 });
  });

  it('closes through Annuler without confirming anything', async () => {
    const { view, onClose, onConfirm } = await renderSheet();

    await type(view, 'card', '95');
    await act(async () => {
      fireEvent.press(view.getByLabelText('Annuler l’encaissement'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
