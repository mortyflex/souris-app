// BeautIzzy — Client photo frame: the badge is sized from the frame, from the
// validated 80 pt Profile portrait (32 pt badge) up at half the frame's rate,
// so the 112 pt creation portrait keeps a discreet badge.

import { render } from '@testing-library/react-native';

import { ClientPhotoFrame, clientPhotoBadgeMetrics } from '../ClientPhotoFrame';

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SymbolView: ({ size }: { readonly size: number }) =>
      React.createElement(View, { testID: 'symbol', accessibilityValue: { now: size } }),
  };
});

const client = { firstName: 'Nour', lastName: 'Benali' };

describe('ClientPhotoFrame', () => {
  it('keeps the Profile reference badge at 80 pt and grows it at half rate at 112 pt', () => {
    expect(clientPhotoBadgeMetrics(80)).toEqual({ size: 32, symbolSize: 15, offset: 6 });
    expect(clientPhotoBadgeMetrics(112)).toEqual({ size: 38, symbolSize: 18, offset: 7 });
  });

  it.each([
    [80, 32, 15, 6],
    [112, 38, 18, 7],
  ])('renders a %i pt frame with its badge and glyph in proportion', async (size, badge, glyph, offset) => {
    const view = await render(
      <ClientPhotoFrame
        accessibilityLabel="Ajouter une photo du client"
        busy={false}
        client={client}
        onPress={() => {}}
        photoUri={undefined}
        size={size}
        testID="frame"
      />,
    );

    expect(view.getByTestId('frame-button')).toHaveStyle({ height: size, width: size });
    expect(view.getByTestId('client-avatar')).toHaveStyle({ height: size, width: size, borderRadius: size / 4 });
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('NB');
    expect(view.getByTestId('frame-badge')).toHaveStyle({
      bottom: -offset,
      height: badge,
      right: -offset,
      width: badge,
    });
    expect(view.getByTestId('symbol').props.accessibilityValue).toEqual({ now: glyph });
    expect(view.queryByTestId('frame-busy')).toBeNull();
  });

  it('shows the spinner in the badge and ignores taps while busy', async () => {
    const onPress = jest.fn();
    const view = await render(
      <ClientPhotoFrame
        accessibilityLabel="Photo du client"
        busy
        client={client}
        onPress={onPress}
        photoUri="file:///app/Caches/draft.jpg"
        size={112}
        testID="frame"
      />,
    );

    expect(view.getByTestId('frame-busy')).toBeTruthy();
    expect(view.queryByTestId('symbol')).toBeNull();
    expect(view.getByTestId('frame-button').props.accessibilityState).toEqual({ busy: true, disabled: true });
  });
});
