// BeautIzzy — Google and Apple sign-in through the Supabase auth gateway
//
// Supabase Auth and the device (native Google SDK, Apple sheet, nonce) are
// both hand-rolled fakes: nothing here reaches Google, Apple or Supabase.
// These tests prove the app-side contract only; the real providers are
// validated on a device against Staging (docs/architecture/AUTH.md §4b).

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import {
  createSupabaseAuthGateway,
  mapSocialSignInError,
  PASSWORD_RECOVERY_PENDING_KEY,
  SIGN_OUT_PENDING_KEY,
  type AppleCredentialResult,
  type GoogleCredentialResult,
  type RecoveryMarkerStorage,
  type SocialAuthPlatform,
  type SupabaseAuthApi,
} from '../auth-gateway';

interface FakeUser {
  readonly id: string;
  readonly email?: string;
  readonly app_metadata?: Record<string, unknown>;
  readonly user_metadata?: Record<string, unknown>;
}

const EXISTING_EMAIL_OWNER: FakeUser = {
  id: 'user-lea',
  email: 'lea@example.com',
  // The account was created with email + password; Google was linked later by Supabase.
  app_metadata: { provider: 'email', providers: ['email', 'google'] },
  user_metadata: { full_name: 'Léa Martin' },
};

const NEW_GOOGLE_USER: FakeUser = {
  id: 'user-google-new',
  email: 'nina@gmail.com',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Nina Rossi', name: 'Nina Rossi', email_verified: true },
};

const RELAY_APPLE_USER: FakeUser = {
  id: 'user-apple-relay',
  email: 'x7k2m9q4@privaterelay.appleid.com',
  app_metadata: { provider: 'apple', providers: ['apple'] },
  user_metadata: {},
};

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

const GOOGLE_ID_TOKEN = 'google.id.token';

function createAuthApi(overrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}) {
  const api = {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(async () => ({ error: null })),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    updateUser: jest.fn(async ({ data }: { data: Record<string, string> }) => ({
      data: { user: { ...RELAY_APPLE_USER, user_metadata: { ...RELAY_APPLE_USER.user_metadata, ...data } } },
      error: null,
    })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    // The provider decides the account, as Supabase would: Google here is a new account, Apple a relay one.
    signInWithIdToken: jest.fn(async ({ provider }: { readonly provider: string }) => {
      const user = provider === 'google' ? NEW_GOOGLE_USER : RELAY_APPLE_USER;
      return { data: { session: { user }, user }, error: null };
    }),
    ...overrides,
  };
  return api;
}

function createPlatform(overrides: Partial<SocialAuthPlatform> = {}) {
  const platform = {
    requestGoogleIdToken: jest.fn(async (): Promise<GoogleCredentialResult> => ({ kind: 'credential', idToken: GOOGLE_ID_TOKEN })),
    isAppleSignInAvailable: jest.fn(async () => true),
    requestAppleCredential: jest.fn(
      async (_hashedNonce: string): Promise<AppleCredentialResult> => ({ kind: 'credential', identityToken: 'apple.id.token' }),
    ),
    createNonce: jest.fn(() => 'raw-nonce-1'),
    sha256: jest.fn(async (value: string) => `sha256(${value})`),
    ...overrides,
  };
  return platform;
}

function setup(apiOverrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}, platformOverrides: Partial<SocialAuthPlatform> = {}, storage = createMemoryStorage()) {
  const api = createAuthApi(apiOverrides);
  const platform = createPlatform(platformOverrides);
  const gateway = createSupabaseAuthGateway(api as unknown as SupabaseAuthApi, storage, platform);
  return { api, platform, gateway, storage };
}

const googleSignedIn = (user: FakeUser) =>
  jest.fn(async () => ({ data: { session: { user }, user }, error: null }));
const googleRefused = (error: Error) => jest.fn(async () => ({ data: { session: null, user: null }, error }));

describe('Continuer avec Google (native)', () => {
  it('sends the ID token of the native Google SDK to Supabase — no browser, no redirect, no code exchange', async () => {
    const { api, platform, gateway } = setup();
    await gateway.signInWithGoogle();

    expect(platform.requestGoogleIdToken).toHaveBeenCalledTimes(1);
    // The free Google API takes no nonce: none is invented (AUTH.md §4b).
    expect(api.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: GOOGLE_ID_TOKEN });
    expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a new professional: authenticated with a NEW user id, marked as created with Google, first name suggested', async () => {
    const { gateway } = setup();
    await expect(gateway.signInWithGoogle()).resolves.toEqual({
      kind: 'authenticated',
      user: { id: 'user-google-new', email: 'nina@gmail.com', createdWith: 'google', givenName: 'Nina' },
    });
  });

  it('an existing professional whose verified email Supabase linked: the SAME user id, never marked as a new social account', async () => {
    const { gateway } = setup({ signInWithIdToken: googleSignedIn(EXISTING_EMAIL_OWNER) });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({
      kind: 'authenticated',
      user: { id: 'user-lea', email: 'lea@example.com', givenName: 'Léa' },
    });
  });

  it('a closed Google chooser is a cancellation: Supabase is never called', async () => {
    const { api, gateway } = setup({}, { requestGoogleIdToken: jest.fn(async () => ({ kind: 'cancelled' }) as const) });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'cancelled' });
    expect(api.signInWithIdToken).not.toHaveBeenCalled();
  });

  it.each<[string, GoogleCredentialResult]>([
    ['a build without Google client configuration', { kind: 'not-configured' }],
    ['an Android phone without Google Play services', { kind: 'unavailable' }],
  ])('%s: « not available », never a browser fallback, never Supabase', async (_case, answer) => {
    const { api, gateway } = setup({}, { requestGoogleIdToken: jest.fn(async () => answer) });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(api.signInWithIdToken).not.toHaveBeenCalled();
    expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each<[string, () => Promise<GoogleCredentialResult>]>([
    ['a native SDK failure', async () => ({ kind: 'failed' })],
    ['a credential without ID token', async () => ({ kind: 'credential', idToken: null })],
    ['a native module that throws', () => Promise.reject(new Error('RNGoogleSignin missing'))],
  ])('%s is one calm failure, refused before Supabase', async (_case, requestGoogleIdToken) => {
    const { api, gateway } = setup({}, { requestGoogleIdToken: jest.fn(requestGoogleIdToken) });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
    expect(api.signInWithIdToken).not.toHaveBeenCalled();
  });

  describe('a token Supabase refuses', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it.each([
      ['an invalid token', new AuthApiError('Bad ID token', 400, 'bad_jwt')],
      ['an audience missing from the provider Client IDs', new AuthApiError('Unacceptable audience in id_token', 400, 'validation_failed')],
      ['a nonce the token carries but the request does not', new AuthApiError('Passed nonce and nonce in id_token should either both exist or not.', 400, 'validation_failed')],
    ])('%s: one calm failure, no session, the token never logged', async (_case, error) => {
      const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
      const { gateway } = setup({ signInWithIdToken: googleRefused(error) }, {}, storage);
      await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
      // A refused token replaced nothing: a pending sign-out stays pending.
      expect(storage.items.has(SIGN_OUT_PENDING_KEY)).toBe(true);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(GOOGLE_ID_TOKEN);
    });

    it('the network and a disabled provider keep their own wording', async () => {
      const offline = setup({ signInWithIdToken: googleRefused(new AuthRetryableFetchError('offline', 0)) });
      await expect(offline.gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'NETWORK' } });
      const disabled = setup({ signInWithIdToken: googleRefused(new AuthApiError('Provider (issuer "https://accounts.google.com") is not enabled', 400, 'provider_disabled')) });
      await expect(disabled.gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'PROVIDER_UNAVAILABLE' } });
    });
  });

  it('a Google session replaces a session a sign-out could not remove, and any unfinished recovery', async () => {
    const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1', [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
    const { gateway } = setup({}, {}, storage);
    expect((await gateway.signInWithGoogle()).kind).toBe('authenticated');
    expect(storage.items.has(SIGN_OUT_PENDING_KEY)).toBe(false);
    expect(storage.items.has(PASSWORD_RECOVERY_PENDING_KEY)).toBe(false);
  });

  it('session restoration: the next launch restores the Google session Supabase stored, same user', async () => {
    const storage = createMemoryStorage();
    const { gateway } = setup(
      { getSession: jest.fn(async () => ({ data: { session: { user: NEW_GOOGLE_USER } }, error: null })) },
      {},
      storage,
    );
    await gateway.signInWithGoogle();

    // A new launch: a new gateway over the same device storage.
    const relaunched = createSupabaseAuthGateway(
      createAuthApi({ getSession: jest.fn(async () => ({ data: { session: { user: NEW_GOOGLE_USER } }, error: null })) }) as unknown as SupabaseAuthApi,
      storage,
      createPlatform(),
    );
    await expect(relaunched.restoreSession()).resolves.toEqual({
      kind: 'authenticated',
      user: { id: 'user-google-new', email: 'nina@gmail.com', createdWith: 'google', givenName: 'Nina' },
    });
  });

  it('a sign-out after Google is never undone by a restart: no session restored, no Google request', async () => {
    const storage = createMemoryStorage();
    const { gateway, platform } = setup({ signOut: jest.fn(async () => ({ error: new AuthRetryableFetchError('offline', 0) })) }, {}, storage);
    await gateway.signInWithGoogle();
    await gateway.signOut();

    const relaunched = createSupabaseAuthGateway(
      createAuthApi({ getSession: jest.fn(async () => ({ data: { session: { user: NEW_GOOGLE_USER } }, error: null })) }) as unknown as SupabaseAuthApi,
      storage,
      createPlatform(),
    );
    await expect(relaunched.restoreSession()).resolves.toEqual({ kind: 'unauthenticated' });
    expect(platform.requestGoogleIdToken).toHaveBeenCalledTimes(1);
  });

  it('logout then login again: a NEW native request each time (the account chooser), no leftover marker', async () => {
    const storage = createMemoryStorage();
    const { api, platform, gateway } = setup({}, {}, storage);

    expect((await gateway.signInWithGoogle()).kind).toBe('authenticated');
    await gateway.signOut();
    expect((await gateway.signInWithGoogle()).kind).toBe('authenticated');

    expect(platform.requestGoogleIdToken).toHaveBeenCalledTimes(2);
    expect(api.signInWithIdToken).toHaveBeenCalledTimes(2);
    expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(storage.items.has(SIGN_OUT_PENDING_KEY)).toBe(false);
  });

  it('without a device platform (an unconfigured build) nothing is offered', async () => {
    const api = createAuthApi();
    const gateway = createSupabaseAuthGateway(api as unknown as SupabaseAuthApi, createMemoryStorage());
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'NOT_CONFIGURED' } });
    await expect(gateway.isAppleSignInAvailable()).resolves.toBe(false);
    expect(api.signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('Continuer avec Apple', () => {
  it('sends Apple the HASH of a fresh nonce and Supabase the raw nonce with the identity token', async () => {
    const { api, platform, gateway } = setup();
    await gateway.signInWithApple();

    expect(platform.requestAppleCredential).toHaveBeenCalledWith('sha256(raw-nonce-1)');
    expect(api.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple.id.token', nonce: 'raw-nonce-1' });
  });

  it('supports the private relay address: the account is its user id, marked as created with Apple', async () => {
    const { gateway } = setup();
    await expect(gateway.signInWithApple()).resolves.toEqual({
      kind: 'authenticated',
      user: { id: 'user-apple-relay', email: 'x7k2m9q4@privaterelay.appleid.com', createdWith: 'apple' },
    });
  });

  it('no name (any authorization after the first): nothing is written to the account', async () => {
    const { api, gateway } = setup();
    await gateway.signInWithApple();
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it('the first authorization keeps the name Apple gave, for a first-name suggestion', async () => {
    const { api, gateway } = setup(
      {},
      {
        requestAppleCredential: jest.fn(async () => ({
          kind: 'credential',
          identityToken: 'apple.id.token',
          givenName: 'Inès',
          familyName: 'Durand',
        }) as const),
      },
    );
    const outcome = await gateway.signInWithApple();
    expect(api.updateUser).toHaveBeenCalledWith({ data: { given_name: 'Inès', family_name: 'Durand', full_name: 'Inès Durand' } });
    expect(outcome).toMatchObject({ kind: 'authenticated', user: { id: 'user-apple-relay', givenName: 'Inès' } });
  });

  it('never overwrites a name the account already has; an empty name is never written', async () => {
    const named: FakeUser = { ...RELAY_APPLE_USER, user_metadata: { given_name: 'Sofia', full_name: 'Sofia Bianchi' } };
    const { api, gateway } = setup(
      { signInWithIdToken: jest.fn(async () => ({ data: { session: { user: named }, user: named }, error: null })) },
      { requestAppleCredential: jest.fn(async () => ({ kind: 'credential', identityToken: 'apple.id.token', givenName: 'S' }) as const) },
    );
    const outcome = await gateway.signInWithApple();
    expect(api.updateUser).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ user: { givenName: 'Sofia' } });
  });

  it('a failed name save never fails the sign-in', async () => {
    const { gateway } = setup(
      { updateUser: jest.fn(async () => ({ data: { user: null }, error: new AuthRetryableFetchError('offline', 0) })) },
      { requestAppleCredential: jest.fn(async () => ({ kind: 'credential', identityToken: 'apple.id.token', givenName: 'Inès' }) as const) },
    );
    await expect(gateway.signInWithApple()).resolves.toMatchObject({ kind: 'authenticated', user: { id: 'user-apple-relay' } });
  });

  it('a closed Apple sheet is a cancellation: Supabase is never called', async () => {
    const { api, gateway } = setup({}, { requestAppleCredential: jest.fn(async () => ({ kind: 'cancelled' }) as const) });
    await expect(gateway.signInWithApple()).resolves.toEqual({ kind: 'cancelled' });
    expect(api.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('a credential without identity token is refused before Supabase', async () => {
    const { api, gateway } = setup({}, { requestAppleCredential: jest.fn(async () => ({ kind: 'credential', identityToken: null }) as const) });
    await expect(gateway.signInWithApple()).resolves.toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
    expect(api.signInWithIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid identity token', new AuthApiError('Bad ID token', 400, 'bad_jwt')],
    ['a nonce that does not match the token', new AuthApiError('Nonces mismatch', 400, 'validation_failed')],
  ])('%s is refused by Supabase and read as one calm failure', async (_case, error) => {
    const { gateway } = setup({ signInWithIdToken: jest.fn(async () => ({ data: { session: null, user: null }, error })) });
    await expect(gateway.signInWithApple()).resolves.toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
  });

  it('each attempt uses its own nonce', async () => {
    const nonces = ['n-1', 'n-2'];
    const signInWithIdToken = jest.fn(async (_credentials: { readonly nonce: string }) => ({
      data: { session: { user: RELAY_APPLE_USER }, user: RELAY_APPLE_USER },
      error: null,
    }));
    const { gateway } = setup({ signInWithIdToken }, { createNonce: jest.fn(() => nonces.shift() ?? 'n-x') });
    await gateway.signInWithApple();
    await gateway.signInWithApple();
    expect(signInWithIdToken.mock.calls.map(([credentials]) => credentials.nonce)).toEqual(['n-1', 'n-2']);
  });

  it('an existing professional who linked Apple signs into the SAME user id', async () => {
    const { gateway } = setup({
      signInWithIdToken: jest.fn(async () => ({
        data: { session: { user: EXISTING_EMAIL_OWNER }, user: EXISTING_EMAIL_OWNER },
        error: null,
      })),
    });
    await expect(gateway.signInWithApple()).resolves.toEqual({
      kind: 'authenticated',
      user: { id: 'user-lea', email: 'lea@example.com', givenName: 'Léa' },
    });
  });

  it('a successful Apple sign-in replaces a session a sign-out could not remove', async () => {
    const storage = createMemoryStorage({ [SIGN_OUT_PENDING_KEY]: '1' });
    const { gateway } = setup({}, {}, storage);
    await gateway.signInWithApple();
    expect(storage.items.has(SIGN_OUT_PENDING_KEY)).toBe(false);
  });
});

describe('mapSocialSignInError', () => {
  it('names the network, throttling and a disabled provider; everything else is one calm failure', () => {
    expect(mapSocialSignInError(new AuthRetryableFetchError('offline', 0))).toEqual({ code: 'NETWORK' });
    expect(mapSocialSignInError(new AuthApiError('slow down', 429, 'over_request_rate_limit'))).toEqual({ code: 'RATE_LIMITED' });
    expect(mapSocialSignInError(new AuthApiError('Unsupported provider: provider is not enabled', 400, 'validation_failed'))).toEqual({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(mapSocialSignInError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toEqual({
      code: 'SOCIAL_SIGN_IN_FAILED',
    });
    expect(mapSocialSignInError(new Error('boom'))).toEqual({ code: 'SOCIAL_SIGN_IN_FAILED' });
  });
});
