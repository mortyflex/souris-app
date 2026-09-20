import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { SegmentedControl, segmentedControlOptionHeight } from '../SegmentedControl';
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
});
