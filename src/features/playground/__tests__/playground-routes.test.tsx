// BeautIzzy — Playground routes: the guard is enforced by the routes themselves

import { act, render } from '@testing-library/react-native';

import PlaygroundOnboardingPreviewRoute from '@/app/(auth)/playground/[activityType]';
import PlaygroundRoute from '@/app/(auth)/playground/index';

import { isPlaygroundAvailable } from '../availability';

let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) => React.createElement(Text, { testID: 'redirect' }, href),
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});
jest.mock('../availability', () => ({ isPlaygroundAvailable: jest.fn(() => false) }));
jest.mock('../demo/session', () => ({
  usePlaygroundDemoSession: () => ({ scenario: null, start: jest.fn(), reset: jest.fn(), exit: jest.fn() }),
}));

async function renderRoute(element: React.ReactElement) {
  const view = await render(element);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mockParams = { activityType: 'NAILS' };
  jest.mocked(isPlaygroundAvailable).mockReturnValue(false);
});

describe('Playground routes', () => {
  it('redirect a direct navigation to the landing to the signed-out entry when the Playground is unavailable', async () => {
    const landing = await renderRoute(<PlaygroundRoute />);
    expect(landing.getByTestId('redirect').props.children).toBe('/');
    expect(landing.queryByTestId('playground-screen')).toBeNull();
  });

  it('redirect a deep link to a preview to the signed-out entry when the Playground is unavailable', async () => {
    const preview = await renderRoute(<PlaygroundOnboardingPreviewRoute />);
    expect(preview.getByTestId('redirect').props.children).toBe('/');
    expect(preview.queryByTestId('onboarding-activity')).toBeNull();
  });

  it('open the landing when available', async () => {
    jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
    const landing = await renderRoute(<PlaygroundRoute />);
    expect(landing.getByTestId('playground-screen')).toBeTruthy();
  });

  it('open the preview of a profession when available', async () => {
    jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
    const preview = await renderRoute(<PlaygroundOnboardingPreviewRoute />);
    expect(preview.getByTestId('onboarding-activity')).toBeTruthy();
    expect(preview.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(true);
  });

  it.each(['BARBER', 'OTHER', 'nails', 'anything', undefined])(
    'send the identifier %s, which is not a profession, back to the landing',
    async (activityType) => {
      jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
      mockParams = { activityType };
      const view = await renderRoute(<PlaygroundOnboardingPreviewRoute />);
      expect(view.getByTestId('redirect').props.children).toBe('/playground');
    },
  );
});
