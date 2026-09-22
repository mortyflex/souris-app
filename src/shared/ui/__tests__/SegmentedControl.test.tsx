import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  SegmentedControl,
  formatSegmentCount,
  segmentedControlOptionHeight,
} from '../SegmentedControl';
import { gloss, radii, touchTarget } from '../theme';

const OPTIONS = [
  { value: 'day', label: 'Jour' },
  { value: 'month', label: 'Mois' },
] as const;

describe('SegmentedControl', () => {
  it('exposes its options as tabs and reports the pressed one', async () => {
    const onChange = jest.fn();
    const view = await render(
      <SegmentedControl onChange={onChange} options={OPTIONS} testID="period" value="day" />,
    );

    expect(view.getByTestId('period').props.accessibilityRole).toBe('tablist');
    expect(view.getByLabelText('Jour').props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText('Mois').props.accessibilityState.selected).toBe(false);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Mois'));
    });

    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('is a glass capsule whose compact options keep the platform touch target', async () => {
    const view = await render(
      <SegmentedControl onChange={jest.fn()} options={OPTIONS} testID="period" value="day" />,
    );

    const glass = view.getByTestId('period-glass', { includeHiddenElements: true });
    expect(StyleSheet.flatten(glass.props.style)).toMatchObject({
      backgroundColor: gloss.glass.fillCapsule,
      borderColor: gloss.glass.borderCapsule,
      borderRadius: radii.pill,
      overflow: 'hidden',
    });
    expect(glass.props.pointerEvents).toBe('none');

    const selected = view.getByLabelText('Jour');
    const unselected = view.getByLabelText('Mois');
    expect(StyleSheet.flatten(selected.props.style)).toMatchObject({
      backgroundColor: gloss.glass.selectedFill,
      borderColor: gloss.glass.selectedBorder,
      height: segmentedControlOptionHeight,
    });
    expect(StyleSheet.flatten(unselected.props.style)).toMatchObject({ borderColor: 'transparent' });

    const { top, bottom } = selected.props.hitSlop as { top: number; bottom: number };
    expect(segmentedControlOptionHeight).toBeLessThan(touchTarget.ios);
    expect(segmentedControlOptionHeight + top + bottom).toBeGreaterThanOrEqual(touchTarget.ios);
  });

  it('fills the selected option with its own colour and a white label, stretched when asked', async () => {
    const colored = [
      { value: 'a', label: 'Services', selectedColor: '#7354C7' },
      { value: 'b', label: 'Techniques', selectedColor: '#2F6DB8' },
    ] as const;
    const view = await render(
      <SegmentedControl onChange={jest.fn()} options={colored} stretch testID="category" value="b" />,
    );

    expect(StyleSheet.flatten(view.getByTestId('category').props.style)).toMatchObject({
      alignSelf: 'stretch',
    });
    const selected = view.getByLabelText('Techniques');
    const unselected = view.getByLabelText('Services');
    expect(StyleSheet.flatten(selected.props.style)).toMatchObject({
      backgroundColor: '#2F6DB8',
      borderColor: '#2F6DB8',
      flex: 1,
    });
    expect(StyleSheet.flatten(unselected.props.style).backgroundColor).toBeUndefined();
    expect(StyleSheet.flatten(view.getByText('Techniques').props.style).color).toBe('#FFFFFF');
  });
  it('shows an optional count pill after the label, spoken with it and capped at 999+', async () => {
    const counted = [
      { value: 'appointments', label: 'Rendez-vous', count: 20, testID: 'tab-a' },
      { value: 'purchases', label: 'Produits achetés', count: 1234, testID: 'tab-p' },
    ] as const;
    const view = await render(
      <SegmentedControl onChange={jest.fn()} options={counted} stretch value="appointments" />,
    );

    expect(view.getByTestId('tab-a').props.accessibilityLabel).toBe('Rendez-vous, 20');
    expect(view.getByTestId('tab-a').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('tab-a-count').props.children).toBe('20');
    expect(view.getByTestId('tab-p').props.accessibilityLabel).toBe('Produits achetés, 1234');
    expect(view.getByTestId('tab-p-count').props.children).toBe('999+');
    // The cap starts only beyond 999.
    expect(formatSegmentCount(0)).toBe('0');
    expect(formatSegmentCount(999)).toBe('999');
    expect(formatSegmentCount(1000)).toBe('999+');
  });
});
