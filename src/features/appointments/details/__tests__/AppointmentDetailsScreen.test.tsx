import { act, fireEvent, render } from '@testing-library/react-native';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';

import { AppointmentDetailsScreen } from '../AppointmentDetailsScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');

  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(NativeView, props);
  const createAnimationBuilder = () => {
    const builder = {
      duration: () => builder,
      easing: () => builder,
    };
    return builder;
  };

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    FadeIn: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    Easing: { bezier: () => () => 0 },
    interpolate: (value: number, input: number[], output: number[]) =>
      value <= input[0] ? output[0] : output[output.length - 1],
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => false,
    useSharedValue: (init: unknown) => {
      let value = init;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    withTiming: (value: unknown) => value,
  };
});

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(NativeView, props, children),
  };
});

describe('AppointmentDetailsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('resolves the client identity from the shared Client source and exposes Modifier', async () => {
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    expect(view.getByText('Sofia Petit')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('modify-appointment'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/appointments/edit/[appointmentId]',
      params: { appointmentId: 'agenda-sofia' },
    });
  });
});
