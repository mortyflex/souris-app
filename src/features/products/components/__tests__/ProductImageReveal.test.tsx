import { act, render } from '@testing-library/react-native';

import { ProductImageReveal } from '../ProductImageReveal';

let mockReducedMotion = false;
const mockWithSpring = jest.fn((value: unknown) => value);
const mockWithTiming = jest.fn((value: unknown) => value);

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, { View: AnimatedView }),
    Easing: { bezier: () => (value: number) => value },
    useSharedValue: (initial: unknown) => {
      let value = initial;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => mockReducedMotion,
    withSpring: (value: unknown) => mockWithSpring(value),
    withTiming: (value: unknown) => mockWithTiming(value),
  };
});

describe('ProductImageReveal', () => {
  beforeEach(() => {
    mockReducedMotion = false;
    mockWithSpring.mockClear();
    mockWithTiming.mockClear();
  });

  it('animates the settle each time a new image URI arrives', async () => {
    const view = await render(
      <ProductImageReveal imageUri="file:///products/raw.jpg" variant="form" />,
    );
    expect(mockWithSpring).toHaveBeenCalledWith(1);
    expect(mockWithTiming).toHaveBeenCalledWith(1);

    await act(async () => {
      view.rerender(
        <ProductImageReveal imageUri="file:///caches/ProductImages/p.png" variant="form" />,
      );
    });
    expect(mockWithSpring).toHaveBeenCalledTimes(2);
    expect(view.getByTestId('product-image-sticker')).toBeTruthy();
  });

  it('renders the final state directly when reduced motion is on', async () => {
    mockReducedMotion = true;
    const view = await render(
      <ProductImageReveal
        imageUri="file:///caches/ProductImages/p.png"
        productName="Sérum"
        variant="form"
      />,
    );

    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(view.getByLabelText('Photo de Sérum')).toBeTruthy();
    expect(view.getByTestId('product-image-source').props.source).toEqual({
      uri: 'file:///caches/ProductImages/p.png',
    });
  });
});
