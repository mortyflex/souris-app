import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { GlassIconButton, glassIconButtonSize, glassIcons } from '../GlassIconButton';
import { touchTarget } from '../theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

describe('GlassIconButton', () => {
  it('is an accessible button that runs its action', async () => {
    const onPress = jest.fn();
    const view = await render(
      <GlassIconButton accessibilityLabel="Retour" icon={glassIcons.back} onPress={onPress} testID="back" />,
    );

    const button = view.getByRole('button', { name: 'Retour' });
    await act(async () => {
      fireEvent.press(button);
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a true circle at least as large as the touch target, wearing the glass material as decoration', async () => {
    const view = await render(
      <GlassIconButton accessibilityLabel="Semaine suivante" icon={glassIcons.next} onPress={jest.fn()} testID="next" />,
    );

    const button = StyleSheet.flatten(view.getByTestId('next').props.style);
    const glass = view.getByTestId('glass-surface', { includeHiddenElements: true });
    const clip = StyleSheet.flatten(glass.props.style);

    expect(button).toMatchObject({
      alignItems: 'center',
      borderRadius: glassIconButtonSize / 2,
      height: glassIconButtonSize,
      justifyContent: 'center',
      width: glassIconButtonSize,
    });
    expect(glassIconButtonSize).toBeGreaterThanOrEqual(touchTarget.ios);
    expect(clip).toMatchObject({ borderRadius: glassIconButtonSize / 2, overflow: 'hidden' });
    expect(glass.props.pointerEvents).toBe('none');
    expect(glass.props.accessibilityElementsHidden).toBe(true);
  });
});
