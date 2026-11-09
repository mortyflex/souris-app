// BeautIzzy — Google / Apple in the session boundary: one attempt at a time,
// one entry per user, never over a signed-in session.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { AuthGateway, AuthUser, SocialSignInOutcome } from '../../gateway';
import { createFakeAuthGateway, fakeUser } from '../../testing/fake-auth-gateway';
import { AuthProvider, useAuth, type AuthSessionValue } from '../AuthProvider';

let latest: AuthSessionValue | undefined;
let renders = 0;

function Probe() {
  const value = useAuth();
  // Runs after every committed render: counts them.
  useEffect(() => {
    latest = value;
    renders += 1;
  });
  const { state } = value;
  const label = state.status === 'authenticated' ? `authenticated:${state.user.id}:${state.session}` : state.status;
  return <Text testID="auth-state">{label}</Text>;
}

async function renderAuth(gateway: AuthGateway) {
  const view = await render(
    <AuthProvider gateway={gateway}>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

const stateOf = (view: Awaited<ReturnType<typeof render>>) => view.getByTestId('auth-state').props.children;

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const newGoogleUser: AuthUser = { id: 'user-google-new', email: 'nina@gmail.com', createdWith: 'google', givenName: 'Nina' };

afterEach(() => {
  latest = undefined;
  renders = 0;
});

describe('AuthProvider — Google and Apple', () => {
  it('a successful Google sign-in enters like a password sign-in', async () => {
    const gateway = createFakeAuthGateway({ signInWithGoogle: async () => ({ kind: 'authenticated', user: newGoogleUser }) });
    const view = await renderAuth(gateway);
    await act(async () => {
      await latest?.signInWithGoogle();
    });
    expect(stateOf(view)).toBe('authenticated:user-google-new:live');
  });

  it('a cancellation or a failure changes nothing', async () => {
    const gateway = createFakeAuthGateway({
      signInWithGoogle: async () => ({ kind: 'cancelled' }),
      signInWithApple: async () => ({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } }),
    });
    const view = await renderAuth(gateway);
    await act(async () => {
      await expect(latest?.signInWithGoogle()).resolves.toEqual({ kind: 'cancelled' });
      await expect(latest?.signInWithApple()).resolves.toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
    });
    expect(stateOf(view)).toBe('unauthenticated');
  });

  it('a second tap — on either button — joins the attempt on its way: ONE provider request', async () => {
    const pending = deferred<SocialSignInOutcome>();
    const gateway = createFakeAuthGateway({ signInWithGoogle: () => pending.promise });
    await renderAuth(gateway);

    let outcomes: SocialSignInOutcome[] = [];
    await act(async () => {
      const all = Promise.all([latest!.signInWithGoogle(), latest!.signInWithGoogle(), latest!.signInWithApple()]);
      pending.resolve({ kind: 'authenticated', user: fakeUser });
      outcomes = await all;
    });
    expect(gateway.calls.signInWithGoogle).toBe(1);
    expect(gateway.calls.signInWithApple).toBe(0);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['authenticated', 'authenticated', 'authenticated']);

    // Settled: a later attempt is a new one.
    await act(async () => {
      await latest?.signOut();
    });
    await act(async () => {
      await latest?.signInWithGoogle();
    });
    expect(gateway.calls.signInWithGoogle).toBe(2);
  });

  it('the callback route joining the browser flow never enters twice: the same user keeps the same state', async () => {
    const gateway = createFakeAuthGateway({
      signInWithGoogle: async () => ({ kind: 'authenticated', user: fakeUser }),
      completeOAuthCallback: async () => ({ kind: 'authenticated', user: fakeUser }),
    });
    const view = await renderAuth(gateway);
    await act(async () => {
      await Promise.all([latest!.signInWithGoogle(), latest!.completeOAuthCallback('0b6c4f5e-1111-4a5b-9c9d-123456789abc')]);
    });
    const rendersAfterEntry = renders;
    expect(stateOf(view)).toBe('authenticated:user-lea:live');

    // The supabase-js SIGNED_IN of the same user changes nothing either.
    await act(async () => {
      await latest?.completeOAuthCallback('another-code-123456');
    });
    expect(renders).toBe(rendersAfterEntry);
  });

  it('never replaces a signed-in session: neither a button nor a callback link reaches the provider', async () => {
    const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderAuth(gateway);
    await act(async () => {
      await expect(latest?.signInWithGoogle()).resolves.toEqual({ kind: 'cancelled' });
      await expect(latest?.signInWithApple()).resolves.toEqual({ kind: 'cancelled' });
      await expect(latest?.completeOAuthCallback('0b6c4f5e-1111-4a5b-9c9d-123456789abc')).resolves.toEqual({ kind: 'cancelled' });
    });
    expect(gateway.calls.signInWithGoogle).toBe(0);
    expect(gateway.calls.signInWithApple).toBe(0);
    expect(gateway.calls.completeOAuthCallback).toEqual([]);
    expect(stateOf(view)).toBe('authenticated:user-lea:live');
  });

  it('a gateway that throws is a controlled failure', async () => {
    const gateway = createFakeAuthGateway({
      signInWithApple: () => Promise.reject(new Error('native module missing')),
    });
    await renderAuth(gateway);
    await act(async () => {
      await expect(latest?.signInWithApple()).resolves.toEqual({ kind: 'failed', failure: { code: 'UNKNOWN' } });
    });
  });

  it('logout then login again with Apple: signed out, then signed in again', async () => {
    const gateway = createFakeAuthGateway({ signInWithApple: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderAuth(gateway);
    await act(async () => {
      await latest?.signInWithApple();
    });
    await act(async () => {
      await latest?.signOut();
    });
    expect(stateOf(view)).toBe('unauthenticated');
    await act(async () => {
      await latest?.signInWithApple();
    });
    expect(stateOf(view)).toBe('authenticated:user-lea:live');
    expect(gateway.calls.signOut).toBe(1);
    expect(gateway.calls.signInWithApple).toBe(2);
  });

  it('reports whether Apple can be offered; an error reads as unavailable', async () => {
    await renderAuth(createFakeAuthGateway({ appleAvailable: true }));
    await expect(latest?.isAppleSignInAvailable()).resolves.toBe(true);
    const failing: AuthGateway = { ...createFakeAuthGateway(), isAppleSignInAvailable: () => Promise.reject(new Error('x')) };
    await renderAuth(failing);
    await expect(latest?.isAppleSignInAvailable()).resolves.toBe(false);
  });
});
