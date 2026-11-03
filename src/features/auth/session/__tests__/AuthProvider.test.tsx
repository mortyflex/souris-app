import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { AuthGateway, AuthUser } from '../../gateway';
import { createFakeAuthGateway, fakeUser } from '../../testing/fake-auth-gateway';
import { AuthProvider, useAuth, type AuthSessionValue } from '../AuthProvider';

let latest: AuthSessionValue | undefined;

function Probe() {
  const value = useAuth();
  useEffect(() => {
    latest = value;
  });
  const { state } = value;
  const label =
    state.status === 'authenticated'
      ? `authenticated:${state.user.id}:${state.session}`
      : state.status === 'error'
        ? `error:${state.failure.code}`
        : state.status === 'recovering-password'
          ? `recovering:${state.user.id}`
          : state.status;
  return <Text testID="auth-state">{label}</Text>;
}

type RenderedView = Awaited<ReturnType<typeof render>>;

async function renderAuth(gateway: AuthGateway, resolveLocalOwner?: () => AuthUser | undefined) {
  const view = await render(
    <AuthProvider gateway={gateway} resolveLocalOwner={resolveLocalOwner}>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

const stateOf = (view: RenderedView) => view.getByTestId('auth-state').props.children;

describe('AuthProvider', () => {
  afterEach(() => {
    latest = undefined;
  });

  it('starts initializing and settles to unauthenticated when nothing is stored', async () => {
    let resolve: ((value: { kind: 'unauthenticated' }) => void) | undefined;
    const gateway = createFakeAuthGateway({
      restore: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    const view = await render(
      <AuthProvider gateway={gateway}>
        <Probe />
      </AuthProvider>,
    );
    expect(stateOf(view)).toBe('initializing');

    await act(async () => resolve?.({ kind: 'unauthenticated' }));
    expect(stateOf(view)).toBe('unauthenticated');
    expect(gateway.calls.restoreSession).toBe(1);
  });

  it('restores a persisted session on restart', async () => {
    const gateway = createFakeAuthGateway({
      restore: async () => ({ kind: 'authenticated', user: fakeUser }),
    });
    const view = await renderAuth(gateway);
    expect(stateOf(view)).toBe('authenticated:user-lea:live');
  });

  it('keeps local access offline when the stored session cannot be validated but the device is bound', async () => {
    const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'unavailable' }) });
    const bound = await renderAuth(gateway, () => ({ id: 'user-lea' }));
    expect(stateOf(bound)).toBe('authenticated:user-lea:offline');

    const unbound = await renderAuth(createFakeAuthGateway({ restore: async () => ({ kind: 'unavailable' }) }));
    expect(stateOf(unbound)).toBe('error:NETWORK');
  });

  it('signs up with an immediate session, or reports the confirmation path without changing state', async () => {
    const immediate = await renderAuth(createFakeAuthGateway());
    await act(async () => {
      await expect(latest?.signUp({ email: 'lea@example.com', password: 'password123' })).resolves.toEqual({
        kind: 'authenticated',
        user: fakeUser,
      });
    });
    expect(stateOf(immediate)).toBe('authenticated:user-lea:live');

    const pending = await renderAuth(
      createFakeAuthGateway({
        signUp: async ({ email }) => ({ kind: 'confirmation-required', email }),
      }),
    );
    await act(async () => {
      await expect(latest?.signUp({ email: 'new@example.com', password: 'password123' })).resolves.toEqual({
        kind: 'confirmation-required',
        email: 'new@example.com',
      });
    });
    expect(stateOf(pending)).toBe('unauthenticated');
  });

  it('signs in, surfaces invalid credentials and network failures as codes only', async () => {
    const gateway = createFakeAuthGateway({
      signIn: async ({ password }) =>
        password === 'right'
          ? { kind: 'authenticated', user: fakeUser }
          : password === 'offline'
            ? { kind: 'failed', failure: { code: 'NETWORK' } }
            : { kind: 'failed', failure: { code: 'INVALID_CREDENTIALS' } },
    });
    const view = await renderAuth(gateway);

    await act(async () => {
      await expect(latest?.signIn({ email: 'lea@example.com', password: 'wrong' })).resolves.toEqual({
        kind: 'failed',
        failure: { code: 'INVALID_CREDENTIALS' },
      });
    });
    expect(stateOf(view)).toBe('unauthenticated');
    await act(async () => {
      await expect(latest?.signIn({ email: 'lea@example.com', password: 'offline' })).resolves.toEqual({
        kind: 'failed',
        failure: { code: 'NETWORK' },
      });
    });
    await act(async () => {
      await latest?.signIn({ email: 'lea@example.com', password: 'right' });
    });
    expect(stateOf(view)).toBe('authenticated:user-lea:live');
  });

  it('turns thrown gateway errors into a failed outcome instead of leaking them', async () => {
    const gateway = createFakeAuthGateway({
      signIn: async () => {
        throw new Error('AuthApiError: {"json":"payload"}');
      },
    });
    await renderAuth(gateway);
    await act(async () => {
      await expect(latest?.signIn({ email: 'lea@example.com', password: 'x' })).resolves.toEqual({
        kind: 'failed',
        failure: { code: 'UNKNOWN' },
      });
    });
  });

  it('follows session events from the gateway and signs out without touching local data', async () => {
    const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderAuth(gateway);

    await act(async () => {

      gateway.emitSession(null);

    });
    expect(stateOf(view)).toBe('unauthenticated');
    await act(async () => {
      gateway.emitSession({ id: 'user-lea' });
    });
    expect(stateOf(view)).toBe('authenticated:user-lea:live');

    await act(async () => {
      await latest?.signOut();
    });
    expect(gateway.calls.signOut).toBe(1);
    expect(stateOf(view)).toBe('unauthenticated');
  });

  describe('sign-out of this device', () => {
    it('a failing gateway sign-out still signs this device out and never rejects to the screen', async () => {
      const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
      gateway.signOut = jest.fn(() => Promise.reject(new Error('offline')));
      const view = await renderAuth(gateway);

      await act(async () => {
        await expect(latest?.signOut()).resolves.toBeUndefined();
      });
      expect(stateOf(view)).toBe('unauthenticated');
    });

    it('signs out then straight back in — same owner or another — and a restart restores what the gateway holds', async () => {
      let stored: AuthUser | undefined = fakeUser;
      const other: AuthUser = { id: 'user-zoe', email: 'zoe@example.com' };
      const gateway = createFakeAuthGateway({
        restore: async () => (stored ? { kind: 'authenticated', user: stored } : { kind: 'unauthenticated' }),
        signIn: async ({ email }) => {
          stored = email === other.email ? other : fakeUser;
          return { kind: 'authenticated', user: stored };
        },
      });
      const signOut = gateway.signOut;
      gateway.signOut = () => {
        stored = undefined;
        return signOut();
      };
      const view = await renderAuth(gateway);
      expect(stateOf(view)).toBe('authenticated:user-lea:live');

      await act(async () => {
        await latest?.signOut();
      });
      await act(async () => {
        await latest?.signIn({ email: 'lea@example.com', password: 'x' });
      });
      expect(stateOf(view)).toBe('authenticated:user-lea:live');

      await act(async () => {
        await latest?.signOut();
      });
      await act(async () => {
        await latest?.signIn({ email: other.email ?? '', password: 'x' });
      });
      expect(stateOf(view)).toBe('authenticated:user-zoe:live');
      expect(gateway.calls.signOut).toBe(2);
      // What a restart would restore: the last session, never the signed-out one.
      expect(await gateway.restoreSession()).toEqual({ kind: 'authenticated', user: other });
    });

    it('a session ended elsewhere (refresh refused) signs this device out without asking for another sign-out', async () => {
      const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
      const view = await renderAuth(gateway);

      await act(async () => gateway.emitSession(null));
      expect(stateOf(view)).toBe('unauthenticated');
      expect(gateway.calls.signOut).toBe(0);
    });

    it('a refresh that cannot reach the network is not a sign-out: the bound owner keeps offline access', async () => {
      const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'unavailable' }) });
      const view = await renderAuth(gateway, () => fakeUser);
      expect(stateOf(view)).toBe('authenticated:user-lea:offline');
      expect(gateway.calls.signOut).toBe(0);
    });

    it('after a sign-out, a recovery code already exchanged is never replayed; a fresh one opens the recovery', async () => {
      const gateway = createFakeAuthGateway({
        restore: async () => ({ kind: 'unauthenticated' }),
        startPasswordRecovery: async (code) =>
          code === 'code-spent'
            ? { kind: 'failed', failure: { code: 'RECOVERY_LINK_EXPIRED' } }
            : { kind: 'recovering', user: fakeUser },
      });
      const view = await renderAuth(gateway);

      await act(async () => {
        await latest?.startPasswordRecovery('code-spent');
      });
      await act(async () => {
        await latest?.signIn({ email: 'lea@example.com', password: 'x' });
      });
      await act(async () => {
        await latest?.signOut();
      });
      expect(stateOf(view)).toBe('unauthenticated');
      // The router may hand the last opened URL back after the sign-out: the screen asks first.
      expect(latest?.isRecoveryCodeUsed('code-spent')).toBe(true);
      expect(latest?.isRecoveryCodeUsed('code-fresh')).toBe(false);

      await act(async () => {
        await latest?.startPasswordRecovery('code-fresh');
      });
      expect(stateOf(view)).toBe('recovering:user-lea');
      expect(gateway.calls.startPasswordRecovery).toEqual(['code-spent', 'code-fresh']);
    });
  });

  it('reports a not-configured gateway as a recoverable error and retries', async () => {
    let attempts = 0;
    const gateway = createFakeAuthGateway({
      restore: async () => {
        attempts += 1;
        if (attempts === 1) {
          const { AuthGatewayError } = jest.requireActual('../../gateway') as typeof import('../../gateway');
          throw new AuthGatewayError('NOT_CONFIGURED');
        }
        return { kind: 'unauthenticated' };
      },
    });
    const view = await renderAuth(gateway);
    expect(stateOf(view)).toBe('error:NOT_CONFIGURED');

    await act(async () => {

      latest?.retry();

    });
    await waitFor(() => expect(stateOf(view)).toBe('unauthenticated'));
  });

  it('registers the session listener once and removes it on unmount', async () => {
    const gateway = createFakeAuthGateway();
    const view = await renderAuth(gateway);
    expect(gateway.listenerCount()).toBe(1);
    await view.rerender(
      <AuthProvider gateway={gateway}>
        <Probe />
      </AuthProvider>,
    );
    expect(gateway.listenerCount()).toBe(1);
    await view.unmount();
    expect(gateway.listenerCount()).toBe(0);
  });

  describe('password recovery', () => {
    it('opens a recovery session that is NOT a sign-in, ignoring its session events', async () => {
      const gateway = createFakeAuthGateway();
      const view = await renderAuth(gateway);

      let outcome: unknown;
      await act(async () => {
        outcome = await latest?.startPasswordRecovery('code-1234');
      });
      expect(outcome).toEqual({ kind: 'recovering', user: fakeUser });
      expect(gateway.calls.startPasswordRecovery).toEqual(['code-1234']);
      expect(stateOf(view)).toBe('recovering:user-lea');

      // A token refresh or the password update of the recovery session never signs in by itself.
      await act(async () => gateway.emitSession(fakeUser));
      expect(stateOf(view)).toBe('recovering:user-lea');
    });

    it('enters like a sign-in once the new password is saved', async () => {
      const gateway = createFakeAuthGateway();
      const view = await renderAuth(gateway);
      await act(async () => {
        await latest?.startPasswordRecovery('code-1234');
      });

      let outcome: unknown;
      await act(async () => {
        outcome = await latest?.completePasswordRecovery('password123');
      });
      expect(outcome).toEqual({ kind: 'updated', user: fakeUser });
      expect(gateway.calls.updatePassword).toEqual(['password123']);
      expect(stateOf(view)).toBe('authenticated:user-lea:live');

      // Back to normal: later session changes apply again.
      await act(async () => gateway.emitSession(null));
      expect(stateOf(view)).toBe('unauthenticated');
    });

    it('stays in recovery when the new password is refused', async () => {
      const gateway = createFakeAuthGateway({
        updatePassword: async () => ({ kind: 'failed', failure: { code: 'SAME_PASSWORD' } }),
      });
      const view = await renderAuth(gateway);
      await act(async () => {
        await latest?.startPasswordRecovery('code-1234');
      });
      await act(async () => {
        await latest?.completePasswordRecovery('password123');
      });
      expect(stateOf(view)).toBe('recovering:user-lea');
    });

    it('signs the recovery session out when the recovery is abandoned', async () => {
      const gateway = createFakeAuthGateway();
      const view = await renderAuth(gateway);
      await act(async () => {
        await latest?.startPasswordRecovery('code-1234');
      });
      await act(async () => {
        await latest?.cancelPasswordRecovery();
      });
      // This device's recovery session only: never the global sign-out of the account.
      expect(gateway.calls.discardPasswordRecovery).toBe(1);
      expect(gateway.calls.signOut).toBe(0);
      expect(stateOf(view)).toBe('unauthenticated');
    });

    it('stays signed out when the link fails', async () => {
      const gateway = createFakeAuthGateway({
        startPasswordRecovery: async () => ({ kind: 'failed', failure: { code: 'RECOVERY_LINK_EXPIRED' } }),
      });
      const view = await renderAuth(gateway);
      let outcome: unknown;
      await act(async () => {
        outcome = await latest?.startPasswordRecovery('code-1234');
      });
      expect(outcome).toEqual({ kind: 'failed', failure: { code: 'RECOVERY_LINK_EXPIRED' } });
      expect(stateOf(view)).toBe('unauthenticated');

      // A later real sign-in is not mistaken for a recovery event.
      await act(async () => gateway.emitSession(fakeUser));
      expect(stateOf(view)).toBe('authenticated:user-lea:live');
    });

    it('never replaces the session of a signed-in owner with a recovery link', async () => {
      const gateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
      const view = await renderAuth(gateway);

      let outcome: unknown;
      await act(async () => {
        outcome = await latest?.startPasswordRecovery('code-1234');
      });
      expect(outcome).toEqual({ kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } });
      expect(gateway.calls.startPasswordRecovery).toEqual([]);
      expect(stateOf(view)).toBe('authenticated:user-lea:live');
    });

    it('reports a request failure without throwing', async () => {
      const { AuthGatewayError } = jest.requireActual('../../gateway') as typeof import('../../gateway');
      const gateway = createFakeAuthGateway({ requestPasswordReset: () => Promise.reject(new AuthGatewayError('NOT_CONFIGURED')) });
      await renderAuth(gateway);
      let outcome: unknown;
      await act(async () => {
        outcome = await latest?.requestPasswordReset('lea@example.com');
      });
      expect(outcome).toEqual({ kind: 'failed', failure: { code: 'NOT_CONFIGURED' } });
    });
  });
});
