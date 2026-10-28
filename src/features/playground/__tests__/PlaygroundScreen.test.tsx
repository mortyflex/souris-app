// BeautIzzy — Playground développeur landing (behavioural)

import { act, fireEvent, render } from '@testing-library/react-native';

import { PROFESSIONS } from '@/domain/business';

import { isPlaygroundAvailable } from '../availability';
import { PlaygroundScreen } from '../PlaygroundScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => mockCanGoBack }),
}));
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
jest.mock('../availability', () => ({ isPlaygroundAvailable: jest.fn(() => true) }));
const mockStart = jest.fn();
jest.mock('../demo/session', () => ({
  usePlaygroundDemoSession: () => ({ scenario: null, start: mockStart, reset: jest.fn(), exit: jest.fn() }),
}));

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

async function renderPlayground() {
  const view = await render(<PlaygroundScreen />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockStart.mockClear();
  mockCanGoBack = true;
  jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
});

describe('PlaygroundScreen', () => {
  it('says what it is, lists the three professions and makes the announced ones selectable here only', async () => {
    const view = await renderPlayground();

    expect(view.getByTestId('playground-screen')).toBeTruthy();
    expect(view.getByText('Mode démonstration')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Playground développeur' })).toBeTruthy();
    expect(view.getByTestId('playground-notice')).toBeTruthy();
    expect(view.getByText('Outil interne de développement')).toBeTruthy();

    expect(PROFESSIONS.map((profession) => profession.id)).toEqual(['HAIRDRESSING', 'NAILS', 'ESTHETICS']);
    for (const id of ['HAIRDRESSING', 'NAILS', 'ESTHETICS'] as const) {
      expect(view.getByTestId(`activity-${id}`).props.accessibilityState.disabled).toBe(false);
    }
    expect(view.getByText('Coiffure')).toBeTruthy();
    expect(view.getByText('Onglerie')).toBeTruthy();
    expect(view.getByText('Esthétique')).toBeTruthy();
    // The announcement stays visible: a preview never pretends a profession is available.
    expect(view.getByTestId('activity-NAILS-coming-soon')).toBeTruthy();
    expect(view.getByTestId('activity-ESTHETICS-coming-soon')).toBeTruthy();
    expect(view.queryByTestId('activity-HAIRDRESSING-coming-soon')).toBeNull();
  });

  it('previews the chosen profession on its own route, and nothing before a choice', async () => {
    const view = await renderPlayground();
    const preview = view.getByTestId('playground-preview-onboarding');

    expect(preview.props.accessibilityState.disabled).toBe(true);
    await press(preview);
    expect(mockPush).not.toHaveBeenCalled();

    await press(view.getByTestId('activity-NAILS'));
    expect(view.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(true);
    expect(view.getByText('Prévisualiser l’onboarding Onglerie')).toBeTruthy();
    await press(view.getByTestId('playground-preview-onboarding'));
    expect(mockPush).toHaveBeenCalledWith('/playground/NAILS');

    await press(view.getByTestId('activity-ESTHETICS'));
    expect(view.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(false);
    await press(view.getByTestId('playground-preview-onboarding'));
    expect(mockPush).toHaveBeenLastCalledWith('/playground/ESTHETICS');
  });

  it('explores the application of the chosen profession: a NEW demo session, then the demo group', async () => {
    const view = await renderPlayground();
    const explore = view.getByTestId('playground-explore-app');

    expect(explore.props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('Explorer l’application')).toBeTruthy();
    await press(explore);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    await press(view.getByTestId('activity-ESTHETICS'));
    expect(view.getByText('Explorer l’application Esthétique')).toBeTruthy();
    await press(view.getByTestId('playground-explore-app'));
    expect(mockStart).toHaveBeenCalledWith('ESTHETICS');
    expect(mockPush).toHaveBeenCalledWith('/(auth)/(demo)/(tabs)/accueil');
    expect(mockStart.mock.invocationCallOrder[0]!).toBeLessThan(mockPush.mock.invocationCallOrder[0]!);
    // The announced professions are explorable here, and only here: nothing about their availability changed.
    await press(view.getByTestId('activity-NAILS'));
    await press(view.getByTestId('playground-explore-app'));
    expect(mockStart).toHaveBeenLastCalledWith('NAILS');
  });

  it('leaves with the back button — to the signed-out entry when nothing is behind it', async () => {
    const view = await renderPlayground();
    await press(view.getByTestId('onboarding-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    mockCanGoBack = false;
    await press(view.getByTestId('onboarding-back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('renders nothing when the Playground is unavailable, whatever mounted it', async () => {
    jest.mocked(isPlaygroundAvailable).mockReturnValue(false);
    const view = await renderPlayground();
    expect(view.toJSON()).toBeNull();
  });
});
