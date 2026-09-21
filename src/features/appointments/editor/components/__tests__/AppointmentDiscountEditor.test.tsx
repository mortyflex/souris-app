import { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import {
  getAppointmentServicesTotal,
  type AppointmentDiscount,
} from '@/domain/appointments';
import { discountIcon } from '@/shared/icons/discount-icon';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { getAppTextStyle } from '@/shared/ui/AppText';
import { lavender, semanticColors } from '@/shared/ui/theme';

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
