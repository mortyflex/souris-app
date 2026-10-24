import { useState } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import {
  getAppointmentServicesTotal,
  type AppointmentDiscount,
} from '@/domain/appointments';
import { discountIcon } from '@/shared/icons/discount-icon';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { getAppTextStyle } from '@/shared/ui/AppText';
import { lavender, rose, semanticColors } from '@/shared/ui/theme';

import { AppointmentDiscountEditor } from '../AppointmentDiscountEditor';

// Renders the glyph as a host View carrying its cross-platform name.
jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SymbolView: ({ name }: { readonly name: unknown }) =>
      React.createElement(View, { testID: 'symbol', accessibilityHint: JSON.stringify(name) }),
  };
});
// The chevron is decorative (hidden from accessibility); its Reanimated
// rotation needs no native worklets runtime here.
jest.mock('@/shared/ui/DisclosureChevron', () => ({ DisclosureChevron: () => null }));
const mockSelectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();

const platform = Platform.OS === 'android' ? 'android' : 'ios';

const STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

/** Amounts go through the ONE money formatter (fr-FR narrow no-break space included). */
const euros = (cents: number) => formatEuroCents(cents);

/** The parent owns the discount, exactly like the creation and editing screens. */
function Harness({
  initial,
  grossEuros = 100,
  onChange,
}: {
  readonly initial?: AppointmentDiscount;
  readonly grossEuros?: number;
  readonly onChange: (discount: AppointmentDiscount | undefined) => void;
}) {
  const [discount, setDiscount] = useState(initial);
  return (
    <AppointmentDiscountEditor
      discount={discount}
      onChange={(next) => {
        setDiscount(next);
        onChange(next);
      }}
      servicesTotal={getAppointmentServicesTotal({ items: [{ price: grossEuros }], discount })}
    />
  );
}

async function renderEditor(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onChange = jest.fn();
  const view = await render(<Harness onChange={onChange} {...props} />);
  const press = async (testIDOrLabel: { testID?: string; label?: string }) => {
    await act(async () => {
      fireEvent.press(
        testIDOrLabel.testID
          ? view.getByTestId(testIDOrLabel.testID)
          : view.getByLabelText(testIDOrLabel.label!),
      );
    });
  };
  return { view, onChange, press };
}

describe('AppointmentDiscountEditor', () => {
  beforeEach(() => {
    mockSelectionHaptic.mockClear();
  });

  it('stays one collapsed secondary row while the Appointment has no discount', async () => {
    const { view } = await renderEditor();

    expect(view.getByText('Réduction')).toBeTruthy();
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
    expect(view.getByLabelText('Réduction, aucune').props.accessibilityState).toEqual({ expanded: false });
    expect(view.queryByTestId('appointment-discount-presets')).toBeNull();
    expect(view.queryByTestId('appointment-discount-clear')).toBeNull();
  });

  it('opens on % mode with the presets 5 through 50 and applies the chosen percentage', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });

    expect(view.getByLabelText('Réduction en pourcentage').props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText('Réduction en euros').props.accessibilityState.selected).toBe(false);
    for (const step of STEPS) {
      expect(view.getByTestId(`appointment-discount-preset-PERCENT-${step}`)).toBeTruthy();
      expect(view.getByText(`${step}`)).toBeTruthy();
    }
    expect(view.getByLabelText('Réduction de 20 pour cent')).toBeTruthy();

    await press({ label: 'Réduction de 20 pour cent' });

    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 20 });
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-20 % · -${euros(2000)}`);
    expect(view.getByTestId('appointment-discount-net-total').props.children).toBe(euros(8000));
    expect(view.getByLabelText(`Total après réduction ${euros(8000)}`)).toBeTruthy();
  });

  it('switches to € mode with the presets 5 € through 50 € and applies the chosen amount in cents', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction en euros' });

    expect(view.getByLabelText('Réduction en euros').props.accessibilityState.selected).toBe(true);
    for (const step of STEPS) {
      expect(view.getByTestId(`appointment-discount-preset-FIXED-${step * 100}`)).toBeTruthy();
      expect(view.getByText(`${step} €`)).toBeTruthy();
    }
    expect(view.queryByTestId('appointment-discount-preset-PERCENT-20')).toBeNull();
    // Switching the mode alone chooses nothing.
    expect(onChange).not.toHaveBeenCalled();

    await press({ label: 'Réduction de 15 euros' });

    expect(onChange).toHaveBeenLastCalledWith({ type: 'FIXED', amountCents: 1500 });
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-${euros(1500)}`);
  });

  it('identifies the current selection by state, written value and shape — not by colour alone', async () => {
    const { view } = await renderEditor({ initial: { type: 'PERCENT', percent: 20 } });

    // An Appointment that already has a discount opens expanded, on its mode.
    const selected = view.getByTestId('appointment-discount-preset-PERCENT-20');
    const other = view.getByTestId('appointment-discount-preset-PERCENT-25');
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(other.props.accessibilityState.selected).toBe(false);
    expect(view.getByLabelText('Réduction, 20 pour cent')).toBeTruthy();
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-20 % · -${euros(2000)}`);

    const selectedStyle = StyleSheet.flatten(selected.props.style);
    const otherStyle = StyleSheet.flatten(other.props.style);
    expect(selectedStyle).toMatchObject({
      backgroundColor: lavender.lav100,
      borderColor: semanticColors.accent,
      borderWidth: 1.5,
    });
    expect(otherStyle.borderWidth).toBe(1);
  });

  it('removes the discount with « Aucune réduction »', async () => {
    const { view, onChange, press } = await renderEditor({ initial: { type: 'FIXED', amountCents: 1000 } });

    expect(view.getByLabelText('Réduction en euros').props.accessibilityState.selected).toBe(true);
    expect(view.getByText('Aucune réduction')).toBeTruthy();
    await press({ label: 'Supprimer la réduction' });

    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
    expect(view.queryByTestId('appointment-discount-clear')).toBeNull();
    expect(view.queryByTestId('appointment-discount-net-total')).toBeNull();
  });

  it('shows the clamped amount when a fixed discount exceeds the services total', async () => {
    const { view, press } = await renderEditor({ grossEuros: 30 });
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction en euros' });
    await press({ label: 'Réduction de 50 euros' });

    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-${euros(3000)}`);
    expect(view.getByTestId('appointment-discount-net-total').props.children).toBe(euros(0));
  });

  it('marks « Réduction » with the shared price-tag icon, decorative and hidden from accessibility', async () => {
    const { view } = await renderEditor();

    const icon = view.getByTestId('appointment-discount-icon', { includeHiddenElements: true });
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(view.queryByTestId('appointment-discount-icon')).toBeNull();
    const symbol = view.getByTestId('symbol', { includeHiddenElements: true });
    expect(JSON.parse(symbol.props.accessibilityHint)).toEqual(discountIcon);
    expect(discountIcon).toEqual({ ios: 'tag', android: 'sell' });
    // The row is announced once, by its text label.
    expect(view.getAllByLabelText(/Réduction/)).toHaveLength(1);
    // The label keeps its typography.
    expect(StyleSheet.flatten(view.getByText('Réduction').props.style)).toMatchObject(
      getAppTextStyle('control', platform),
    );
  });

  it('gives exactly one selection haptic per percentage preset choice, and none when the chosen value is tapped again', async () => {
    const { onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    expect(mockSelectionHaptic).not.toHaveBeenCalled();

    await press({ label: 'Réduction de 20 pour cent' });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Same value again: a no-op — no haptic, no change.
    await press({ label: 'Réduction de 20 pour cent' });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    await press({ label: 'Réduction de 25 pour cent' });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 25 });
  });

  it('gives one haptic when the % / € mode changes, none when the current mode is tapped, and one per euro preset', async () => {
    const { press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });

    await press({ label: 'Réduction en pourcentage' }); // already selected
    expect(mockSelectionHaptic).not.toHaveBeenCalled();

    await press({ label: 'Réduction en euros' });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    await press({ label: 'Réduction en euros' }); // already selected
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);

    await press({ label: 'Réduction de 15 euros' });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(2);

    await press({ label: 'Réduction en pourcentage' });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(3);
  });

  it('gives exactly one haptic when the discount is removed', async () => {
    const { press } = await renderEditor({ initial: { type: 'PERCENT', percent: 20 } });

    await press({ label: 'Supprimer la réduction' });

    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
  });

  it('emphasizes the final AMOUNT, not its label: quiet « Total après réduction », stronger value', async () => {
    const { view } = await renderEditor({ initial: { type: 'PERCENT', percent: 20 } });

    const label = StyleSheet.flatten(view.getByText('Total après réduction').props.style);
    const value = StyleSheet.flatten(view.getByTestId('appointment-discount-net-total').props.style);
    const quiet = getAppTextStyle('metadata', platform);
    const strong = getAppTextStyle('control', platform);

    expect(label).toMatchObject({ fontFamily: quiet.fontFamily, fontSize: quiet.fontSize });
    expect(value).toMatchObject({ fontFamily: strong.fontFamily, fontSize: strong.fontSize, color: lavender.lav700 });
    expect(value.fontFamily).not.toBe(label.fontFamily);
    expect(value.fontSize).toBeGreaterThan(label.fontSize as number);
  });
});

describe('AppointmentDiscountEditor — free entry (« Autre montant » / « Autre pourcentage »)', () => {
  beforeEach(() => {
    mockSelectionHaptic.mockClear();
  });

  const entry = (view: Awaited<ReturnType<typeof renderEditor>>['view']) =>
    view.getByTestId('appointment-discount-entry-input');
  const typeEntry = async (
    view: Awaited<ReturnType<typeof renderEditor>>['view'],
    text: string,
  ) => {
    await act(async () => {
      fireEvent.changeText(entry(view), text);
    });
  };

  it('offers a whole-percentage entry in % mode and a decimal euro entry in € mode, with the matching keyboard', async () => {
    const { view, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });

    expect(view.getByText('Autre pourcentage')).toBeTruthy();
    expect(view.getByLabelText('Pourcentage de réduction')).toBeTruthy();
    expect(entry(view).props.keyboardType).toBe('number-pad');
    expect(entry(view).props.placeholder).toBe('0');
    expect(entry(view).props.maxLength).toBe(3);
    expect(entry(view).props.value).toBe('');
    // The field sits outside the preset grid: the presets stay ten chips.
    expect(within(view.getByTestId('appointment-discount-presets')).getAllByRole('button')).toHaveLength(10);

    await press({ label: 'Réduction en euros' });

    expect(view.getByText('Autre montant')).toBeTruthy();
    expect(view.getByLabelText('Montant de la réduction')).toBeTruthy();
    expect(entry(view).props.keyboardType).toBe('decimal-pad');
    expect(entry(view).props.placeholder).toBe('0,00');
    expect(entry(view).props.maxLength).toBe(9);
    expect(entry(view).props.returnKeyType).toBe('done');
    expect(entry(view).props.selectTextOnFocus).toBe(true);
  });

  it.each([
    ['3', 300, 9700],
    ['7,50', 750, 9250],
    ['12.90', 1290, 8710],
  ])('applies the custom amount « %s » in exact cents and shows the discount and the net total', async (text, cents, net) => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction en euros' });
    mockSelectionHaptic.mockClear(); // the mode switch ticked once

    await typeEntry(view, text);

    expect(onChange).toHaveBeenLastCalledWith({ type: 'FIXED', amountCents: cents });
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-${euros(cents)}`);

    expect(view.getByTestId('appointment-discount-net-total').props.children).toBe(euros(net));
    expect(view.queryByTestId('appointment-discount-entry-error')).toBeNull();
    // Typing ticks nothing.
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
  });

  it('applies a custom whole percentage, computed by the domain with half-up cent rounding', async () => {
    const { view, onChange, press } = await renderEditor({ grossEuros: 12.9 });
    await press({ testID: 'appointment-discount-toggle' });

    await typeEntry(view, '7');

    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 7 });
    // 12,90 € × 7 % = 90,3 c → 90 c
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-7 % · -${euros(90)}`);

    expect(view.getByTestId('appointment-discount-net-total').props.children).toBe(euros(1200));
    expect(view.getByLabelText('Réduction, 7 pour cent')).toBeTruthy();
  });

  it('keeps a trailing separator while typing and updates the value digit by digit', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction en euros' });

    await typeEntry(view, '7');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'FIXED', amountCents: 700 });
    await typeEntry(view, '7,');
    expect(entry(view).props.value).toBe('7,');
    expect(onChange).toHaveBeenCalledTimes(1); // still 700 c: no change
    await typeEntry(view, '7,5');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'FIXED', amountCents: 750 });
    expect(view.queryByTestId('appointment-discount-entry-error')).toBeNull();
  });

  it('a typed value deselects the chips; a chip empties the entry; clearing the entry removes the discount', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction de 20 pour cent' });

    await typeEntry(view, '7');
    expect(view.getByTestId('appointment-discount-preset-PERCENT-20').props.accessibilityState.selected).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 7 });

    await press({ label: 'Réduction de 25 pour cent' });
    expect(entry(view).props.value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 25 });
    expect(view.getByTestId('appointment-discount-preset-PERCENT-25').props.accessibilityState.selected).toBe(true);

    await typeEntry(view, '12');
    await typeEntry(view, '');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
    expect(view.queryByTestId('appointment-discount-entry-error')).toBeNull();
  });

  it('typing a preset value selects its chip, and the entry stays as typed', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });

    await typeEntry(view, '20');

    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 20 });
    expect(view.getByTestId('appointment-discount-preset-PERCENT-20').props.accessibilityState.selected).toBe(true);
    expect(entry(view).props.value).toBe('20');
  });

  it('reopens a custom discount with its text in the entry, in the French input form, and no chip selected', async () => {
    const { view } = await renderEditor({ initial: { type: 'FIXED', amountCents: 750 } });

    expect(view.getByLabelText('Réduction en euros').props.accessibilityState.selected).toBe(true);
    expect(entry(view).props.value).toBe('7,50');
    expect(view.getByTestId('appointment-discount-preset-FIXED-500').props.accessibilityState.selected).toBe(false);
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-${euros(750)}`);
    expect(view.getByLabelText('Réduction, 7,50 euros')).toBeTruthy();
  });

  it('switching the mode keeps the discount and shows its text only in its own mode', async () => {
    const { view, onChange, press } = await renderEditor({ initial: { type: 'FIXED', amountCents: 750 } });

    await press({ label: 'Réduction en pourcentage' });
    expect(entry(view).props.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-${euros(750)}`);

    await press({ label: 'Réduction en euros' });
    expect(entry(view).props.value).toBe('7,50');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['FIXED', 'abc', 'Montant invalide'],
    ['FIXED', '-5', 'Montant invalide'],
    ['FIXED', '7,505', 'Montant invalide'],
    ['FIXED', '0', 'La réduction doit être supérieure à 0 €.'],
    ['PERCENT', '0', 'La réduction doit être supérieure à 0 %.'],
    ['PERCENT', '7,5', 'Saisissez un pourcentage entier.'],
    ['PERCENT', '100', 'Le pourcentage ne peut pas dépasser 50 %.'],
    ['PERCENT', 'x', 'Pourcentage invalide'],
  ] as const)('explains an unreadable %s entry « %s » in words, applies nothing and turns the field rose', async (mode, text, message) => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    if (mode === 'FIXED') await press({ label: 'Réduction en euros' });

    await typeEntry(view, text);

    expect(onChange).not.toHaveBeenCalled();
    const error = view.getByTestId('appointment-discount-entry-error');
    expect(error.props.children).toBe(message);
    expect(error.props.accessibilityLiveRegion).toBe('polite');
    expect(StyleSheet.flatten(error.props.style).color).toBe(rose.rose600);
    expect(StyleSheet.flatten(view.getByTestId('appointment-discount-entry').props.style)).toMatchObject({
      backgroundColor: semanticColors.surfaceRose,
      borderColor: rose.rose600,
    });
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
    expect(view.queryByTestId('appointment-discount-net-total')).toBeNull();
  });

  it('an unreadable entry removes the discount it replaces, and a corrected entry restores one', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction de 20 pour cent' });

    await typeEntry(view, '60');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(view.getByTestId('appointment-discount-entry-error').props.children).toBe(
      'Le pourcentage ne peut pas dépasser 50 %.',
    );

    await typeEntry(view, '50');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'PERCENT', percent: 50 });
    expect(view.queryByTestId('appointment-discount-entry-error')).toBeNull();
    expect(view.getByTestId('appointment-discount-preset-PERCENT-50').props.accessibilityState.selected).toBe(true);
  });

  it('says in words when a custom amount above the services total is limited to it, and the net stays zero', async () => {
    const { view, press } = await renderEditor({ grossEuros: 30 });
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction en euros' });

    await typeEntry(view, '50');

    expect(view.queryByTestId('appointment-discount-entry-error')).toBeNull();
    expect(view.getByTestId('appointment-discount-clamped').props.children).toBe('Limitée au total des prestations.');

    expect(view.getByTestId('appointment-discount-net-total').props.children).toBe(euros(0));

    await typeEntry(view, '12');
    expect(view.queryByTestId('appointment-discount-clamped')).toBeNull();
    expect(view.getByTestId('appointment-discount-net-total').props.children).toBe(euros(1800));
  });

  it('« Aucune réduction » also empties the entry', async () => {
    const { view, onChange, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });
    await press({ label: 'Réduction en euros' });
    await typeEntry(view, '7,50');
    mockSelectionHaptic.mockClear(); // the mode switch ticked once

    await press({ label: 'Supprimer la réduction' });

    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(entry(view).props.value).toBe('');
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
  });

  it('binds the compact iOS « OK » keyboard accessory to the entry', async () => {
    const { view, press } = await renderEditor();
    await press({ testID: 'appointment-discount-toggle' });

    const accessoryID = entry(view).props.inputAccessoryViewID as string;
    expect(typeof accessoryID).toBe('string');
    expect(accessoryID.length).toBeGreaterThan(0);
    if (Platform.OS === 'ios') {
      expect(view.getByTestId('appointment-discount-keyboard-dismiss')).toBeTruthy();
      expect(view.getByLabelText('Fermer le clavier')).toBeTruthy();
    } else {
      expect(view.queryByTestId('appointment-discount-keyboard-dismiss')).toBeNull();
    }
  });
});
