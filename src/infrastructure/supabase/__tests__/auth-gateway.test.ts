import {
  AuthApiError,
  AuthPKCECodeVerifierMissingError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
} from '@supabase/supabase-js';

import appConfig from '../../../../app.json';
import {
  createSupabaseAuthGateway,
  PASSWORD_RECOVERY_PENDING_KEY,
  type RecoveryMarkerStorage,
  EMAIL_CONFIRMATION_REDIRECT_URL,
  mapSupabaseAuthError,
  PASSWORD_RECOVERY_REDIRECT_URL,
  SIGN_OUT_PENDING_KEY,
  type SupabaseAuthApi,
} from '../auth-gateway';

const session = (id: string, email: string) => ({ user: { id, email } });

/** The device storage of the marker (expo-sqlite localStorage in the app). */
function createMemoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: RecoveryMarkerStorage & { readonly items: Map<string, string> } = {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
  return storage;
}

const gatewayFor = (api: SupabaseAuthApi, storage: RecoveryMarkerStorage = createMemoryStorage()) =>
  createSupabaseAuthGateway(api, storage);

function createAuthApi(overrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}): SupabaseAuthApi {
  const listeners: ((event: string, session: unknown) => void)[] = [];
  const api = {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    signUp: jest.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signInWithPassword: jest.fn(async () => ({ data: { user: null, session: null }, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    resend: jest.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
    exchangeCodeForSession: jest.fn(async () => ({ data: { session: null, user: null }, error: null })),
    updateUser: jest.fn(async () => ({ data: { user: null }, error: null })),
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
    // The email quota and the per-user interval, and any throttled answer whose code is unknown here.
    expect(mapSupabaseAuthError(new AuthApiError('quota', 429, 'over_email_send_rate_limit'))).toEqual({
      code: 'RATE_LIMITED',
    });
    expect(mapSupabaseAuthError(new AuthApiError('later', 429, 'some_future_limit'))).toEqual({ code: 'RATE_LIMITED' });
    expect(mapSupabaseAuthError(new AuthApiError('later', 429, undefined))).toEqual({ code: 'RATE_LIMITED' });
    expect(mapSupabaseAuthError(new TypeError('Network request failed'))).toEqual({ code: 'NETWORK' });
    expect(mapSupabaseAuthError('boom')).toEqual({ code: 'UNKNOWN' });
  });
});

describe('createSupabaseAuthGateway', () => {
  it('restores a persisted session locally and reports an unvalidated one as unavailable', async () => {
    const live = gatewayFor(
      createAuthApi({ getSession: async () => ({ data: { session: session('u1', 'lea@example.com') }, error: null }) }),
    );
    expect(await live.restoreSession()).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'lea@example.com' } });

    const offline = gatewayFor(
      createAuthApi({
        getSession: async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) }),
      }),
    );
    expect(await offline.restoreSession()).toEqual({ kind: 'unavailable' });

    const dead = gatewayFor(
      createAuthApi({
        getSession: async () => ({ data: { session: null }, error: new AuthApiError('gone', 400, 'refresh_token_not_found') }),
      }),
    );
    expect(await dead.restoreSession()).toEqual({ kind: 'unauthenticated' });
  });

  it('distinguishes immediate sessions, pending confirmation, and already registered emails on sign-up', async () => {
    const immediate = gatewayFor(
      createAuthApi({ signUp: async () => ({ data: { user: { id: 'u1' }, session: session('u1', 'a@b.fr') }, error: null }) }),
    );
    expect(await immediate.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
      kind: 'authenticated',
      user: { id: 'u1', email: 'a@b.fr' },
    });

    const pending = gatewayFor(
      createAuthApi({
        signUp: async () => ({ data: { user: { id: 'u1', email: 'a@b.fr', identities: [{ id: 'i' }] }, session: null }, error: null }),
      }),
    );
    expect(await pending.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
      kind: 'confirmation-required',
      email: 'a@b.fr',
    });

    const duplicate = gatewayFor(
      createAuthApi({ signUp: async () => ({ data: { user: { id: 'u1', email: 'a@b.fr', identities: [] }, session: null }, error: null }) }),
    );
    expect(await duplicate.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
      kind: 'failed',
      failure: { code: 'EMAIL_ALREADY_REGISTERED' },
    });

    const failing = gatewayFor(
      createAuthApi({ signUp: async () => ({ data: { user: null, session: null }, error: new AuthApiError('weak', 422, 'weak_password') }) }),
    );
    expect(await failing.signUp({ email: 'a@b.fr', password: 'short' })).toEqual({ kind: 'failed', failure: { code: 'WEAK_PASSWORD' } });
  });

  it('sends the confirmation link back to the BeautIzzy app, never to the Supabase Site URL', async () => {
    expect(EMAIL_CONFIRMATION_REDIRECT_URL).toBe(`${appConfig.expo.scheme}://sign-in`);

    const api = createAuthApi();
    await gatewayFor(api).signUp({ email: 'a@b.fr', password: 'password123' });
    expect((api.signUp as jest.Mock).mock.calls[0]?.[0]).toEqual({
      email: 'a@b.fr',
      password: 'password123',
      options: { emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL },
    });
  });

  it('signs in, maps wrong credentials, resends, and forwards session changes except the initial one', async () => {
    const api = createAuthApi({
      signInWithPassword: jest
        .fn()
        .mockResolvedValueOnce({ data: { session: null }, error: new AuthApiError('bad', 400, 'invalid_credentials') })
        .mockResolvedValueOnce({ data: { session: session('u1', 'a@b.fr') }, error: null }),
    });
    const gateway = gatewayFor(api);

    expect(await gateway.signIn({ email: 'a@b.fr', password: 'x' })).toEqual({ kind: 'failed', failure: { code: 'INVALID_CREDENTIALS' } });
    expect(await gateway.signIn({ email: 'a@b.fr', password: 'y' })).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'a@b.fr' } });
    expect(await gateway.resendSignUpConfirmation('a@b.fr')).toEqual({ kind: 'sent' });
    expect((api.resend as jest.Mock).mock.calls[0]?.[0]).toEqual({
      type: 'signup',
      email: 'a@b.fr',
      options: { emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL },
    });

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
    expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('sends the recovery link back to the BeautIzzy reset screen, never to the Supabase Site URL', async () => {
    expect(PASSWORD_RECOVERY_REDIRECT_URL).toBe(`${appConfig.expo.scheme}://reset-password`);

    const api = createAuthApi();
    const gateway = gatewayFor(api);
    expect(await gateway.requestPasswordReset('a@b.fr')).toEqual({ kind: 'sent' });
    expect((api.resetPasswordForEmail as jest.Mock).mock.calls[0]).toEqual([
      'a@b.fr',
      { redirectTo: PASSWORD_RECOVERY_REDIRECT_URL },
    ]);

    const limited = gatewayFor(
      createAuthApi({
        resetPasswordForEmail: async () => ({ data: null, error: new AuthApiError('slow', 429, 'over_email_send_rate_limit') }),
      }),
    );
    expect(await limited.requestPasswordReset('a@b.fr')).toEqual({ kind: 'failed', failure: { code: 'RATE_LIMITED' } });

    // The default Supabase sender only reaches the project team: a real address is refused until custom SMTP exists.
    const unauthorized = gatewayFor(
      createAuthApi({
        resetPasswordForEmail: async () => ({
          data: null,
          error: new AuthApiError('Email address "a@b.fr" cannot be used as it is not authorized', 400, 'email_address_not_authorized'),
        }),
      }),
    );
    expect(await unauthorized.requestPasswordReset('a@b.fr')).toEqual({
      kind: 'failed',
      failure: { code: 'EMAIL_DELIVERY_UNAVAILABLE' },
    });
  });

  it('opens a recovery session from the link code, and names every way a link can fail', async () => {
    const api = createAuthApi({
      exchangeCodeForSession: jest.fn(async () => ({
        data: { session: session('u1', 'a@b.fr'), user: { id: 'u1' }, redirectType: 'recovery' },
        error: null,
      })),
    });
    expect(await gatewayFor(api).startPasswordRecovery('code-1234')).toEqual({
      kind: 'recovering',
      user: { id: 'u1', email: 'a@b.fr' },
    });
    expect(api.exchangeCodeForSession).toHaveBeenCalledWith('code-1234');

    const failingWith = async (error: Error) =>
      gatewayFor(
        createAuthApi({ exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error }) }),
      ).startPasswordRecovery('code-1234');

    // Asked from another device, before a reinstall, or already consumed here.
    expect(await failingWith(new AuthPKCECodeVerifierMissingError())).toEqual({
      kind: 'failed',
      failure: { code: 'RECOVERY_LINK_INVALID' },
    });
    expect(await failingWith(new AuthApiError('expired', 403, 'flow_state_expired'))).toEqual({
      kind: 'failed',
      failure: { code: 'RECOVERY_LINK_EXPIRED' },
    });
    expect(await failingWith(new AuthApiError('expired', 403, 'otp_expired'))).toEqual({
      kind: 'failed',
      failure: { code: 'RECOVERY_LINK_EXPIRED' },
    });
    expect(await failingWith(new AuthApiError('gone', 404, 'flow_state_not_found'))).toEqual({
      kind: 'failed',
      failure: { code: 'RECOVERY_LINK_INVALID' },
    });
    expect(await failingWith(new AuthApiError('bad', 400, 'bad_code_verifier'))).toEqual({
      kind: 'failed',
      failure: { code: 'RECOVERY_LINK_INVALID' },
    });
    expect(await failingWith(new AuthRetryableFetchError('Network request failed', 0))).toEqual({
      kind: 'failed',
      failure: { code: 'NETWORK' },
    });
  });

  it('updates the password of the recovery session, refusing the same or a weak one', async () => {
    const api = createAuthApi({ updateUser: jest.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.fr' } }, error: null })) });
    expect(await gatewayFor(api).updatePassword('password123')).toEqual({
      kind: 'updated',
      user: { id: 'u1', email: 'a@b.fr' },
    });
    expect(api.updateUser).toHaveBeenCalledWith({ password: 'password123' });

    const same = gatewayFor(
      createAuthApi({ updateUser: async () => ({ data: { user: null }, error: new AuthApiError('same', 422, 'same_password') }) }),
    );
    expect(await same.updatePassword('password123')).toEqual({ kind: 'failed', failure: { code: 'SAME_PASSWORD' } });

    const weak = gatewayFor(
      createAuthApi({ updateUser: async () => ({ data: { user: null }, error: new AuthWeakPasswordError('weak', 422, ['length']) }) }),
    );
    expect(await weak.updatePassword('password123')).toEqual({ kind: 'failed', failure: { code: 'WEAK_PASSWORD' } });
  });

  it('never reports the recovery event as a sign-in: startPasswordRecovery() owns it', () => {
    const api = createAuthApi();
    const seen: unknown[] = [];
    gatewayFor(api).onSessionChange((user) => seen.push(user));
    const emit = (api as unknown as { __emit: (event: string, value: unknown) => void }).__emit;
    emit('PASSWORD_RECOVERY', session('u1', 'a@b.fr'));
    expect(seen).toEqual([]);
    emit('USER_UPDATED', session('u1', 'a@b.fr'));
    expect(seen).toEqual([{ id: 'u1', email: 'a@b.fr' }]);
  });

  describe('sign-up confirmation under PKCE', () => {
    it('never exchanges a code nor opens a session when the address must be confirmed', async () => {
      const api = createAuthApi({
        signUp: async () => ({ data: { user: { id: 'u1', email: 'a@b.fr', identities: [{ id: 'i' }] }, session: null }, error: null }),
      });
      const gateway = gatewayFor(api);

      expect(await gateway.signUp({ email: 'a@b.fr', password: 'password123' })).toEqual({
        kind: 'confirmation-required',
        email: 'a@b.fr',
      });
      expect(await gateway.resendSignUpConfirmation('a@b.fr')).toEqual({ kind: 'sent' });
      expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
      // The owner then signs in with her password, as before PKCE.
      expect(await gateway.restoreSession()).toEqual({ kind: 'unauthenticated' });
    });

    it('discards the session of a code that is not a recovery one (a confirmation code on the reset route)', async () => {
      const storage = createMemoryStorage();
      const api = createAuthApi({
        exchangeCodeForSession: jest.fn(async () => ({
          data: { session: session('u1', 'a@b.fr'), user: { id: 'u1' }, redirectType: null },
          error: null,
        })),
      });

      expect(await gatewayFor(api, storage).startPasswordRecovery('code-1234')).toEqual({
        kind: 'failed',
        failure: { code: 'RECOVERY_LINK_INVALID' },
      });
      expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(storage.items.size).toBe(0);
    });
  });

  describe('unfinished password recovery', () => {
    const recoveringApi = (overrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}) =>
      createAuthApi({
        exchangeCodeForSession: jest.fn(async () => ({
          data: { session: session('u1', 'a@b.fr'), user: { id: 'u1' }, redirectType: 'recovery' },
          error: null,
        })),
        // Supabase persisted the recovery session: a restart finds it like any session.
        getSession: jest.fn(async () => ({ data: { session: session('u1', 'a@b.fr') }, error: null })),
        ...overrides,
      });

    it('marks the recovery pending before the exchange, and keeps no token in the marker', async () => {
      const storage = createMemoryStorage();
      const api = recoveringApi({
        exchangeCodeForSession: jest.fn(async () => {
          // Already pending while the exchange runs: an interruption here is covered.
          expect(storage.items.get(PASSWORD_RECOVERY_PENDING_KEY)).toBe('1');
          return { data: { session: session('u1', 'a@b.fr'), user: { id: 'u1' }, redirectType: 'recovery' }, error: null };
        }),
      });

      await gatewayFor(api, storage).startPasswordRecovery('code-1234');
      expect([...storage.items.entries()]).toEqual([[PASSWORD_RECOVERY_PENDING_KEY, '1']]);
    });

    it('a restart never restores the recovery session: it is signed out on this device, the app stays closed', async () => {
      const storage = createMemoryStorage();
      const api = recoveringApi();
      await gatewayFor(api, storage).startPasswordRecovery('code-1234');

      // The app is killed; a new process builds a new gateway over the same storage.
      const restarted = gatewayFor(api, storage);
      expect(await restarted.restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(api.getSession).not.toHaveBeenCalled();
      expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(storage.items.size).toBe(0);
    });

    it('offline, the unfinished recovery never falls back to the local binding, and is retried next launch', async () => {
      const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ error: new AuthRetryableFetchError('Network request failed', 0) })
        .mockResolvedValueOnce({ error: null });
      const api = recoveringApi({
        signOut,
        getSession: jest.fn(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) })),
      });

      // Not `unavailable`: that would let AuthProvider reopen the bound Business offline.
      expect(await gatewayFor(api, storage).restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(storage.items.get(PASSWORD_RECOVERY_PENDING_KEY)).toBe('1');

      expect(await gatewayFor(api, storage).restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(storage.items.size).toBe(0);
    });

    it('a token refresh or update of the recovery session is never forwarded as a sign-in; a sign-out is', async () => {
      const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
      const api = recoveringApi();
      const seen: unknown[] = [];
      gatewayFor(api, storage).onSessionChange((user) => seen.push(user));
      const emit = (api as unknown as { __emit: (event: string, value: unknown) => void }).__emit;

      emit('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
      emit('USER_UPDATED', session('u1', 'a@b.fr'));
      emit('SIGNED_IN', session('u1', 'a@b.fr'));
      expect(seen).toEqual([]);
      emit('SIGNED_OUT', null);
      expect(seen).toEqual([null]);
    });

    it('saving the new password ends the recovery: the next launch restores a normal session', async () => {
      const storage = createMemoryStorage();
      const api = recoveringApi({
        updateUser: jest.fn(async () => ({ data: { user: { id: 'u1', email: 'a@b.fr' } }, error: null })),
      });
      const gateway = gatewayFor(api, storage);
      await gateway.startPasswordRecovery('code-1234');
      expect(await gateway.updatePassword('password123')).toEqual({ kind: 'updated', user: { id: 'u1', email: 'a@b.fr' } });
      expect(storage.items.size).toBe(0);

      expect(await gatewayFor(api, storage).restoreSession()).toEqual({
        kind: 'authenticated',
        user: { id: 'u1', email: 'a@b.fr' },
      });
      expect(api.signOut).not.toHaveBeenCalled();
    });

    it('a refused password keeps the recovery pending', async () => {
      const storage = createMemoryStorage();
      const api = recoveringApi({
        updateUser: async () => ({ data: { user: null }, error: new AuthApiError('same', 422, 'same_password') }),
      });
      const gateway = gatewayFor(api, storage);
      await gateway.startPasswordRecovery('code-1234');
      await gateway.updatePassword('password123');
      expect(storage.items.get(PASSWORD_RECOVERY_PENDING_KEY)).toBe('1');
    });

    it('abandoning signs out this device only and clears the marker', async () => {
      const storage = createMemoryStorage();
      const api = recoveringApi();
      const gateway = gatewayFor(api, storage);
      await gateway.startPasswordRecovery('code-1234');
      await gateway.discardPasswordRecovery();
      expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(storage.items.size).toBe(0);
    });

    it('an expired or invalid link leaves nothing pending', async () => {
      const storage = createMemoryStorage();
      const api = recoveringApi({
        exchangeCodeForSession: async () => ({
          data: { session: null, user: null },
          error: new AuthApiError('expired', 403, 'flow_state_expired'),
        }),
      });
      expect(await gatewayFor(api, storage).startPasswordRecovery('code-1234')).toEqual({
        kind: 'failed',
        failure: { code: 'RECOVERY_LINK_EXPIRED' },
      });
      expect(storage.items.size).toBe(0);
      expect(await gatewayFor(api, storage).restoreSession()).toEqual({ kind: 'authenticated', user: { id: 'u1', email: 'a@b.fr' } });
    });

    it('a password sign-in replaces the recovery session and is a real sign-in', async () => {
      const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
      const api = recoveringApi({
        signInWithPassword: async () => ({ data: { session: session('u1', 'a@b.fr') }, error: null }),
      });
      expect(await gatewayFor(api, storage).signIn({ email: 'a@b.fr', password: 'old-password' })).toEqual({
        kind: 'authenticated',
        user: { id: 'u1', email: 'a@b.fr' },
      });
      expect(storage.items.size).toBe(0);
    });

    it('a normal sign-out ends this device only and leaves nothing pending', async () => {
      const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
      const api = recoveringApi();
      await gatewayFor(api, storage).signOut();
      expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(storage.items.size).toBe(0);
    });
  });

  describe('sign-out of this device only', () => {
    type Network = 'online' | 'offline-valid-token' | 'offline-expired-token';

    /**
     * The three outcomes of supabase-js `signOut` (auth-js 2.116 `_signOut`):
     * online it removes the stored session; offline with a VALID access token
     * it removes it and reports the failed server call; offline with an
     * EXPIRED one it cannot refresh, reports that error and KEEPS it.
     */
    function deviceApi(initial: Network, overrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}) {
      const device = {
        network: initial,
        stored: session('u1', 'a@b.fr') as ReturnType<typeof session> | null,
      };
      const api = createAuthApi({
        getSession: jest.fn(async () =>
          device.network === 'offline-expired-token'
            ? { data: { session: null }, error: new AuthRetryableFetchError('offline', 0) }
            : { data: { session: device.stored }, error: null },
        ),
        signOut: jest.fn(async () => {
          if (device.network === 'offline-expired-token' && device.stored) {
            return { error: new AuthRetryableFetchError('offline', 0) };
          }
          const hadSession = device.stored !== null;
          device.stored = null;
          return device.network === 'offline-valid-token' && hadSession
            ? { error: new AuthRetryableFetchError('offline', 0) }
            : { error: null };
        }),
        ...overrides,
      });
      return { api, device };
    }

    it('online: asks for the local scope — never the global default — and leaves nothing pending', async () => {
      const storage = createMemoryStorage();
      const { api, device } = deviceApi('online');
      await gatewayFor(api, storage).signOut();

      expect(api.signOut).toHaveBeenCalledTimes(1);
      expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(device.stored).toBeNull();
      expect(storage.items.size).toBe(0);
    });

    it('never calls signOut without an explicit local scope, whatever the path', async () => {
      const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
      const { api } = deviceApi('offline-expired-token');
      const gateway = gatewayFor(api, storage);
      await gateway.restoreSession();
      await gateway.discardPasswordRecovery();
      await gateway.signOut();
      await gateway.restoreSession();

      const calls = (api.signOut as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call).toEqual([{ scope: 'local' }]);
    });

    it('offline with a valid token: the session is gone, the next launch confirms it without asking the server for it', async () => {
      const storage = createMemoryStorage();
      const { api, device } = deviceApi('offline-valid-token');
      await gatewayFor(api, storage).signOut();
      expect(device.stored).toBeNull();
      expect(storage.items.get(SIGN_OUT_PENDING_KEY)).toBe('1');

      const relaunched = gatewayFor(api, storage);
      expect(await relaunched.restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(api.getSession).not.toHaveBeenCalled();
      expect(storage.items.size).toBe(0);
    });

    it('offline with an expired token: the stored session is never restored, even through the offline fallback', async () => {
      const storage = createMemoryStorage();
      const { api, device } = deviceApi('offline-expired-token');
      await gatewayFor(api, storage).signOut();
      // supabase-js kept it: without the marker the relaunch would answer `unavailable` (bound owner → app).
      expect(device.stored).not.toBeNull();

      const stillOffline = gatewayFor(api, storage);
      expect(await stillOffline.restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(api.getSession).not.toHaveBeenCalled();
      expect(storage.items.get(SIGN_OUT_PENDING_KEY)).toBe('1');

      device.network = 'online';
      const backOnline = gatewayFor(api, storage);
      expect(await backOnline.restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(device.stored).toBeNull();
      expect(storage.items.size).toBe(0);
      // The sign-out is complete: an ordinary launch reads the (empty) session again.
      expect(await backOnline.restoreSession()).toEqual({ kind: 'unauthenticated' });
      expect(api.getSession).toHaveBeenCalledTimes(1);
    });

    it('a token refresh of the session a sign-out could not remove never signs the device in again', async () => {
      const storage = createMemoryStorage();
      const { api } = deviceApi('offline-expired-token');
      const gateway = gatewayFor(api, storage);
      const seen: unknown[] = [];
      gateway.onSessionChange((user) => seen.push(user));
      await gateway.signOut();

      const emit = (api as unknown as { __emit: (event: string, value: unknown) => void }).__emit;
      emit('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
      emit('SIGNED_IN', session('u1', 'a@b.fr'));
      emit('USER_UPDATED', session('u1', 'a@b.fr'));
      emit('SIGNED_OUT', null);
      expect(seen).toEqual([null]);
    });

    describe('completing the pending sign-out without a restart', () => {
      /** Lets the deferred retry (setTimeout 0) and its awaits run. */
      const settle = async () => {
        for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      };
      const emitter = (api: SupabaseAuthApi) =>
        (api as unknown as { __emit: (event: string, value: unknown) => void }).__emit;

      it('network back: the refresh of the kept session is never a sign-in, and ends that session at once', async () => {
        const storage = createMemoryStorage();
        const { api, device } = deviceApi('offline-expired-token');
        const gateway = gatewayFor(api, storage);
        const seen: unknown[] = [];
        gateway.onSessionChange((user) => seen.push(user));
        await gateway.signOut();
        expect(device.stored).not.toBeNull();

        device.network = 'online';
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        expect(seen).toEqual([]);
        await settle();

        expect(device.stored).toBeNull();
        expect(storage.items.size).toBe(0);
        expect((api.signOut as jest.Mock).mock.calls).toEqual([[{ scope: 'local' }], [{ scope: 'local' }]]);
        // supabase-js then reports the removal: a sign-out, which the app already shows.
        emitter(api)('SIGNED_OUT', null);
        expect(seen).toEqual([null]);
        // Nothing left to complete: the next launch reads the (empty) session normally.
        expect(await gatewayFor(api, storage).restoreSession()).toEqual({ kind: 'unauthenticated' });
        expect(api.getSession).toHaveBeenCalledTimes(1);
      });

      it('a failed retry keeps it pending with no loop; the next refresh retries, never two sign-outs at once', async () => {
        const storage = createMemoryStorage();
        const { api, device } = deviceApi('offline-expired-token');
        const gateway = gatewayFor(api, storage);
        gateway.onSessionChange(() => undefined);
        await gateway.signOut();

        // The refresh landed, then the network dropped before the retry ran.
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        await settle();
        expect(api.signOut).toHaveBeenCalledTimes(2);
        expect(storage.items.get(SIGN_OUT_PENDING_KEY)).toBe('1');
        await settle();
        expect(api.signOut).toHaveBeenCalledTimes(2);

        device.network = 'online';
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        await settle();
        expect(api.signOut).toHaveBeenCalledTimes(3);
        expect(device.stored).toBeNull();
        expect(storage.items.size).toBe(0);
      });

      it('a launch and a refresh at the same time share one sign-out', async () => {
        const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
        let finish: (() => void) | undefined;
        const signOut = jest.fn(
          () =>
            new Promise<{ error: null }>((resolve) => {
              finish = () => resolve({ error: null });
            }),
        );
        const api = createAuthApi({ signOut });
        const gateway = gatewayFor(api, storage);
        gateway.onSessionChange(() => undefined);

        const launch = gateway.restoreSession();
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        await settle();
        expect(signOut).toHaveBeenCalledTimes(1);
        finish?.();
        expect(await launch).toEqual({ kind: 'unauthenticated' });
        expect(storage.items.size).toBe(0);
      });

      it('an explicit sign-in right after the refresh is never undone by the retry', async () => {
        const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
        const holder: { api?: SupabaseAuthApi } = {};
        const signInWithPassword = jest.fn(async () => {
          // supabase-js reports the new session before signInWithPassword returns.
          emitter(holder.api as SupabaseAuthApi)('SIGNED_IN', session('u1', 'a@b.fr'));
          return { data: { session: session('u1', 'a@b.fr') }, error: null };
        });
        const { api } = deviceApi('online', { signInWithPassword });
        holder.api = api;
        const gateway = gatewayFor(api, storage);
        const seen: unknown[] = [];
        gateway.onSessionChange((user) => seen.push(user));

        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        expect((await gateway.signIn({ email: 'a@b.fr', password: 'x' })).kind).toBe('authenticated');
        await settle();

        expect(api.signOut).not.toHaveBeenCalled();
        expect(storage.items.size).toBe(0);
        // The sign-in reported itself; the leftover-session events were never forwarded.
        expect(seen).toEqual([]);
        // From now on the session is a real one: its refreshes are forwarded again.
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        expect(seen).toEqual([{ id: 'u1', email: 'a@b.fr' }]);
      });

      it('a sign-in waits for an in-flight sign-out, so the new session is never the one removed', async () => {
        const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
        const order: string[] = [];
        let finish: (() => void) | undefined;
        const signOut = jest.fn(
          () =>
            new Promise<{ error: null }>((resolve) => {
              order.push('sign-out started');
              finish = () => {
                order.push('sign-out ended');
                resolve({ error: null });
              };
            }),
        );
        const signInWithPassword = jest.fn(async () => {
          order.push('sign-in');
          return { data: { session: session('u1', 'a@b.fr') }, error: null };
        });
        const api = createAuthApi({ signOut, signInWithPassword });
        const gateway = gatewayFor(api, storage);
        gateway.onSessionChange(() => undefined);

        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        await settle();
        const signingIn = gateway.signIn({ email: 'a@b.fr', password: 'x' });
        await settle();
        expect(signInWithPassword).not.toHaveBeenCalled();
        finish?.();
        expect((await signingIn).kind).toBe('authenticated');
        expect(order).toEqual(['sign-out started', 'sign-out ended', 'sign-in']);
        expect(storage.items.size).toBe(0);
      });

      it('an unfinished password recovery is never ended by its own refresh', async () => {
        const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
        const { api } = deviceApi('online');
        gatewayFor(api, storage).onSessionChange(() => undefined);
        emitter(api)('TOKEN_REFRESHED', session('u1', 'a@b.fr'));
        await settle();
        expect(api.signOut).not.toHaveBeenCalled();
        expect([...storage.items.keys()]).toEqual([PASSWORD_RECOVERY_PENDING_KEY]);
      });
    });

    it('a password sign-in replaces the leftover session; a failed one leaves the sign-out pending', async () => {
      const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
      const signInWithPassword = jest
        .fn()
        .mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) })
        .mockResolvedValueOnce({ data: { session: session('u2', 'b@b.fr') }, error: null });
      const { api } = deviceApi('online', { signInWithPassword });
      const gateway = gatewayFor(api, storage);

      expect((await gateway.signIn({ email: 'b@b.fr', password: 'x' })).kind).toBe('failed');
      expect(storage.items.get(SIGN_OUT_PENDING_KEY)).toBe('1');
      expect(await gateway.signIn({ email: 'b@b.fr', password: 'x' })).toEqual({
        kind: 'authenticated',
        user: { id: 'u2', email: 'b@b.fr' },
      });
      expect(storage.items.size).toBe(0);
    });

    it('a sign-up with a session, or a recovery exchange, also replaces the leftover session', async () => {
      const signUpStorage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
      const signUp = deviceApi('online', {
        signUp: async () => ({ data: { user: { id: 'u3' }, session: session('u3', 'c@b.fr') }, error: null }),
      });
      expect((await gatewayFor(signUp.api, signUpStorage).signUp({ email: 'c@b.fr', password: 'password123' })).kind).toBe(
        'authenticated',
      );
      expect(signUpStorage.items.size).toBe(0);

      const recoveryStorage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
      const recovery = deviceApi('online', {
        exchangeCodeForSession: async () => ({
          data: { session: session('u1', 'a@b.fr'), user: { id: 'u1' }, redirectType: 'recovery' },
          error: null,
        }),
      });
      expect((await gatewayFor(recovery.api, recoveryStorage).startPasswordRecovery('code-1234')).kind).toBe('recovering');
      // The recovery marker alone now governs the stored session.
      expect([...recoveryStorage.items.keys()]).toEqual([PASSWORD_RECOVERY_PENDING_KEY]);
    });

    it('a failed recovery exchange leaves the sign-out pending', async () => {
      const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
      const { api } = deviceApi('offline-expired-token', {
        exchangeCodeForSession: async () => ({
          data: { session: null, user: null },
          error: new AuthApiError('expired', 403, 'flow_state_expired'),
        }),
      });
      const gateway = gatewayFor(api, storage);
      expect((await gateway.startPasswordRecovery('code-1234')).kind).toBe('failed');
      expect([...storage.items.keys()]).toEqual([SIGN_OUT_PENDING_KEY]);
      expect(await gateway.restoreSession()).toEqual({ kind: 'unauthenticated' });
    });
  });
});
