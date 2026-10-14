// BeautIzzy — account screens (behavioral, no pixel tests)

import { act, fireEvent, render } from '@testing-library/react-native';

import { semanticColors } from '@/shared/ui/theme';

import { AuthProvider } from '../session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '../testing/fake-auth-gateway';
import { SignInScreen } from '../SignInScreen';
import { SignUpScreen } from '../SignUpScreen';
import { VerifyEmailScreen } from '../VerifyEmailScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The first-run frame fades its groups in with Reanimated; tests render it settled.
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

async function renderWithAuth(gateway: FakeAuthGateway, screen: React.ReactElement) {
  const view = await render(<AuthProvider gateway={gateway}>{screen}</AuthProvider>);
  await act(async () => {});
  return view;
}

/** Every interaction runs inside an awaited act: React 19 flushes updates asynchronously. */
const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });
const type = (element: unknown, text: string) =>
  act(async () => {
    fireEvent.changeText(element as Parameters<typeof fireEvent.changeText>[0], text);
  });

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
});

describe('SignUpScreen', () => {
  it('belongs to the first-run frame: brand, « Créons votre compte », and a back to Discovery', async () => {
    const view = await renderWithAuth(createFakeAuthGateway(), <SignUpScreen />);

    expect(view.getByRole('header', { name: 'Créons votre compte' })).toBeTruthy();
    // The accent headline belongs to the first Discovery slide alone.
    expect(view.getByRole('header', { name: 'Créons votre compte' })).toHaveStyle({ color: semanticColors.foreground });
    expect(view.getByText('Quelques secondes suffisent pour commencer avec BeautIzzy.')).toBeTruthy();
    expect(view.getAllByLabelText('BeautIzzy')).toHaveLength(1);
    expect(view.queryByTestId('onboarding-progress')).toBeNull();
    expect(view.getByLabelText('Email')).toBeTruthy();
    expect(view.getByLabelText('Mot de passe')).toBeTruthy();

    await press(view.getByTestId('onboarding-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opened cold (the confirmation link), back goes to the Discovery entry instead of nowhere', async () => {
    mockCanGoBack.mockReturnValue(false);
    const view = await renderWithAuth(createFakeAuthGateway(), <SignUpScreen />);

    await press(view.getByTestId('onboarding-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('validates inline before calling the gateway', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <SignUpScreen />);

    await press(view.getByTestId('submit-sign-up'));
    expect(view.getByText('L’email est requis.')).toBeTruthy();
    expect(view.getByText('Le mot de passe est requis.')).toBeTruthy();

    await type(view.getByTestId('email-input'), 'not-an-email');
    await type(view.getByTestId('password-input'), 'short');
    expect(view.getByText('Adresse email invalide.')).toBeTruthy();
    expect(view.getByText('8 caractères minimum.')).toBeTruthy();
    expect(gateway.calls.signUp).toHaveLength(0);
  });

  it('submits normalized credentials, and keeps them when the gateway fails', async () => {
    const gateway = createFakeAuthGateway({
      signUp: jest
        .fn()
        .mockResolvedValueOnce({ kind: 'failed', failure: { code: 'EMAIL_ALREADY_REGISTERED' } })
        .mockResolvedValueOnce({ kind: 'authenticated', user: fakeUser }),
    });
    const view = await renderWithAuth(gateway, <SignUpScreen />);

    await type(view.getByTestId('email-input'), '  Lea@Example.com ');
    await type(view.getByTestId('password-input'), 'password123');
    await press(view.getByTestId('submit-sign-up'));

    expect(gateway.calls.signUp).toEqual([{ email: 'lea@example.com', password: 'password123' }]);
    expect(view.getByText('Un compte existe déjà avec cet email.')).toBeTruthy();
    expect(view.getByTestId('email-input').props.value).toBe('  Lea@Example.com ');
    expect(view.getByTestId('password-input').props.value).toBe('password123');
    expect(view.queryByText(/AuthApiError|\{|supabase/i)).toBeNull();

    await press(view.getByTestId('submit-sign-up'));
    expect(gateway.calls.signUp).toHaveLength(2);
    expect(view.queryByText('Un compte existe déjà avec cet email.')).toBeNull();
  });

  it('moves to the confirmation state when Supabase requires the email link', async () => {
    const gateway = createFakeAuthGateway({
      signUp: async ({ email }) => ({ kind: 'confirmation-required', email }),
    });
    const view = await renderWithAuth(gateway, <SignUpScreen />);

    await type(view.getByTestId('email-input'), 'new@example.com');
    await type(view.getByTestId('password-input'), 'password123');
    await press(view.getByTestId('submit-sign-up'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/verify-email', params: { email: 'new@example.com' } });
  });

  it('toggles password visibility and offers the sign-in alternative', async () => {
    const view = await renderWithAuth(createFakeAuthGateway(), <SignUpScreen />);

    expect(view.getByTestId('password-input').props.secureTextEntry).toBe(true);
    await press(view.getByLabelText('Afficher le mot de passe'));
    expect(view.getByTestId('password-input').props.secureTextEntry).toBe(false);
    expect(view.getByLabelText('Masquer le mot de passe')).toBeTruthy();

    await press(view.getByText('J’ai déjà un compte'));
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });
});

describe('SignInScreen', () => {
  it('belongs to the first-run frame too, with a back to Discovery (or its entry without history)', async () => {
    const view = await renderWithAuth(createFakeAuthGateway(), <SignInScreen />);

    expect(view.getByRole('header', { name: 'Se connecter' })).toBeTruthy();
    expect(view.getByRole('header', { name: 'Se connecter' })).toHaveStyle({ color: semanticColors.foreground });
    expect(view.getAllByLabelText('BeautIzzy')).toHaveLength(1);
    expect(view.queryByTestId('onboarding-progress')).toBeNull();

    await press(view.getByTestId('onboarding-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValue(false);
    await press(view.getByTestId('onboarding-back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('requires both fields, reports wrong credentials, then signs in', async () => {
    const gateway = createFakeAuthGateway({
      signIn: async ({ password }) =>
        password === 'right'
          ? { kind: 'authenticated', user: fakeUser }
          : { kind: 'failed', failure: { code: 'INVALID_CREDENTIALS' } },
    });
    const view = await renderWithAuth(gateway, <SignInScreen />);

    await press(view.getByTestId('submit-sign-in'));
    expect(view.getByText('L’email est requis.')).toBeTruthy();
    expect(gateway.calls.signIn).toHaveLength(0);

    await type(view.getByTestId('email-input'), 'lea@example.com');
    await type(view.getByTestId('password-input'), 'wrong');
    await press(view.getByTestId('submit-sign-in'));
    expect(view.getByText('Email ou mot de passe incorrect.')).toBeTruthy();
    expect(view.getByTestId('email-input').props.value).toBe('lea@example.com');

    await type(view.getByTestId('password-input'), 'right');
    await press(view.getByTestId('submit-sign-in'));
    expect(gateway.calls.signIn).toHaveLength(2);
    expect(view.queryByText('Email ou mot de passe incorrect.')).toBeNull();
  });

  it('explains a network failure and an unconfirmed account without exposing provider details', async () => {
    const gateway = createFakeAuthGateway({
      signIn: jest
        .fn()
        .mockResolvedValueOnce({ kind: 'failed', failure: { code: 'NETWORK' } })
        .mockResolvedValueOnce({ kind: 'failed', failure: { code: 'EMAIL_NOT_CONFIRMED' } }),
    });
    const view = await renderWithAuth(gateway, <SignInScreen />);
    await type(view.getByTestId('email-input'), 'lea@example.com');
    await type(view.getByTestId('password-input'), 'password123');

    await press(view.getByTestId('submit-sign-in'));
    expect(view.getByText('Connexion impossible. Vérifiez votre réseau et réessayez.')).toBeTruthy();

    await press(view.getByTestId('submit-sign-in'));
    expect(view.getByText('Confirmez votre adresse email avant de vous connecter.')).toBeTruthy();
    await press(view.getByText('Renvoyer l’email de confirmation'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/verify-email', params: { email: 'lea@example.com' } });

    await press(view.getByText('Créer un compte'));
    expect(mockReplace).toHaveBeenCalledWith('/sign-up');
  });
});

describe('VerifyEmailScreen', () => {
  it('shows the address in the first-run frame, returns to sign-in, and resends with feedback', async () => {
    const gateway = createFakeAuthGateway({
      resend: jest
        .fn()
        .mockResolvedValueOnce({ kind: 'sent' })
        .mockResolvedValueOnce({ kind: 'failed', failure: { code: 'RATE_LIMITED' } }),
    });
    const view = await renderWithAuth(gateway, <VerifyEmailScreen email="new@example.com" />);

    expect(view.getByTestId('verify-email-address').props.children).toBe('new@example.com');
    expect(view.getByRole('header', { name: 'Vérifiez votre boîte mail\u00a0✨' })).toBeTruthy();
    expect(view.getByText('Ouvrez le lien pour confirmer votre adresse, puis connectez-vous.')).toBeTruthy();
    expect(view.getAllByLabelText('BeautIzzy')).toHaveLength(1);
    // The link is opened outside the app: no automatic verification is claimed.
    expect(view.queryByText(/automatique|vérifi(é|ons) pour vous/i)).toBeNull();

    await press(view.getByText('Renvoyer l’email'));
    expect(gateway.calls.resend).toEqual(['new@example.com']);
    expect(view.getByText('Email renvoyé.')).toBeTruthy();

    await press(view.getByText('Renvoyer l’email'));
    expect(view.getByText('Trop de tentatives. Patientez un instant avant de réessayer.')).toBeTruthy();

    await press(view.getByTestId('back-to-sign-in'));
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });
});
