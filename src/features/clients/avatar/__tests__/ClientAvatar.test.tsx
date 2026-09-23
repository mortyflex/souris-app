import { act, fireEvent, render } from '@testing-library/react-native';

import { ClientAvatar } from '../ClientAvatar';

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

const audrey = { firstName: 'Audrey', lastName: 'Tarmis' };

describe('ClientAvatar', () => {
  it('renders the initials fallback, spoken as the Client name', async () => {
    const view = await render(<ClientAvatar client={audrey} />);

    const avatar = view.getByTestId('client-avatar');
    expect(avatar.props.accessibilityLabel).toBe('Audrey Tarmis');
    expect(avatar.props.accessibilityRole).toBe('image');
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('AT');
    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
  });

  it('keeps a single initial for a Client without last name', async () => {
    const view = await render(<ClientAvatar client={{ firstName: 'nour' }} />);

    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('N');
  });

  it('is a circle of the requested size', async () => {
    const view = await render(<ClientAvatar client={audrey} size={40} testID="row-avatar" />);

    expect(view.getByTestId('row-avatar')).toHaveStyle({ borderRadius: 20, height: 40, width: 40 });
  });

  it('draws the profile portrait frame as a softly rounded square', async () => {
    const view = await render(<ClientAvatar client={audrey} shape="portrait" size={96} />);

    expect(view.getByTestId('client-avatar')).toHaveStyle({ borderRadius: 24, height: 96, width: 96 });
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('AT');
  });

  it('fills the SAME portrait frame with a future photo, cropped rather than distorted', async () => {
    const view = await render(
      <ClientAvatar client={audrey} photoUri="file:///portrait.jpg" shape="portrait" size={96} />,
    );

    const frame = view.getByTestId('client-avatar');
    expect(frame).toHaveStyle({ borderRadius: 24, height: 96, overflow: 'hidden', width: 96 });
    const photo = view.getByTestId('client-avatar-photo');
    expect(photo.props.contentFit).toBe('cover');
    expect(photo).toHaveStyle({ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 });

    await act(async () => {
      fireEvent(photo, 'error');
    });
    expect(view.getByTestId('client-avatar')).toHaveStyle({ borderRadius: 24, height: 96, width: 96 });
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('AT');
  });

  it('shows a portrait in the same circle when a photo source is given', async () => {
    const view = await render(<ClientAvatar client={audrey} photoUri="file:///portrait.jpg" />);

    const photo = view.getByTestId('client-avatar-photo');
    expect(photo.props.source).toEqual({ uri: 'file:///portrait.jpg' });
    expect(photo.props.contentFit).toBe('cover');
    expect(view.queryByTestId('client-avatar-initials')).toBeNull();
    expect(view.getByTestId('client-avatar')).toHaveStyle({ height: 72, width: 72 });
    expect(view.getByTestId('client-avatar').props.accessibilityLabel).toBe('Photo de Audrey Tarmis');
  });

  it('falls back to the initials when the portrait cannot load', async () => {
    const view = await render(<ClientAvatar client={audrey} photoUri="file:///missing.jpg" />);

    await act(async () => {
      fireEvent(view.getByTestId('client-avatar-photo'), 'error');
    });

    expect(view.queryByTestId('client-avatar-photo')).toBeNull();
    expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('AT');
    expect(view.getByTestId('client-avatar').props.accessibilityLabel).toBe('Audrey Tarmis');
  });
});
