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
});
