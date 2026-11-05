// BeautIzzy — password recovery: request, link landing, new password (behavioral)

import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import ResetPasswordRoute from '@/app/(auth)/reset-password';

import { ForgotPasswordScreen } from '../ForgotPasswordScreen';
import type { RecoveryLink } from '../recovery-link';
import { ResetPasswordScreen } from '../ResetPasswordScreen';
import { AuthProvider, useAuth, type AuthState } from '../session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '../testing/fake-auth-gateway';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
  useLocalSearchParams: () => mockSearchParams,
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

const CODE = '0b5c1f3e-8f7a-4d2b-9c61-2e4a7d9b1f20';
const LINK: RecoveryLink = { kind: 'code', code: CODE };

let authState: AuthState | undefined;

function StateProbe() {
  const { state } = useAuth();
  useEffect(() => {
    authState = state;
  });
  return <Text testID="auth-status">{state.status}</Text>;
}

async function renderWithAuth(gateway: FakeAuthGateway, screen: React.ReactElement) {
  const view = await render(
    <AuthProvider gateway={gateway}>
      {screen}
      <StateProbe />
    </AuthProvider>,
  );
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
  mockCanGoBack.mockReturnValue(true);
  authState = undefined;
});

describe('ForgotPasswordScreen', () => {
  it('validates the email before asking anything of the account service', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <ForgotPasswordScreen />);

    expect(view.getByRole('header', { name: 'Mot de passe oublié' })).toBeTruthy();
    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByText('L’email est requis.')).toBeTruthy();

    await type(view.getByTestId('email-input'), 'not-an-email');
    expect(view.getByText('Adresse email invalide.')).toBeTruthy();
    expect(gateway.calls.requestPasswordReset).toEqual([]);
  });

  it('sends the link to the normalized email and confirms without telling whether an account exists', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <ForgotPasswordScreen initialEmail="  Lea@Example.com " />);

    await press(view.getByTestId('submit-forgot-password'));
    expect(gateway.calls.requestPasswordReset).toEqual(['lea@example.com']);
    expect(view.getByTestId('forgot-password-sent')).toBeTruthy();
    expect(
      view.getByLabelText('Si un compte existe pour cette adresse, un lien vient d’être envoyé à lea@example.com'),
    ).toBeTruthy();
    expect(view.getByText('Ouvrez-le sur ce téléphone pour choisir un nouveau mot de passe. Pensez à regarder dans les courriers indésirables.')).toBeTruthy();

    // The resend waits out Supabase's one-minute interval (password-reset-cooldown.test.tsx).
    expect(view.getByTestId('resend-reset-link').props.accessibilityState).toMatchObject({ disabled: true });
    expect(view.getByText('Renvoyer le lien (60 s)')).toBeTruthy();
    await press(view.getByTestId('resend-reset-link'));
    expect(gateway.calls.requestPasswordReset).toEqual(['lea@example.com']);

    await press(view.getByTestId('back-to-sign-in'));
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    // The session is untouched by a request.
    expect(authState?.status).toBe('unauthenticated');
  });

  it('keeps the email and explains a refused request', async () => {
    const gateway = createFakeAuthGateway({
      requestPasswordReset: async () => ({ kind: 'failed', failure: { code: 'RATE_LIMITED' } }),
    });
    const view = await renderWithAuth(gateway, <ForgotPasswordScreen initialEmail="lea@example.com" />);

    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByText('Veuillez patienter avant de demander un nouveau lien.')).toBeTruthy();
    expect(view.getByTestId('email-input').props.value).toBe('lea@example.com');
    expect(view.queryByTestId('forgot-password-sent')).toBeNull();
  });

  it('says plainly when email cannot be sent yet, without claiming a link left', async () => {
    const gateway = createFakeAuthGateway({
      requestPasswordReset: async () => ({ kind: 'failed', failure: { code: 'EMAIL_DELIVERY_UNAVAILABLE' } }),
    });
    const view = await renderWithAuth(gateway, <ForgotPasswordScreen initialEmail="lea@example.com" />);

    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByText('L’envoi de l’email est momentanément indisponible. Réessayez plus tard.')).toBeTruthy();
    expect(view.queryByTestId('forgot-password-sent')).toBeNull();
    expect(authState?.status).toBe('unauthenticated');
  });
});

describe('the recovery link route (sourisapp://reset-password)', () => {
  it.each([
    [{ code: CODE }, 'reset-password-screen'],
    [{ error: 'access_denied', error_code: 'otp_expired' }, 'reset-password-link-failed'],
    [{ code: 'not a code!' }, 'reset-password-link-failed'],
    [{}, 'reset-password-link-failed'],
  ] as const)('routes %j to the matching moment, exchanging only a well-formed code', async (params, screen) => {
    mockSearchParams = params;
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <ResetPasswordRoute />);

    expect(view.getByTestId(screen)).toBeTruthy();
    expect(gateway.calls.startPasswordRecovery).toEqual('code' in params && params.code === CODE ? [CODE] : []);
  });

  it('names an expired link as expired', async () => {
    mockSearchParams = { error: 'access_denied', error_code: 'otp_expired' };
    const view = await renderWithAuth(createFakeAuthGateway(), <ResetPasswordRoute />);
    expect(view.getByRole('header', { name: 'Ce lien a expiré' })).toBeTruthy();
  });
});

describe('ResetPasswordScreen', () => {
  it('exchanges the link once, then asks for the new password typed twice', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <ResetPasswordScreen link={LINK} />);

    expect(gateway.calls.startPasswordRecovery).toEqual([CODE]);
    expect(authState?.status).toBe('recovering-password');
    expect(view.getByRole('header', { name: 'Nouveau mot de passe' })).toBeTruthy();
    expect(view.getByText('Choisissez le nouveau mot de passe du compte lea@example.com.')).toBeTruthy();
    // The code is never displayed.
    expect(view.queryByText(CODE, { exact: false })).toBeNull();

    await press(view.getByTestId('submit-new-password'));
    expect(view.getByText('Le mot de passe est requis.')).toBeTruthy();
    expect(view.getByText('Confirmez le mot de passe.')).toBeTruthy();

    await type(view.getByTestId('new-password-input'), 'password123');
    await type(view.getByTestId('confirm-password-input'), 'password124');
    expect(view.getByText('Les deux mots de passe ne correspondent pas.')).toBeTruthy();
    expect(gateway.calls.updatePassword).toEqual([]);

    await type(view.getByTestId('confirm-password-input'), 'password123');
    await press(view.getByTestId('submit-new-password'));
    expect(gateway.calls.updatePassword).toEqual(['password123']);
    // Signed in like after a sign-in: the root gate takes over from here.
    expect(authState).toEqual({ status: 'authenticated', user: fakeUser, session: 'live' });
    // Exchanged once only, whatever the re-renders.
    expect(gateway.calls.startPasswordRecovery).toEqual([CODE]);
  });

  it('keeps the recovery open and explains a refused password', async () => {
    const gateway = createFakeAuthGateway({
      updatePassword: async () => ({ kind: 'failed', failure: { code: 'SAME_PASSWORD' } }),
    });
    const view = await renderWithAuth(gateway, <ResetPasswordScreen link={LINK} />);

    await type(view.getByTestId('new-password-input'), 'password123');
    await type(view.getByTestId('confirm-password-input'), 'password123');
    await press(view.getByTestId('submit-new-password'));
    expect(view.getByText('Choisissez un mot de passe différent de l’ancien.')).toBeTruthy();
    expect(authState?.status).toBe('recovering-password');
    expect(view.getByTestId('submit-new-password')).toBeTruthy();
  });

  it('« Annuler » signs the recovery session out and returns to sign-in', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(gateway, <ResetPasswordScreen link={LINK} />);

    await press(view.getByTestId('cancel-recovery'));
    expect(gateway.calls.discardPasswordRecovery).toBe(1);
    expect(gateway.calls.signOut).toBe(0);
    expect(gateway.calls.updatePassword).toEqual([]);
    expect(authState?.status).toBe('unauthenticated');
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    // Abandoning never re-opens the same link.
    expect(gateway.calls.startPasswordRecovery).toEqual([CODE]);
  });

  it.each([
    ['RECOVERY_LINK_EXPIRED', 'Ce lien a expiré', 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.'],
    [
      'RECOVERY_LINK_INVALID',
      'Lien inutilisable',
      'Ce lien ne peut pas être utilisé ici. Ouvrez le dernier email reçu sur le téléphone où vous avez fait la demande, ou demandez un nouveau lien.',
    ],
    ['NETWORK', 'Lien inutilisable', 'Le lien n’a pas pu être vérifié. Vérifiez votre réseau, puis demandez un nouveau lien.'],
  ] as const)('a link refused with %s stays signed out and offers a new one', async (code, title, message) => {
    const gateway = createFakeAuthGateway({
      startPasswordRecovery: async () => ({ kind: 'failed', failure: { code } }),
    });
    const view = await renderWithAuth(gateway, <ResetPasswordScreen link={LINK} />);

    expect(view.getByRole('header', { name: title })).toBeTruthy();
    expect(view.getByText(message)).toBeTruthy();
    expect(authState?.status).toBe('unauthenticated');

    await press(view.getByTestId('request-new-link'));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
  });

  it('never calls the account service for a link that arrived with an error (expired or already used)', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderWithAuth(
      gateway,
      <ResetPasswordScreen link={{ kind: 'failed', failure: { code: 'RECOVERY_LINK_EXPIRED' } }} />,
    );

    expect(gateway.calls.startPasswordRecovery).toEqual([]);
    expect(view.getByRole('header', { name: 'Ce lien a expiré' })).toBeTruthy();
    await press(view.getByRole('button', { name: 'Retour à la connexion' }));
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });

  it('leaves an open session alone: a link opened while signed in is never exchanged', async () => {
    const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    await renderWithAuth(gateway, <ResetPasswordScreen link={LINK} />);

    expect(gateway.calls.startPasswordRecovery).toEqual([]);
    expect(gateway.calls.signOut).toBe(0);
    expect(gateway.calls.discardPasswordRecovery).toBe(0);
    expect(authState?.status).toBe('authenticated');
  });

  it('a wrong code from Supabase stays signed out and offers a new link', async () => {
    const gateway = createFakeAuthGateway({
      startPasswordRecovery: async () => ({ kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } }),
    });
    const view = await renderWithAuth(gateway, <ResetPasswordScreen link={{ kind: 'code', code: '00000000-0000-4000-8000-000000000000' }} />);

    expect(gateway.calls.startPasswordRecovery).toEqual(['00000000-0000-4000-8000-000000000000']);
    expect(view.getByRole('header', { name: 'Lien inutilisable' })).toBeTruthy();
    expect(view.queryByTestId('new-password-input')).toBeNull();
    expect(authState?.status).toBe('unauthenticated');
  });

  it('a newer link reaching a screen that still shows a refusal is exchanged, not answered with the old refusal', async () => {
    // iOS: the router hands a new link to the reset-password screen still in the stack.
    const OLD = '00000000-0000-4000-8000-000000000000';
    const gateway = createFakeAuthGateway({
      startPasswordRecovery: async (code) =>
        code === OLD ? { kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } } : { kind: 'recovering', user: fakeUser },
    });
    const view = await renderWithAuth(gateway, <ResetPasswordScreen link={{ kind: 'code', code: OLD }} />);
    expect(view.getByRole('header', { name: 'Lien inutilisable' })).toBeTruthy();

    await act(async () => {
      view.rerender(
        <AuthProvider gateway={gateway}>
          <ResetPasswordScreen link={LINK} />
          <StateProbe />
        </AuthProvider>,
      );
    });

    expect(gateway.calls.startPasswordRecovery).toEqual([OLD, CODE]);
    expect(view.getByRole('header', { name: 'Nouveau mot de passe' })).toBeTruthy();
    expect(authState?.status).toBe('recovering-password');
  });

  it('a spent code brought back by the router is never exchanged again and leads to « Se connecter »', async () => {
    // Android: the account-conflict surface tears the stack down; signing out
    // rebuilds it from the last opened URL, the recovery link already used.
    const gateway = createFakeAuthGateway();
    function Stack({ mounted }: { readonly mounted: boolean }) {
      return (
        <AuthProvider gateway={gateway}>
          {mounted && <ResetPasswordScreen link={LINK} />}
          <StateProbe />
        </AuthProvider>
      );
    }
    const view = await render(<Stack mounted />);
    await act(async () => {});
    await press(view.getByTestId('cancel-recovery'));
    expect(authState?.status).toBe('unauthenticated');
    mockReplace.mockClear();

    await act(async () => {
      view.rerender(<Stack mounted={false} />);
    });
    await act(async () => {
      view.rerender(<Stack mounted />);
    });

    expect(gateway.calls.startPasswordRecovery).toEqual([CODE]);
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    expect(view.queryByRole('header', { name: 'Lien inutilisable' })).toBeNull();
    expect(authState?.status).toBe('unauthenticated');
  });

  it('both new-password fields are hidden by default and can be shown one at a time', async () => {
    const view = await renderWithAuth(createFakeAuthGateway(), <ResetPasswordScreen link={LINK} />);

    expect(view.getByTestId('new-password-input').props.secureTextEntry).toBe(true);
    expect(view.getByTestId('confirm-password-input').props.secureTextEntry).toBe(true);
    await press(view.getByTestId('confirm-password-input-visibility'));
    expect(view.getByTestId('confirm-password-input').props.secureTextEntry).toBe(false);
    expect(view.getByTestId('new-password-input').props.secureTextEntry).toBe(true);
  });

  it('never logs the link code or the new password', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      const gateway = createFakeAuthGateway();
      const view = await renderWithAuth(gateway, <ResetPasswordScreen link={LINK} />);
      await type(view.getByTestId('new-password-input'), 'secret-password-1');
      await type(view.getByTestId('confirm-password-input'), 'secret-password-1');
      await press(view.getByTestId('submit-new-password'));

      const printed = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      expect(printed).not.toContain(CODE);
      expect(printed).not.toContain('secret-password-1');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
