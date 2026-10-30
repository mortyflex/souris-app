// BeautIzzy — password recovery: request, link landing, new password (behavioral)

import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { ForgotPasswordScreen } from '../ForgotPasswordScreen';
import type { RecoveryLink } from '../recovery-link';
import { ResetPasswordScreen } from '../ResetPasswordScreen';
import { AuthProvider, useAuth, type AuthState } from '../session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '../testing/fake-auth-gateway';

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

    await press(view.getByTestId('resend-reset-link'));
    expect(gateway.calls.requestPasswordReset).toEqual(['lea@example.com', 'lea@example.com']);
    expect(view.getByText('Lien renvoyé.')).toBeTruthy();

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
    expect(view.getByText('Trop de tentatives. Patientez un instant avant de réessayer.')).toBeTruthy();
    expect(view.getByTestId('email-input').props.value).toBe('lea@example.com');
    expect(view.queryByTestId('forgot-password-sent')).toBeNull();
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
