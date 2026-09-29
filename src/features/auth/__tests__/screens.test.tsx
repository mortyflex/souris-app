// Souris — account screens (behavioral, no pixel tests)

import { act, fireEvent, render, within } from '@testing-library/react-native';

import { AuthProvider } from '../session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '../testing/fake-auth-gateway';
import { SignInScreen } from '../SignInScreen';
import { SignUpScreen } from '../SignUpScreen';
import { VerifyEmailScreen } from '../VerifyEmailScreen';
import { WelcomeScreen } from '../WelcomeScreen';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The Welcome hero floats and reacts to touch with Reanimated; tests render it at
// rest and observe which animations were started.
let mockReducedMotion = false;
const mockWithRepeat = jest.fn((value: unknown) => value);
const mockSetFrameCallbackActive = jest.fn();

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    Easing: { inOut: (fn: unknown) => fn, sin: (value: number) => value },
    cancelAnimation: () => undefined,
    // Runs the reaction on every render with the current shared values.
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown, previous: unknown) => void,
    ) => react(prepare(), null),
    useAnimatedStyle: (style: () => object) => style(),
    useEvent: () => () => undefined,
    // The physics never runs under Jest: the frame callback starts stopped and stays so.
    useFrameCallback: () => ({ setActive: mockSetFrameCallbackActive, isActive: false, callbackId: -1 }),
    useReducedMotion: () => mockReducedMotion,
    // Stable across renders, like the real hook.
    useSharedValue: (initial: unknown) => {
      const [shared] = React.useState(() => {
        const holder = {
          value: initial,
          get: () => holder.value,
          set: (next: unknown) => {
            holder.value = next;
          },
        };
        return holder;
      });
      return shared;
    },
    withRepeat: (value: unknown) => mockWithRepeat(value),
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

// Jest turns every PNG into the same placeholder module, so the approved
// floating assets are named explicitly to verify that all six are rendered.
jest.mock('../../../../assets/brand/welcome-floating/01-hairdryer.png', () => '01-hairdryer.png');
jest.mock('../../../../assets/brand/welcome-floating/02-scissors.png', () => '02-scissors.png');
jest.mock('../../../../assets/brand/welcome-floating/03-mirror.png', () => '03-mirror.png');
jest.mock('../../../../assets/brand/welcome-floating/04-brush.png', () => '04-brush.png');
jest.mock('../../../../assets/brand/welcome-floating/05-comb.png', () => '05-comb.png');
jest.mock('../../../../assets/brand/welcome-floating/06-nail-polish.png', () => '06-nail-polish.png');

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
});

describe('WelcomeScreen', () => {
  beforeEach(() => {
    mockReducedMotion = false;
    mockWithRepeat.mockClear();
    mockSetFrameCallbackActive.mockClear();
  });

  it('shows the brand lockup once and routes to sign-up or sign-in', async () => {
    const view = await render(<WelcomeScreen />);

    expect(view.getAllByLabelText('Souris')).toHaveLength(1);
    expect(view.getByRole('header', { name: 'Votre activité,\nsimplement organisée.' })).toBeTruthy();
    expect(view.getByText('Agenda, clientèle, prestations et ventes, sans logiciel compliqué.')).toBeTruthy();
    expect(view.queryByText(/sauvegard|synchronis/i)).toBeNull();

    await press(view.getByText('Commencer'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');
    await press(view.getByText('J’ai déjà un compte'));
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('floats the six approved beauty assets around the logo as pure decoration', async () => {
    const view = await render(<WelcomeScreen />);

    const motifs = view.getByTestId('welcome-motifs', { includeHiddenElements: true });
    expect(motifs.props.accessibilityElementsHidden).toBe(true);
    expect(motifs.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(motifs.props.pointerEvents).toBe('none');

    const images = view.container
      .queryAll((node) => node.type === 'Image')
      .filter((node) => String(node.props.source).includes('0'));
    expect(images.map((image) => image.props.source).sort()).toEqual([
      '01-hairdryer.png',
      '02-scissors.png',
      '03-mirror.png',
      '04-brush.png',
      '05-comb.png',
      '06-nail-polish.png',
    ]);
    for (const image of images) {
      expect(image.props.accessible).toBe(false);
      expect(image.props.resizeMode).toBe('contain');
    }
    // The only accessible brand element is still the logo.
    expect(view.getAllByLabelText('Souris')).toHaveLength(1);
  });

  it('drifts every object on its own loop, inside a hero that owns the touch field', async () => {
    const view = await render(<WelcomeScreen />);

    expect(mockWithRepeat).toHaveBeenCalledTimes(6);
    // Nothing simulates until a finger comes down: no frame callback is started at rest.
    expect(mockSetFrameCallbackActive).not.toHaveBeenCalledWith(true);
    // Copy and actions live outside the interactive hero.
    const hero = view.getByTestId('welcome-hero');
    expect(within(hero).queryByText('Commencer')).toBeNull();
    expect(within(hero).queryByRole('header')).toBeNull();
  });

  it('renders a still scene under reduced motion', async () => {
    mockReducedMotion = true;
    const view = await render(<WelcomeScreen />);

    expect(mockWithRepeat).not.toHaveBeenCalled();
    for (const kind of ['hairdryer', 'scissors', 'mirror', 'brush', 'comb', 'nailPolish']) {
      expect(view.getByTestId(`welcome-motif-${kind}`, { includeHiddenElements: true })).toBeTruthy();
    }
  });
});

describe('SignUpScreen', () => {
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
  it('shows the address, returns to sign-in, and resends with feedback', async () => {
    const gateway = createFakeAuthGateway({
      resend: jest
        .fn()
        .mockResolvedValueOnce({ kind: 'sent' })
        .mockResolvedValueOnce({ kind: 'failed', failure: { code: 'RATE_LIMITED' } }),
    });
    const view = await renderWithAuth(gateway, <VerifyEmailScreen email="new@example.com" />);

    expect(view.getByTestId('verify-email-address').props.children).toBe('new@example.com');
    expect(view.getByRole('header', { name: 'Vérifiez votre boîte mail' })).toBeTruthy();

    await press(view.getByText('Renvoyer l’email'));
    expect(gateway.calls.resend).toEqual(['new@example.com']);
    expect(view.getByText('Email renvoyé.')).toBeTruthy();

    await press(view.getByText('Renvoyer l’email'));
    expect(view.getByText('Trop de tentatives. Patientez un instant avant de réessayer.')).toBeTruthy();

    await press(view.getByTestId('back-to-sign-in'));
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });
});
