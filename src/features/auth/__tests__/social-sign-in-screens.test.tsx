// BeautIzzy — « Continuer avec Google / Apple » on the account screens
// (behavioral; providers are fakes).

import { act, fireEvent, render } from '@testing-library/react-native';

import type { SocialSignInOutcome } from '../gateway';
import { AuthProvider } from '../session/AuthProvider';
import { SignInScreen } from '../SignInScreen';
import { SignUpScreen } from '../SignUpScreen';
import { createFakeAuthGateway, type FakeAuthGateway } from '../testing/fake-auth-gateway';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
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

// The system button is a native view: a plain pressable stands in for it.
jest.mock('expo-apple-authentication', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AppleAuthenticationButton: ({ onPress }: { readonly onPress: () => void }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Continuer avec Apple', onPress }),
    AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationButtonType: { CONTINUE: 1 },
  };
});

async function renderWithAuth(gateway: FakeAuthGateway, screen: React.ReactElement) {
  const view = await render(<AuthProvider gateway={gateway}>{screen}</AuthProvider>);
  await act(async () => {});
  return view;
}

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

const type = (element: unknown, text: string) =>
  act(async () => {
    fireEvent.changeText(element as Parameters<typeof fireEvent.changeText>[0], text);
  });

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
});

describe.each([
  ['SignInScreen', () => <SignInScreen />, 'submit-sign-in'],
  ['SignUpScreen', () => <SignUpScreen />, 'submit-sign-up'],
])('%s — social sign-in', (_name, screen, submitTestID) => {
  it('offers Google above the email form, with the separator, and keeps the email form', async () => {
    const view = await renderWithAuth(createFakeAuthGateway(), screen());
    expect(view.getByRole('button', { name: 'Continuer avec Google' })).toBeTruthy();
    expect(view.getByText('ou continuer avec votre e-mail')).toBeTruthy();
    expect(view.getByLabelText('Email')).toBeTruthy();
    expect(view.getByTestId(submitTestID)).toBeTruthy();
  });

  it('never offers Apple where the device does not support it (Android)', async () => {
    const android = await renderWithAuth(createFakeAuthGateway({ appleAvailable: false }), screen());
    expect(android.queryByTestId('continue-with-apple')).toBeNull();
  });

  it('offers Apple where the device supports it (iOS)', async () => {
    const iphone = await renderWithAuth(createFakeAuthGateway({ appleAvailable: true }), screen());
    expect(iphone.getByTestId('continue-with-apple')).toBeTruthy();
  });

  it('while Google runs, every button and the email form are disabled; a second tap starts nothing', async () => {
    const pending = deferred<SocialSignInOutcome>();
    const gateway = createFakeAuthGateway({ signInWithGoogle: () => pending.promise });
    const view = await renderWithAuth(gateway, screen());

    await press(view.getByTestId('continue-with-google'));
    expect(view.getByTestId('continue-with-google')).toBeDisabled();
    expect(view.getByTestId(submitTestID)).toBeDisabled();
    expect(view.getByLabelText('Email').props.editable).toBe(false);
    expect(view.getByLabelText('Connexion avec Google en cours')).toBeTruthy();
    await press(view.getByTestId('continue-with-google'));
    expect(gateway.calls.signInWithGoogle).toBe(1);

    await act(async () => pending.resolve({ kind: 'cancelled' }));
    expect(view.getByTestId('continue-with-google')).not.toBeDisabled();
    expect(view.getByTestId(submitTestID)).not.toBeDisabled();
  });

  it('a cancellation says nothing; a failure says one French sentence, never a provider text', async () => {
    const outcomes: SocialSignInOutcome[] = [
      { kind: 'cancelled' },
      { kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } },
      { kind: 'failed', failure: { code: 'PROVIDER_UNAVAILABLE' } },
    ];
    const gateway = createFakeAuthGateway({ signInWithGoogle: async () => outcomes.shift()! });
    const view = await renderWithAuth(gateway, screen());

    await press(view.getByTestId('continue-with-google'));
    expect(view.queryByTestId('social-sign-in-failure')).toBeNull();

    await press(view.getByTestId('continue-with-google'));
    expect(view.getByText('La connexion n’a pas abouti. Réessayez, ou utilisez votre email et votre mot de passe.')).toBeTruthy();

    await press(view.getByTestId('continue-with-google'));
    expect(
      view.getByText('Cette méthode de connexion n’est pas encore disponible. Utilisez votre email et votre mot de passe.'),
    ).toBeTruthy();
  });

  it('Apple: the system button starts the native flow', async () => {
    const gateway = createFakeAuthGateway({ appleAvailable: true, signInWithApple: async () => ({ kind: 'cancelled' }) });
    const view = await renderWithAuth(gateway, screen());
    await press(view.getByRole('button', { name: 'Continuer avec Apple' }));
    expect(gateway.calls.signInWithApple).toBe(1);
    expect(gateway.calls.signInWithGoogle).toBe(0);
  });
});

describe('SignInScreen — email + password regression', () => {
  it('still signs in with email and password, without touching Google or Apple', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <SignInScreen />);
    await type(view.getByLabelText('Email'), ' Lea@Example.com ');
    await type(view.getByLabelText('Mot de passe'), 'password123');
    await press(view.getByTestId('submit-sign-in'));
    expect(gateway.calls.signIn).toEqual([{ email: 'lea@example.com', password: 'password123' }]);
    expect(gateway.calls.signInWithGoogle).toBe(0);
    expect(gateway.calls.signInWithApple).toBe(0);
  });
});
