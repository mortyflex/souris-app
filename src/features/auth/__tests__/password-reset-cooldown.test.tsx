// BeautIzzy — « Renvoyer le lien »: the one-minute cooldown, the in-flight guard, rate limits (behavioral)

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { ForgotPasswordScreen } from '../ForgotPasswordScreen';
import type { PasswordResetRequestOutcome } from '../gateway';
import { AuthProvider, useAuth, type AuthSessionValue } from '../session/AuthProvider';
import { createFakeAuthGateway, type FakeAuthGateway } from '../testing/fake-auth-gateway';
import { useCooldownSeconds } from '../use-cooldown-seconds';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
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

const T0 = new Date('2026-11-04T10:00:00.000Z').getTime();
const EMAIL = 'lea@example.com';
const SENT: PasswordResetRequestOutcome = { kind: 'sent' };
const RATE_LIMITED: PasswordResetRequestOutcome = { kind: 'failed', failure: { code: 'RATE_LIMITED' } };
const NETWORK: PasswordResetRequestOutcome = { kind: 'failed', failure: { code: 'NETWORK' } };

const WAIT_MESSAGE = 'Veuillez patienter avant de demander un nouveau lien.';
const NETWORK_MESSAGE = 'Impossible d’envoyer le lien pour le moment. Vérifiez votre connexion et réessayez.';

let auth: AuthSessionValue | undefined;
function AuthProbe() {
  const value = useAuth();
  useEffect(() => {
    auth = value;
  });
  return <Text testID="auth-status">{value.state.status}</Text>;
}

const appStateListeners = new Set<(state: AppStateStatus) => void>();
let appStateSpy: jest.SpyInstance;

/** A gateway answering each request from the queue, in order; a deferred entry stays pending until settled. */
function queuedGateway(...answers: (PasswordResetRequestOutcome | Promise<PasswordResetRequestOutcome>)[]): FakeAuthGateway {
  return createFakeAuthGateway({
    requestPasswordReset: () => Promise.resolve(answers.shift() ?? SENT),
  });
}

function deferred() {
  let resolve!: (outcome: PasswordResetRequestOutcome) => void;
  const promise = new Promise<PasswordResetRequestOutcome>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function renderScreen(gateway: FakeAuthGateway, screen: React.ReactElement = <ForgotPasswordScreen initialEmail={EMAIL} />) {
  const view = await render(
    <AuthProvider gateway={gateway}>
      {screen}
      <AuthProbe />
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

/** Moves the clock AND fires the timers due: the app stays in the foreground. */
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

/** The countdown's own pending timeouts (its callback is named `tick`), apart from React's and the animations'. */
function trackCountdownTicks() {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const setSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, ms?: number) => {
    if (callback.name !== 'tick') return realSet(callback, ms);
    const id = realSet(() => {
      pending.delete(id);
      callback();
    }, ms);
    pending.add(id);
    return id;
  }) as typeof setTimeout);
  const clearSpy = jest.spyOn(globalThis, 'clearTimeout').mockImplementation((id?: Parameters<typeof clearTimeout>[0]) => {
    pending.delete(id as ReturnType<typeof setTimeout>);
    realClear(id);
  });
  return {
    pending,
    restore: () => {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    },
  };
}

/**
 * Taps landing in the same frame, before React re-renders: the press handler
 * the button was rendered with, called directly (fireEvent runs its own act).
 */
function tapRepeatedly(element: unknown, times: number) {
  let fiber = (element as { readonly unstable_fiber?: FiberLike }).unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return ?? undefined;
  const onPress = fiber?.memoizedProps?.onPress;
  if (typeof onPress !== 'function') throw new Error('No press handler');
  return act(async () => {
    for (let i = 0; i < times; i += 1) onPress();
  });
}
interface FiberLike {
  readonly memoizedProps?: { readonly onPress?: unknown } | null;
  readonly return?: FiberLike | null;
}

const isDisabled = (element: { readonly props: { readonly accessibilityState?: { readonly disabled?: boolean } } }) =>
  element.props.accessibilityState?.disabled === true;

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  auth = undefined;
  mockReplace.mockClear();
  appStateListeners.clear();
  appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.add(listener as (state: AppStateStatus) => void);
    return { remove: () => appStateListeners.delete(listener as (state: AppStateStatus) => void) };
  });
});

afterEach(() => {
  appStateSpy.mockRestore();
  jest.useRealTimers();
});

describe('the resend cooldown', () => {
  it('starts with the first sent link and counts down from the clock until the action comes back', async () => {
    const gateway = queuedGateway(SENT, SENT);
    const view = await renderScreen(gateway);

    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByTestId('forgot-password-sent')).toBeTruthy();
    const resend = () => view.getByTestId('resend-reset-link');
    expect(isDisabled(resend())).toBe(true);
    expect(view.getByText('Renvoyer le lien (60 s)')).toBeTruthy();
    expect(resend().props.accessibilityLabel).toBe('Renvoyer le lien, disponible dans 60 secondes');

    await advance(1_000);
    expect(view.getByText('Renvoyer le lien (59 s)')).toBeTruthy();

    await advance(29_000);
    expect(view.getByText('Renvoyer le lien (30 s)')).toBeTruthy();
    expect(isDisabled(resend())).toBe(true);

    await advance(29_000);
    expect(view.getByText('Renvoyer le lien (1 s)')).toBeTruthy();
    expect(resend().props.accessibilityLabel).toBe('Renvoyer le lien, disponible dans 1 seconde');
    expect(isDisabled(resend())).toBe(true);

    await advance(1_000);
    expect(view.getByText('Renvoyer le lien')).toBeTruthy();
    expect(isDisabled(resend())).toBe(false);
    expect(resend().props.accessibilityLabel).toBeUndefined();
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);

    // A successful resend restarts the full minute.
    await press(resend());
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL, EMAIL]);
    expect(view.getByText('Lien renvoyé.')).toBeTruthy();
    expect(view.getByText('Renvoyer le lien (60 s)')).toBeTruthy();
    expect(isDisabled(resend())).toBe(true);
  });

  it('never sends while the minute runs, however often the action is pressed', async () => {
    const gateway = queuedGateway(SENT);
    const view = await renderScreen(gateway);

    await press(view.getByTestId('submit-forgot-password'));
    for (const elapsed of [0, 10_000, 40_000]) {
      await advance(elapsed);
      await press(view.getByTestId('resend-reset-link'));
    }
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);
    // Even a request reaching the provider is refused there, with no network call.
    await act(async () => {
      await expect(auth?.requestPasswordReset(EMAIL)).resolves.toEqual(RATE_LIMITED);
    });
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);
  });

  it('is kept by the clock while the app is in the background', async () => {
    const view = await renderScreen(queuedGateway(SENT));
    await press(view.getByTestId('submit-forgot-password'));
    await advance(5_000);
    expect(view.getByText('Renvoyer le lien (55 s)')).toBeTruthy();

    // Backgrounded: the JS timers are suspended while 40 s pass.
    await act(async () => {
      for (const listener of appStateListeners) listener('background');
      jest.setSystemTime(T0 + 45_000);
    });
    await act(async () => {
      for (const listener of appStateListeners) listener('active');
    });
    expect(view.getByText('Renvoyer le lien (15 s)')).toBeTruthy();

    // Back after the minute: the action is available at once, never restarted.
    await act(async () => {
      jest.setSystemTime(T0 + 90_000);
      for (const listener of appStateListeners) listener('active');
    });
    expect(view.getByText('Renvoyer le lien')).toBeTruthy();
    expect(isDisabled(view.getByTestId('resend-reset-link'))).toBe(false);
  });

  it('is not bypassed by leaving the screen and coming back', async () => {
    const gateway = queuedGateway(SENT, SENT);
    const view = await renderScreen(gateway);
    await press(view.getByTestId('submit-forgot-password'));
    await advance(15_000);

    // The screen unmounts (back to sign-in) then mounts again with the same address.
    await act(async () => {
      view.rerender(
        <AuthProvider gateway={gateway}>
          <AuthProbe />
        </AuthProvider>,
      );
    });
    expect(view.queryByTestId('forgot-password-sent')).toBeNull();
    await act(async () => {
      view.rerender(
        <AuthProvider gateway={gateway}>
          <ForgotPasswordScreen initialEmail={EMAIL} key="again" />
          <AuthProbe />
        </AuthProvider>,
      );
    });
    await advance(0);

    const submit = view.getByTestId('submit-forgot-password');
    expect(view.getByText('Recevoir le lien (45 s)')).toBeTruthy();
    expect(isDisabled(submit)).toBe(true);
    await press(submit);
    // The keyboard's « Envoyer » is answered without a request.
    await act(async () => {
      fireEvent(view.getByTestId('email-input'), 'submitEditing');
    });
    expect(view.getByText(WAIT_MESSAGE)).toBeTruthy();
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);

    // Another address has no wait.
    await act(async () => {
      fireEvent.changeText(view.getByTestId('email-input'), 'other@example.com');
    });
    expect(view.getByText('Recevoir le lien')).toBeTruthy();
    expect(isDisabled(view.getByTestId('submit-forgot-password'))).toBe(false);
  });

  it('releases its timer and its foreground listener on unmount', async () => {
    // The countdown alone: the screen's animations and React schedule unrelated timers.
    const ticks = trackCountdownTicks();
    const hook = await renderHook(() => useCooldownSeconds(T0 + 60_000));
    await advance(1_500);
    expect(hook.result.current).toBe(59);
    expect(appStateListeners.size).toBe(1);
    expect(ticks.pending.size).toBe(1);

    await act(async () => {
      hook.unmount();
    });
    expect(appStateListeners.size).toBe(0);
    expect(ticks.pending.size).toBe(0);
    ticks.restore();
  });

  it('keeps one pending tick whatever the foreground events, and none once the wait is over', async () => {
    const ticks = trackCountdownTicks();
    const hook = await renderHook(() => useCooldownSeconds(T0 + 3_000));
    await act(async () => {
      for (let i = 0; i < 5; i += 1) for (const listener of appStateListeners) listener('active');
    });
    expect(ticks.pending.size).toBe(1);
    await advance(1_000);
    expect(hook.result.current).toBe(2);
    await advance(2_000);
    expect(hook.result.current).toBe(0);
    expect(ticks.pending.size).toBe(0);
    ticks.restore();
  });
});

describe('the in-flight guard', () => {
  it('sends one request for rapid taps, before React re-renders', async () => {
    const pending = deferred();
    const gateway = queuedGateway(pending.promise);
    const view = await renderScreen(gateway);

    await tapRepeatedly(view.getByTestId('submit-forgot-password'), 3);
    expect(view.getByText('Envoi…')).toBeTruthy();
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);

    await act(async () => {
      pending.resolve(SENT);
    });
    expect(view.getByTestId('forgot-password-sent')).toBeTruthy();
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);
  });

  it('lets a pending resend block every other invocation, including direct ones', async () => {
    const pending = deferred();
    const gateway = queuedGateway(SENT, pending.promise);
    const view = await renderScreen(gateway);
    await press(view.getByTestId('submit-forgot-password'));
    await advance(60_000);

    await tapRepeatedly(view.getByTestId('resend-reset-link'), 2);
    expect(view.getByText('Envoi…')).toBeTruthy();
    // A caller outside the screen joins the request on its way instead of starting another.
    let joined: Promise<PasswordResetRequestOutcome> | undefined;
    await act(async () => {
      joined = auth?.requestPasswordReset(EMAIL);
    });
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL, EMAIL]);

    await act(async () => {
      pending.resolve(SENT);
    });
    await expect(joined).resolves.toEqual(SENT);
    expect(view.getByText('Renvoyer le lien (60 s)')).toBeTruthy();
  });

  it('refuses a request during the cooldown without calling the account service', async () => {
    const gateway = queuedGateway(SENT);
    await renderScreen(gateway, <></>);

    let first: PasswordResetRequestOutcome | undefined;
    let second: PasswordResetRequestOutcome | undefined;
    await act(async () => {
      first = await auth?.requestPasswordReset(EMAIL);
    });
    await act(async () => {
      second = await auth?.requestPasswordReset(EMAIL);
    });
    expect(first).toEqual(SENT);
    expect(second).toEqual(RATE_LIMITED);
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL]);
    expect(auth?.passwordResetCooldownEndsAt(EMAIL)).toBe(T0 + 60_000);
  });
});

describe('refused requests', () => {
  it('turns a Supabase rate limit into the waiting message and the same minute, never a sent link', async () => {
    const gateway = queuedGateway(RATE_LIMITED);
    const view = await renderScreen(gateway);

    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByText(WAIT_MESSAGE)).toBeTruthy();
    expect(view.queryByTestId('forgot-password-sent')).toBeNull();
    expect(view.getByText('Recevoir le lien (60 s)')).toBeTruthy();
    expect(isDisabled(view.getByTestId('submit-forgot-password'))).toBe(true);

    await advance(60_000);
    expect(isDisabled(view.getByTestId('submit-forgot-password'))).toBe(false);
  });

  it('keeps the resend waiting after a rate limit, without claiming the link left', async () => {
    const gateway = queuedGateway(SENT, RATE_LIMITED);
    const view = await renderScreen(gateway);
    await press(view.getByTestId('submit-forgot-password'));
    await advance(60_000);

    await press(view.getByTestId('resend-reset-link'));
    expect(view.getByText(WAIT_MESSAGE)).toBeTruthy();
    expect(view.queryByText('Lien renvoyé.')).toBeNull();
    expect(view.getByText('Renvoyer le lien (60 s)')).toBeTruthy();
  });

  it('explains a network failure in French, starts no wait, and lets a retry succeed', async () => {
    const gateway = queuedGateway(SENT, NETWORK, SENT);
    const view = await renderScreen(gateway);
    await press(view.getByTestId('submit-forgot-password'));
    await advance(60_000);

    await press(view.getByTestId('resend-reset-link'));
    expect(view.getByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(view.queryByText('Lien renvoyé.')).toBeNull();
    expect(view.getByText('Renvoyer le lien')).toBeTruthy();
    expect(isDisabled(view.getByTestId('resend-reset-link'))).toBe(false);

    await press(view.getByTestId('resend-reset-link'));
    expect(view.getByText('Lien renvoyé.')).toBeTruthy();
    expect(view.getByText('Renvoyer le lien (60 s)')).toBeTruthy();
    expect(gateway.calls.requestPasswordReset).toEqual([EMAIL, EMAIL, EMAIL]);
  });

  it('never opens the sent screen after an ordinary failure of the first request', async () => {
    const gateway = queuedGateway(NETWORK, SENT);
    const view = await renderScreen(gateway);

    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(view.queryByTestId('forgot-password-sent')).toBeNull();
    expect(view.getByText('Recevoir le lien')).toBeTruthy();

    await press(view.getByTestId('submit-forgot-password'));
    expect(view.getByTestId('forgot-password-sent')).toBeTruthy();
    // Requests never touch the session.
    expect(view.getByTestId('auth-status').props.children).toBe('unauthenticated');
  });
});
