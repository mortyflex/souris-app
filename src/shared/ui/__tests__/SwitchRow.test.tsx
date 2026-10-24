import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { SwitchRow } from '../SwitchRow';
import { semanticColors } from '../theme';

// The host element carries the platform-translated Switch props: Android's
// `thumbTintColor` / `trackColorForTrue`, iOS's `thumbTintColor` / `onTintColor`.

describe('SwitchRow', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('on Android, paints a white thumb on the violet track instead of the theme teal', async () => {
    Platform.OS = 'android';
    const view = await render(
      <SwitchRow label="Anniversaires" onValueChange={jest.fn()} testID="row" value />,
    );

    const toggle = view.getByTestId('row-switch');
    expect(toggle.props.thumbTintColor).toBe(semanticColors.onAccent);
    expect(toggle.props.trackColorForTrue).toBe(semanticColors.accent);
    expect(toggle.props.trackColorForFalse).toBeUndefined();
  });

  it('on Android, fades the on track to lavender when the switch is disabled', async () => {
    Platform.OS = 'android';
    const view = await render(
      <SwitchRow disabled label="Clients inactifs" onValueChange={jest.fn()} testID="row" value />,
    );

    const toggle = view.getByTestId('row-switch');
    expect(toggle.props.enabled).toBe(false);
    expect(toggle.props.thumbTintColor).toBe(semanticColors.onAccent);
    expect(toggle.props.trackColorForTrue).toBe(semanticColors.borderLavender);
  });

  it('on iOS, keeps the native thumb and the violet track, disabled or not', async () => {
    Platform.OS = 'ios';
    const view = await render(
      <SwitchRow disabled label="Anniversaires" onValueChange={jest.fn()} testID="row" value />,
    );

    const toggle = view.getByTestId('row-switch');
    expect(toggle.props.thumbTintColor).toBeUndefined();
    expect(toggle.props.onTintColor).toBe(semanticColors.accent);
    expect(toggle.props.tintColor).toBeUndefined();
  });
});
