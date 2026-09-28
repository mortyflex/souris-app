import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Keyboard, StyleSheet } from 'react-native';

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

/** The native accessory host carrying `nativeID` (the view iOS attaches above the keyboard). */
function accessoryFor(view: Awaited<ReturnType<typeof render>>, nativeID: string) {
  const [accessory] = view.container.queryAll(
    (node) => node.type === 'RCTInputAccessoryView' && node.props.nativeID === nativeID,
  );
  if (!accessory) throw new Error(`No keyboard accessory for ${nativeID}`);
  return accessory;
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
    // The canonical editing header: « Annuler » leading, then the title, no eyebrow.
    expect(view.queryByText('ENCAISSEMENT')).toBeNull();
    expect(view.getByRole('header', { name: 'Encaisser le rendez-vous' })).toBeTruthy();
    expect(view.getByTestId('cancel-checkout').props.accessibilityLabel).toBe('Annuler l’encaissement');
    expect(
      within(view.getByTestId('checkout-header'))
        .getAllByText(/^(Annuler|Encaisser le rendez-vous)$/)
        .map((node) => node.props.children),
    ).toEqual(['Annuler', 'Encaisser le rendez-vous']);
    // The header sits in the sheet's grabber zone: the drag handle and the pan-to-dismiss stay.
    expect(within(view.getByTestId('bottom-sheet-drag-zone')).getByTestId('checkout-header')).toBeTruthy();
    for (const method of ['card', 'cash'] as const) {
      const input = view.getByTestId(`checkout-amount-${method}`);
      expect(input.props.autoFocus).toBeFalsy();
      expect(input.props.keyboardType).toBe('decimal-pad');
      // The pad gets the compact Souris « OK », never React Native's « Done » toolbar.
      expect(input.props.inputAccessoryViewID).toBeTruthy();
      expect(input.props.inputAccessoryViewButtonLabel).toBeUndefined();
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

  it('gives both amount pads the same compact « OK », each bound to its own input', async () => {
    const { view } = await renderSheet();

    const ids = (['card', 'cash'] as const).map((method) => {
      const id = view.getByTestId(`checkout-amount-${method}`).props.inputAccessoryViewID as string;
      expect(id).toBeTruthy();
      // The accessory carrying that id is mounted with the sheet, before any focus.
      const accessory = accessoryFor(view, id);
      const ok = within(accessory).getByLabelText('Fermer le clavier');
      expect(ok.props.accessibilityRole).toBe('button');
      expect(within(ok).getByText('OK')).toBeTruthy();
      return id;
    });
    // iOS binds one accessory view to ONE input: never a shared id.
    expect(ids[0]).not.toBe(ids[1]);
    // One component, one look: the two pills are styled identically.
    const [cardPill, cashPill] = ids.map((id) =>
      StyleSheet.flatten(within(accessoryFor(view, id)).getByLabelText('Fermer le clavier').props.style),
    );
    expect(cardPill).toEqual(cashPill);
  });

  it('keeps both « OK » accessories mounted and bound through every focus change', async () => {
    const { view } = await renderSheet();
    const card = () => view.getByTestId('checkout-amount-card');
    const cash = () => view.getByTestId('checkout-amount-cash');
    const cardID = card().props.inputAccessoryViewID;
    const cashID = cash().props.inputAccessoryViewID;
    const cardAccessory = accessoryFor(view, cardID);
    const cashAccessory = accessoryFor(view, cashID);
    const expectStable = () => {
      expect(card().props.inputAccessoryViewID).toBe(cardID);
      expect(cash().props.inputAccessoryViewID).toBe(cashID);
      // Same native instances: never remounted, so never unbound from their input.
      expect(accessoryFor(view, cardID)).toBe(cardAccessory);
      expect(accessoryFor(view, cashID)).toBe(cashAccessory);
    };

    // Carte, then straight to Espèces, back to Carte, then away and back.
    const sequence: [ReturnType<typeof card> | null, ReturnType<typeof card> | null][] = [
      [null, card()],
      [card(), cash()],
      [cash(), card()],
      [card(), null],
      [null, cash()],
    ];
    for (const [blurred, focused] of sequence) {
      if (blurred) await act(async () => fireEvent(blurred, 'blur'));
      if (focused) await act(async () => fireEvent(focused, 'focus'));
      expectStable();
    }
  });

  it('closes the keyboard with « OK » and nothing else: both amounts kept, nothing confirmed', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const { view, onConfirm, onClose } = await renderSheet();

    await type(view, 'card', '75');
    await type(view, 'cash', '20');
    for (const method of ['card', 'cash'] as const) {
      await act(async () => fireEvent(view.getByTestId(`checkout-amount-${method}`), 'focus'));
      await act(async () => fireEvent.press(view.getByTestId(`checkout-keyboard-dismiss-${method}`)));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(view.getByTestId('checkout-sheet')).toBeTruthy();
      expect(view.getByTestId('checkout-amount-card').props.value).toBe('75');
      expect(view.getByTestId('checkout-amount-cash').props.value).toBe('20');
      expect(view.getByTestId('checkout-entered-total').props.children).toBe(formatEuroCents(9500));
    }
    expect(dismiss).toHaveBeenCalledTimes(2);
    // Reopening a pad finds its « OK » again.
    await act(async () => fireEvent(view.getByTestId('checkout-amount-card'), 'focus'));
    expect(view.getByTestId('checkout-keyboard-dismiss-card')).toBeTruthy();
    dismiss.mockRestore();
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

  it('keeps the backdrop dismissal', async () => {
    const { view, onClose, onConfirm } = await renderSheet();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Fermer l’encaissement'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe('with deposits (settlement)', () => {
    // 95 € expected, 30 € already paid ahead: 65 € due — settled EXACTLY, as the Appointment sheet passes it.
    const settlement = { depositsCents: 3000, dueCents: 6500 };
    const allocation = { minimumCents: 6500, maximumCents: 6500, targetCents: 6500 };

    it('keeps « Total attendu » and adds the deposits and what is still due', async () => {
      const { view } = await renderSheet({ settlement });

      expect(view.getByTestId('checkout-expected-total').props.children).toBe(formatEuroCents(9500));
      expect(view.getByText('Acomptes déjà versés')).toBeTruthy();
      expect(view.getByTestId('checkout-deposits').props.children).toBe(formatEuroCents(-3000));
      expect(view.getByText('Reste à encaisser')).toBeTruthy();
      expect(view.getByTestId('checkout-due').props.children).toBe(formatEuroCents(6500));
      expect(view.getByLabelText(`Reste à encaisser, ${formatEuroCents(6500)}`)).toBeTruthy();
    });

    it('the « Reste » shortcut fills what is still due, never the whole total', async () => {
      const { view, onConfirm } = await renderSheet({ settlement, allocation });

      await act(async () => {
        fireEvent.press(view.getByTestId('checkout-fill-card'));
      });
      expect(view.getByTestId('checkout-amount-card').props.value).toBe('65,00');
      expect(view.queryByTestId('checkout-difference')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 6500, cashAmountCents: 0 });
    });

    it('keeps a typed amount above what is due — never capped, never confirmed: the maximum is 65 €, not 95 €', async () => {
      const { view, onConfirm } = await renderSheet({ settlement, allocation });

      await type(view, 'cash', '70');
      expect(view.getByTestId('checkout-amount-cash').props.value).toBe('70');
      expect(view.queryByTestId('checkout-difference')).toBeNull();
      expect(view.getByTestId('checkout-exceeds').props.children).toBe('Le montant dépasse le reste à encaisser.');
      expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(true);

      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('Card 20 → Cash automatically 45 of the 65 € due', async () => {
      const { view, onConfirm } = await renderSheet({ settlement, allocation });

      await type(view, 'card', '20');
      expect(view.getByTestId('checkout-amount-cash').props.value).toBe('45,00');
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 2000, cashAmountCents: 4500 });
    });

    it('without deposits nothing changes: no deposit line, the whole total is due', async () => {
      const { view } = await renderSheet();
      expect(view.queryByTestId('checkout-deposits-row')).toBeNull();
      expect(view.queryByTestId('checkout-due-row')).toBeNull();
    });

    it('fully prepaid: nothing due, nothing typed — the zero-balance label, no fake amount', async () => {
      const { view, onConfirm } = await renderSheet({
        settlement: { depositsCents: 9500, dueCents: 0 },
        allocation: { minimumCents: 0, maximumCents: 0, targetCents: 0 },
        zeroBalanceConfirmTitle: 'Terminer le rendez-vous',
      });

      expect(view.queryByTestId('checkout-fill-card')).toBeNull();
      expect(view.getByText('Terminer le rendez-vous')).toBeTruthy();
      expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(false);
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 0, cashAmountCents: 0 });

      // No tip on a prepaid Appointment: a typed amount exceeds what is due.
      await type(view, 'card', '5');
      expect(view.getByTestId('checkout-exceeds')).toBeTruthy();
      expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(true);
    });

    it('a blocking notice disables confirmation while the entries stay editable', async () => {
      const { Text } = jest.requireActual('react-native') as typeof import('react-native');
      const { view, onConfirm } = await renderSheet({
        settlement,
        allocation,
        blockingNotice: <Text testID="blocking">Sous les acomptes</Text>,
      });

      expect(view.getByTestId('blocking')).toBeTruthy();
      await type(view, 'card', '65');
      expect(view.getByTestId('confirm-checkout').props.accessibilityState.disabled).toBe(true);
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Appointment allocation — exact due, automatic and manual amounts', () => {
    const exact95 = { minimumCents: 9500, maximumCents: 9500, targetCents: 9500 };
    const value = (view: Awaited<ReturnType<typeof render>>, method: 'card' | 'cash') =>
      view.getByTestId(`checkout-amount-${method}`).props.value as string;
    const disabled = (view: Awaited<ReturnType<typeof render>>) =>
      view.getByTestId('confirm-checkout').props.accessibilityState.disabled as boolean;

    it('opens empty and changes nothing on its own', async () => {
      const { view } = await renderSheet({ allocation: exact95 });

      expect(value(view, 'card')).toBe('');
      expect(value(view, 'cash')).toBe('');
      expect(view.queryByTestId('checkout-unallocated')).toBeNull();
      expect(disabled(view)).toBe(true);
    });

    it('Card 30 → Cash 65 automatically; Card 45 → Cash 50; confirmation records exactly the due', async () => {
      const { view, onConfirm } = await renderSheet({ allocation: exact95 });

      await type(view, 'card', '30');
      expect(value(view, 'cash')).toBe('65,00');
      await type(view, 'card', '45');
      expect(value(view, 'cash')).toBe('50,00');
      expect(disabled(view)).toBe(false);

      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 4500, cashAmountCents: 5000 });
    });

    it('Card = the whole due → Cash empty, confirmable', async () => {
      const { view } = await renderSheet({ allocation: exact95 });

      await type(view, 'card', '95');
      expect(value(view, 'cash')).toBe('');
      expect(disabled(view)).toBe(false);
    });

    it('Card above the due: kept as typed, the error is shown, nothing confirms', async () => {
      const { view, onConfirm } = await renderSheet({ allocation: exact95 });

      await type(view, 'card', '110');
      expect(value(view, 'card')).toBe('110');
      expect(value(view, 'cash')).toBe('');
      expect(view.getByTestId('checkout-exceeds')).toBeTruthy();
      expect(disabled(view)).toBe(true);
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('a typed Cash is manual: « Reste à répartir », and a later Card change never rewrites it', async () => {
      const { view } = await renderSheet({ allocation: exact95 });

      await type(view, 'card', '30');
      await type(view, 'cash', '45');
      expect(view.getByTestId('checkout-unallocated').props.children).toEqual([
        'Reste à répartir : ',
        formatEuroCents(2000),
      ]);
      expect(disabled(view)).toBe(true);

      await type(view, 'card', '40');
      expect(value(view, 'cash')).toBe('45');
      expect(view.getByTestId('checkout-unallocated').props.children).toEqual([
        'Reste à répartir : ',
        formatEuroCents(1000),
      ]);

      // Card 30 + Cash 80: above the due.
      await type(view, 'card', '30');
      await type(view, 'cash', '80');
      expect(view.getByTestId('checkout-exceeds')).toBeTruthy();
      expect(disabled(view)).toBe(true);
    });

    it('clearing a typed amount releases it without refilling it; the next Card edit does', async () => {
      const { view } = await renderSheet({ allocation: exact95 });
      await type(view, 'card', '30');
      await type(view, 'cash', '50');

      await type(view, 'cash', '');
      expect(value(view, 'cash')).toBe('');
      // The explicit « Reste » stays available.
      expect(view.getByTestId('checkout-fill-cash')).toBeTruthy();

      await type(view, 'card', '35');
      expect(value(view, 'cash')).toBe('60,00');
    });

    it('a new due (discount draft) moves the automatic amount only', async () => {
      const { view } = await renderSheet({ allocation: exact95 });
      await type(view, 'card', '30');
      expect(value(view, 'cash')).toBe('65,00');

      await act(async () => {
        view.rerender(
          <CheckoutSheet
            allocation={{ minimumCents: 7600, maximumCents: 7600, targetCents: 7600 }}
            confirmTitle="Encaisser"
            expectedTotalCents={7600}
            onClose={jest.fn()}
            onConfirm={jest.fn()}
            summaryLines={summaryLines}
            title="Encaisser le rendez-vous"
            visible
          />,
        );
      });

      expect(value(view, 'card')).toBe('30');
      expect(value(view, 'cash')).toBe('46,00');
    });

    it('a correction opens EXACTLY on the recorded amounts, then rebalances on the first edit', async () => {
      const { view, onConfirm } = await renderSheet({
        allocation: exact95,
        initialAmounts: { cardAmountCents: 5000, cashAmountCents: 4500 },
      });

      expect(value(view, 'card')).toBe('50,00');
      expect(value(view, 'cash')).toBe('45,00');
      expect(disabled(view)).toBe(false);

      await type(view, 'card', '20');
      expect(value(view, 'cash')).toBe('75,00');
      await type(view, 'card', '96');
      expect(view.getByTestId('checkout-exceeds')).toBeTruthy();
      await type(view, 'card', '20');
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 2000, cashAmountCents: 7500 });
    });

    it('a LEGACY overpaid correction (120 € recorded, 95 € due) keeps 120 €, may lower it, never raises it', async () => {
      const legacy = { minimumCents: 9500, maximumCents: 12000, targetCents: 12000 };
      const { view } = await renderSheet({
        allocation: legacy,
        initialAmounts: { cardAmountCents: 12000, cashAmountCents: 0 },
      });

      expect(value(view, 'card')).toBe('120,00');
      expect(disabled(view)).toBe(false);
      await type(view, 'card', '115');
      expect(disabled(view)).toBe(false);
      await type(view, 'card', '125');
      expect(view.getByTestId('checkout-exceeds')).toBeTruthy();
      expect(disabled(view)).toBe(true);
    });

    it('shows the caller’s payment-date control under the amounts', async () => {
      const { Text } = jest.requireActual('react-native') as typeof import('react-native');
      const { view } = await renderSheet({ allocation: exact95, paymentDate: <Text testID="date-choice">Encaissé le</Text> });

      expect(view.getByTestId('date-choice')).toBeTruthy();
    });
  });

  describe('standalone Sale (no allocation) — unchanged', () => {
    it('never fills the other amount on its own, accepts a different total and shows the « Écart »', async () => {
      const { view, onConfirm } = await renderSheet();

      await type(view, 'card', '30');
      expect(view.getByTestId('checkout-amount-cash').props.value).toBe('');
      await type(view, 'card', '100');
      expect(view.getByTestId('checkout-difference').props.children).toEqual(['Écart : ', `+${formatEuroCents(500)}`]);
      expect(view.queryByTestId('checkout-exceeds')).toBeNull();
      expect(view.queryByTestId('checkout-unallocated')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 10000, cashAmountCents: 0 });
    });

    it('accepts less than the total too', async () => {
      const { view, onConfirm } = await renderSheet();

      await type(view, 'card', '30');
      await type(view, 'cash', '20');
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-checkout'));
      });
      expect(onConfirm).toHaveBeenCalledWith({ cardAmountCents: 3000, cashAmountCents: 2000 });
    });
  });
});
