// BeautIzzy — Google and Apple sign-in through the Supabase auth gateway
//
// Supabase Auth and the device (system browser, Apple sheet, nonce) are both
// hand-rolled fakes: nothing here reaches Google, Apple or Supabase. These
// tests prove the app-side contract only; the real providers are validated on
// Staging (docs/architecture/AUTH.md §4b).

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import {
  createSupabaseAuthGateway,
  mapSocialSignInError,
  OAUTH_REDIRECT_URL,
  PASSWORD_RECOVERY_PENDING_KEY,
  SIGN_OUT_PENDING_KEY,
  type AppleCredentialResult,
  type BrowserAuthResult,
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

const GOOGLE_URL = 'https://iteufklnrsmazzvmzqxa.supabase.co/auth/v1/authorize?provider=google&code_challenge=abc';

function createAuthApi(overrides: Partial<Record<keyof SupabaseAuthApi, unknown>> = {}) {
  const api = {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(async () => ({ error: null })),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    exchangeCodeForSession: jest.fn(async (_code: string) => ({
      data: { session: { user: NEW_GOOGLE_USER }, user: NEW_GOOGLE_USER, redirectType: null },
      error: null,
    })),
    updateUser: jest.fn(async ({ data }: { data: Record<string, string> }) => ({
      data: { user: { ...RELAY_APPLE_USER, user_metadata: { ...RELAY_APPLE_USER.user_metadata, ...data } } },
      error: null,
    })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signInWithOAuth: jest.fn(async () => ({ data: { provider: 'google', url: GOOGLE_URL }, error: null })),
    signInWithIdToken: jest.fn(async () => ({
      data: { session: { user: RELAY_APPLE_USER }, user: RELAY_APPLE_USER },
      error: null,
    })),
    ...overrides,
  };
  return api;
}

const callbackUrl = (query: string) => `${OAUTH_REDIRECT_URL}${query}`;

function createPlatform(overrides: Partial<SocialAuthPlatform> = {}) {
  const platform = {
    openAuthSession: jest.fn(
      async (): Promise<BrowserAuthResult> => ({ kind: 'redirect', url: callbackUrl('?code=0b6c4f5e-1111-4a5b-9c9d-123456789abc') }),
    ),
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

const VALID_CODE = '0b6c4f5e-1111-4a5b-9c9d-123456789abc';

describe('Continuer avec Google', () => {
  it('opens Supabase OAuth in the system browser, returning to the dedicated callback route with PKCE', async () => {
    const { api, platform, gateway } = setup();
    await gateway.signInWithGoogle();

    expect(OAUTH_REDIRECT_URL).toBe('sourisapp://auth-callback');
    expect(api.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    expect(platform.openAuthSession).toHaveBeenCalledWith(GOOGLE_URL, OAUTH_REDIRECT_URL);
    expect(api.exchangeCodeForSession).toHaveBeenCalledWith(VALID_CODE);
  });

  it('a new professional: authenticated with a NEW user id, marked as created with Google, first name suggested', async () => {
    const { gateway } = setup();
    await expect(gateway.signInWithGoogle()).resolves.toEqual({
      kind: 'authenticated',
      user: { id: 'user-google-new', email: 'nina@gmail.com', createdWith: 'google', givenName: 'Nina' },
    });
  });

  it('an existing professional whose verified email Supabase linked: the SAME user id, never marked as a new social account', async () => {
    const { gateway } = setup({
      exchangeCodeForSession: jest.fn(async () => ({
        data: { session: { user: EXISTING_EMAIL_OWNER }, user: EXISTING_EMAIL_OWNER, redirectType: null },
        error: null,
      })),
    });
    const outcome = await gateway.signInWithGoogle();
    expect(outcome).toEqual({ kind: 'authenticated', user: { id: 'user-lea', email: 'lea@example.com', givenName: 'Léa' } });
  });

  it('a closed browser is a cancellation: no exchange, no failure', async () => {
    const { api, gateway } = setup({}, { openAuthSession: jest.fn(async () => ({ kind: 'closed' }) as const) });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'cancelled' });
    expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a refused consent (access_denied) is a cancellation too', async () => {
    const { api, gateway } = setup(
      {},
      { openAuthSession: jest.fn(async () => ({ kind: 'redirect', url: callbackUrl('?error=access_denied&error_description=denied') }) as const) },
    );
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'cancelled' });
    expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a network failure during the exchange reads as the network, in one calm code', async () => {
    const { gateway } = setup({
      exchangeCodeForSession: jest.fn(async () => ({ data: { session: null, user: null }, error: new AuthRetryableFetchError('offline', 0) })),
    });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'NETWORK' } });
  });

  it.each([
    ['another scheme', 'evil://auth-callback?code=0b6c4f5e-1111-4a5b-9c9d-123456789abc'],
    ['another path', 'sourisapp://auth-callbackX?code=0b6c4f5e-1111-4a5b-9c9d-123456789abc'],
    ['no code', callbackUrl('')],
    ['a malformed code', callbackUrl('?code=%3Cscript%3E')],
    ['a provider error', callbackUrl('?error=server_error&error_code=unexpected_failure')],
  ])('an invalid callback (%s) is refused before any exchange', async (_case, url) => {
    const { api, gateway } = setup({}, { openAuthSession: jest.fn(async () => ({ kind: 'redirect', url }) as const) });
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
    expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a provider not enabled on this Supabase project says so', async () => {
    const { gateway } = setup(
      {},
      { openAuthSession: jest.fn(async () => ({ kind: 'redirect', url: callbackUrl('?error=invalid_request&error_code=provider_disabled') }) as const) },
    );
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'PROVIDER_UNAVAILABLE' } });
  });

  it('the callback received twice (browser result + Android deep link) runs ONE exchange; both get its outcome', async () => {
    let finishExchange: (() => void) | undefined;
    const exchange = jest.fn(
      () =>
        new Promise((resolve) => {
          finishExchange = () =>
            resolve({ data: { session: { user: NEW_GOOGLE_USER }, user: NEW_GOOGLE_USER, redirectType: null }, error: null });
        }),
    );
    const { gateway } = setup({ exchangeCodeForSession: exchange });

    const browserFlow = gateway.signInWithGoogle();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const deepLink = gateway.completeOAuthCallback(VALID_CODE);
    finishExchange?.();

    const [fromBrowser, fromRoute] = await Promise.all([browserFlow, deepLink]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(fromBrowser.kind).toBe('authenticated');
    expect(fromRoute).toEqual(fromBrowser);
  });

  it('a code already settled (the router replaying it, e.g. after a sign-out) is nothing to do — never a second sign-in', async () => {
    const { api, gateway } = setup();
    await gateway.signInWithGoogle();
    await gateway.signOut();

    await expect(gateway.completeOAuthCallback(VALID_CODE)).resolves.toEqual({ kind: 'cancelled' });
    expect(api.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('cold start: the callback route exchanges the code alone, with the verifier this installation stored', async () => {
    const { api, gateway, platform } = setup();
    await expect(gateway.completeOAuthCallback(VALID_CODE)).resolves.toMatchObject({
      kind: 'authenticated',
      user: { id: 'user-google-new' },
    });
    expect(platform.openAuthSession).not.toHaveBeenCalled();
    expect(api.exchangeCodeForSession).toHaveBeenCalledWith(VALID_CODE);
  });

  it('a password recovery code pasted on the callback route is never a sign-in: its session is ended locally', async () => {
    const { api, gateway } = setup({
      exchangeCodeForSession: jest.fn(async () => ({
        data: { session: { user: EXISTING_EMAIL_OWNER }, user: EXISTING_EMAIL_OWNER, redirectType: 'recovery' },
        error: null,
      })),
    });
    await expect(gateway.completeOAuthCallback(VALID_CODE)).resolves.toEqual({
      kind: 'failed',
      failure: { code: 'SOCIAL_SIGN_IN_FAILED' },
    });
    expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('logout then login again: a new browser flow and a new code, and no leftover sign-out or recovery marker', async () => {
    const storage = createMemoryStorage({ [PASSWORD_RECOVERY_PENDING_KEY]: '1' });
    const codes = ['0b6c4f5e-1111-4a5b-9c9d-123456789abc', '9a9a9a9a-2222-4b4b-8c8c-abcdefabcdef'];
    const { api, gateway } = setup(
      {},
      { openAuthSession: jest.fn(async () => ({ kind: 'redirect', url: callbackUrl(`?code=${codes.shift()}`) }) as const) },
      storage,
    );

    expect((await gateway.signInWithGoogle()).kind).toBe('authenticated');
    expect(storage.items.has(PASSWORD_RECOVERY_PENDING_KEY)).toBe(false);
    await gateway.signOut();
    expect((await gateway.signInWithGoogle()).kind).toBe('authenticated');

    expect(api.exchangeCodeForSession).toHaveBeenCalledTimes(2);
    expect(storage.items.has(SIGN_OUT_PENDING_KEY)).toBe(false);
  });

  it('without a device platform (an unconfigured build) nothing is offered', async () => {
    const api = createAuthApi();
    const gateway = createSupabaseAuthGateway(api as unknown as SupabaseAuthApi, createMemoryStorage());
    await expect(gateway.signInWithGoogle()).resolves.toEqual({ kind: 'failed', failure: { code: 'NOT_CONFIGURED' } });
    await expect(gateway.isAppleSignInAvailable()).resolves.toBe(false);
    expect(api.signInWithOAuth).not.toHaveBeenCalled();
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
