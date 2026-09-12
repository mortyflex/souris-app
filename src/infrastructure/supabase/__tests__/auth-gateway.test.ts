import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js';

import { createSupabaseAuthGateway, mapSupabaseAuthError, type SupabaseAuthApi } from '../auth-gateway';

const session = (id: string, email: string) => ({ user: { id, email } });

function createAuthApi(overrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}): SupabaseAuthApi {
  const listeners: ((event: string, session: unknown) => void)[] = [];
  const api = {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    signUp: jest.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signInWithPassword: jest.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    resend: jest.fn(async () => ({ data: {}, error: null })),
    onAuthStateChange: jest.fn((listener: (event: string, session: unknown) => void) => {
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: jest.fn(() => listeners.splice(0)) } } };
    }),
    __emit: (event: string, value: unknown) => listeners.forEach((listener) => listener(event, value)),
    ...overrides,
  };
  return api as unknown as SupabaseAuthApi;
}

describe('mapSupabaseAuthError', () => {
  it('translates Supabase errors into stable codes without leaking messages', () => {
    expect(mapSupabaseAuthError(new AuthRetryableFetchError('Network request failed', 0))).toEqual({ code: 'NETWORK' });
    expect(mapSupabaseAuthError(new AuthWeakPasswordError('weak', 422, ['length']))).toEqual({ code: 'WEAK_PASSWORD' });
    expect(mapSupabaseAuthError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toEqual({
      code: 'INVALID_CREDENTIALS',
    });
    expect(mapSupabaseAuthError(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'))).toEqual({
      code: 'EMAIL_NOT_CONFIRMED',
    });
    expect(mapSupabaseAuthError(new AuthApiError('exists', 422, 'user_already_exists'))).toEqual({
      code: 'EMAIL_ALREADY_REGISTERED',
    });
    expect(mapSupabaseAuthError(new AuthApiError('bad', 400, 'validation_failed'))).toEqual({ code: 'INVALID_EMAIL' });
    expect(mapSupabaseAuthError(new AuthApiError('slow down', 429, 'over_request_rate_limit'))).toEqual({
      code: 'RATE_LIMITED',
    });
    expect(mapSupabaseAuthError(new AuthApiError('???', 500, 'unexpected_failure'))).toEqual({ code: 'UNKNOWN' });
    expect(mapSupabaseAuthError(new TypeError('Network request failed'))).toEqual({ code: 'NETWORK' });
    expect(mapSupabaseAuthError('boom')).toEqual({ code: 'UNKNOWN' });
  });
});

describe('createSupabaseAuthGateway', () => {
  it('restores a persisted session locally and reports an unvalidated one as unavailable', async () => {
    const live = createSupabaseAuthGateway(
      createAuthApi({ getSession: async () => ({ data: { session: session('u1', 'lea@example.com') }, error: null }) }),
    );
    expect(await live.restoreSession()).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'lea@example.com' } });

    const offline = createSupabaseAuthGateway(
      createAuthApi({
        getSession: async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) }),
      }),
    );
    expect(await offline.restoreSession()).toEqual({ kind: 'unavailable' });

    const dead = createSupabaseAuthGateway(
      createAuthApi({
        getSession: async () => ({ data: { session: null }, error: new AuthApiError('gone', 400, 'refresh_token_not_found') }),
      }),
    );
    expect(await dead.restoreSession()).toEqual({ kind: 'unauthenticated' });
  });

  it('distinguishes immediate sessions, pending confirmation, and already registered emails on sign-up', async () => {
    const immediate = createSupabaseAuthGateway(
      createAuthApi({ signUp: async () => ({ data: { user: { id: 'u1' }, session: session('u1', 'a@b.fr') }, error: null }) }),
    );
    expect(await immediate.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
      kind: 'authenticated',
      user: { id: 'u1', email: 'a@b.fr' },
    });

    const pending = createSupabaseAuthGateway(
      createAuthApi({
        signUp: async () => ({ data: { user: { id: 'u1', email: 'a@b.fr', identities: [{ id: 'i' }] }, session: null }, error: null }),
      }),
    );
    expect(await pending.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
      kind: 'confirmation-required',
      email: 'a@b.fr',
    });

    const duplicate = createSupabaseAuthGateway(
      createAuthApi({ signUp: async () => ({ data: { user: { id: 'u1', email: 'a@b.fr', identities: [] }, session: null }, error: null }) }),
    );
    expect(await duplicate.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
      kind: 'failed',
      failure: { code: 'EMAIL_ALREADY_REGISTERED' },
    });

    const failing = createSupabaseAuthGateway(
      createAuthApi({ signUp: async () => ({ data: { user: null, session: null }, error: new AuthApiError('weak', 422, 'weak_password') }) }),
    );
    expect(await failing.signUp({ email: 'a@b.fr', password: 'short' })).toEqual({ kind: 'failed', failure: { code: 'WEAK_PASSWORD' } });
  });

  it('signs in, maps wrong credentials, resends, and forwards session changes except the initial one', async () => {
    const api = createAuthApi({
      signInWithPassword: jest
        .fn()
        .mockResolvedValueOnce({ data: { session: null }, error: new AuthApiError('bad', 400, 'invalid_credentials') })
        .mockResolvedValueOnce({ data: { session: session('u1', 'a@b.fr') }, error: null }),
    });
    const gateway = createSupabaseAuthGateway(api);

    expect(await gateway.signIn({ email: 'a@b.fr', password: 'x' })).toEqual({ kind: 'failed', failure: { code: 'INVALID_CREDENTIALS' } });
    expect(await gateway.signIn({ email: 'a@b.fr', password: 'y' })).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'a@b.fr' } });
    expect(await gateway.resendSignUpConfirmation('a@b.fr')).toEqual({ kind: 'sent' });
    expect((api.resend as jest.Mock).mock.calls[0]?.[0]).toEqual({ type: 'signup', email: 'a@b.fr' });

    const seen: unknown[] = [];
    const unsubscribe = gateway.onSessionChange((user) => seen.push(user));
    const emit = (api as unknown as { __emit: (event: string, value: unknown) => void }).__emit;
    emit('INITIAL_SESSION', session('u1', 'a@b.fr'));
    emit('SIGNED_IN', session('u1', 'a@b.fr'));
    emit('SIGNED_OUT', null);
    expect(seen).toEqual([{ id: 'u1', email: 'a@b.fr' }, null]);
    unsubscribe();
    emit('SIGNED_IN', session('u2', 'b@b.fr'));
    expect(seen).toHaveLength(2);

    await gateway.signOut();
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });
});
