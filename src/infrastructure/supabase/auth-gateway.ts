// BeautIzzy — AuthGateway bound to Supabase Auth
//
// Translates supabase-js calls and errors into the domain-facing contract.
// Nothing here logs credentials, tokens, or session payloads.

import {
  isAuthApiError,
  isAuthPKCECodeVerifierMissingError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type User,
} from '@supabase/supabase-js';
import Constants from 'expo-constants';

import type {
  AuthCredentials,
  AuthFailure,
  AuthGateway,
  AuthUser,
  PasswordRecoveryOutcome,
  PasswordResetRequestOutcome,
  PasswordUpdateOutcome,
  ResendOutcome,
  RestoredSession,
  SignInOutcome,
  SignUpOutcome,
  SocialProvider,
  SocialSignInOutcome,
} from '@/features/auth/gateway';
import { readOAuthCallbackUrl } from '@/features/auth/oauth-callback';

import type { SourisSupabaseClient } from './client';

export type SupabaseAuthApi = Pick<
  SourisSupabaseClient['auth'],
  | 'getSession'
  | 'signUp'
  | 'signInWithPassword'
  | 'signOut'
  | 'resend'
  | 'resetPasswordForEmail'
  | 'exchangeCodeForSession'
  | 'updateUser'
  | 'onAuthStateChange'
  | 'signInWithOAuth'
  | 'signInWithIdToken'
>;

/** What the system browser returned: the redirect it was told to stop at, or nothing (closed). */
export type BrowserAuthResult = { readonly kind: 'redirect'; readonly url: string } | { readonly kind: 'closed' };

export type AppleCredentialResult =
  | {
      readonly kind: 'credential';
      readonly identityToken: string | null;
      /** Apple sends the name on the first authorization only; later ones have none. */
      readonly givenName?: string;
      readonly familyName?: string;
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed' };

/**
 * The device side of social sign-in (src/infrastructure/social-auth): the
 * system browser, the native Apple sheet and the nonce. Injected so the
 * gateway never imports a native module and tests drive every answer.
 */
export interface SocialAuthPlatform {
  openAuthSession(url: string, redirectUrl: string): Promise<BrowserAuthResult>;
  isAppleSignInAvailable(): Promise<boolean>;
  /** Presents the Apple sheet; Apple embeds `hashedNonce` in the identity token. */
  requestAppleCredential(hashedNonce: string): Promise<AppleCredentialResult>;
  /** A fresh, unpredictable one-time value. */
  createNonce(): string;
  /** Lowercase hex SHA-256, the form Supabase compares the token's nonce with. */
  sha256(value: string): Promise<string>;
}

/** The scheme of the release app (app.json). Never changes: links already sent use it. */
export const RELEASE_APP_SCHEME = 'sourisapp';

/**
 * Pure: the URL scheme the running build registered, read from its Expo config.
 * The development build (`APP_VARIANT=development`, app.config.js) declares its
 * own, `sourisapp-dev`, so a link sent to it can never open the release app
 * installed on the same phone, and the reverse. Anything unreadable is the
 * release scheme.
 */
export function resolveAppScheme(scheme: unknown): string {
  const first: unknown = Array.isArray(scheme) ? scheme[0] : scheme;
  return typeof first === 'string' && /^[a-z][a-z0-9+.-]*$/.test(first) ? first : RELEASE_APP_SCHEME;
}

const APP_SCHEME = resolveAppScheme(Constants.expoConfig?.scheme);

/**
 * Where the confirmation email link lands once Supabase verified the address:
 * the BeautIzzy app itself (the build's own scheme), on the sign-in screen. Without it
 * Supabase falls back to the project Site URL (localhost by default). The URL
 * must be allow-listed in Supabase › Authentication › URL Configuration.
 */
export const EMAIL_CONFIRMATION_REDIRECT_URL = `${APP_SCHEME}://sign-in`;

/**
 * Where the password recovery link lands once Supabase verified it: the
 * BeautIzzy reset screen, with a one-time `code` (PKCE, the client's
 * `flowType`). The code alone is worthless: the exchange needs the verifier
 * kept by the installation that asked. Must be allow-listed in Supabase ›
 * Authentication › URL Configuration, like the confirmation URL.
 */
export const PASSWORD_RECOVERY_REDIRECT_URL = `${APP_SCHEME}://reset-password`;

/**
 * Where the Google sign-in returns once Supabase verified Google's answer:
 * `<scheme>://auth-callback?code=…` (PKCE, the client's `flowType`). Its own
 * route, distinct from `sign-in` (the email confirmation landing, which never
 * exchanges anything) and `reset-password`. Must be allow-listed in Supabase ›
 * Authentication › URL Configuration, like the two others.
 */
export const OAUTH_REDIRECT_URL = `${APP_SCHEME}://auth-callback`;

const SOCIAL_PROVIDERS: ReadonlySet<string> = new Set<SocialProvider>(['google', 'apple']);
const GIVEN_NAME_MAX_LENGTH = 60;

function readString(record: unknown, key: string): string | undefined {
  if (typeof record !== 'object' || record === null) return undefined;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Google gives `full_name` / `name`; Apple's first authorization is saved as `given_name` (see signInWithApple). */
function readGivenName(metadata: unknown): string | undefined {
  const given = readString(metadata, 'given_name') ?? readString(metadata, 'full_name')?.split(/\s+/)[0] ?? readString(metadata, 'name')?.split(/\s+/)[0];
  return given !== undefined && given.length <= GIVEN_NAME_MAX_LENGTH ? given : undefined;
}

type SessionUser = Pick<User, 'id' | 'email'> & {
  readonly app_metadata?: unknown;
  readonly user_metadata?: unknown;
};

function toAuthUser(user: SessionUser): AuthUser {
  const provider = readString(user.app_metadata, 'provider');
  const createdWith = provider !== undefined && SOCIAL_PROVIDERS.has(provider) ? (provider as SocialProvider) : undefined;
  const givenName = readGivenName(user.user_metadata);
  return {
    id: user.id,
    ...(user.email ? { email: user.email } : {}),
    ...(createdWith !== undefined ? { createdWith } : {}),
    ...(givenName !== undefined ? { givenName } : {}),
  };
}

function looksLikeNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /network request failed|failed to fetch|fetch failed|load failed/i.test(error.message);
}

/** Exported for tests: the only place Supabase Auth error semantics are interpreted. */
export function mapSupabaseAuthError(error: unknown): AuthFailure {
  if (isAuthRetryableFetchError(error)) return { code: 'NETWORK' };
  if (isAuthWeakPasswordError(error)) return { code: 'WEAK_PASSWORD' };
  // No verifier on this installation: the link was asked from another device,
  // before a reinstall, or its verifier was already consumed.
  if (isAuthPKCECodeVerifierMissingError(error)) return { code: 'RECOVERY_LINK_INVALID' };
  if (isAuthApiError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return { code: 'INVALID_CREDENTIALS' };
      case 'email_not_confirmed':
        return { code: 'EMAIL_NOT_CONFIRMED' };
      case 'user_already_exists':
      case 'email_exists':
        return { code: 'EMAIL_ALREADY_REGISTERED' };
      case 'weak_password':
        return { code: 'WEAK_PASSWORD' };
      case 'same_password':
        return { code: 'SAME_PASSWORD' };
      case 'otp_expired':
      case 'flow_state_expired':
        return { code: 'RECOVERY_LINK_EXPIRED' };
      case 'flow_state_not_found':
      case 'bad_code_verifier':
        return { code: 'RECOVERY_LINK_INVALID' };
      case 'validation_failed':
      case 'email_address_invalid':
        return { code: 'INVALID_EMAIL' };
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return { code: 'RATE_LIMITED' };
      case 'email_address_not_authorized':
        return { code: 'EMAIL_DELIVERY_UNAVAILABLE' };
      default:
        // A throttled request whose code this build does not know yet.
        return error.status === 429 ? { code: 'RATE_LIMITED' } : { code: 'UNKNOWN' };
    }
  }
  if (looksLikeNetworkFailure(error)) return { code: 'NETWORK' };
  return { code: 'UNKNOWN' };
}

/**
 * Exported for tests: a Google / Apple failure. The network and throttling
 * read as usual; a provider this project has not enabled is said so; every
 * other refusal (a token, a nonce or a code Supabase could not verify) is ONE
 * calm sentence — never a password or email wording that would not apply.
 */
export function mapSocialSignInError(error: unknown): AuthFailure {
  if (isAuthApiError(error) && (error.code === 'provider_disabled' || /provider is not enabled|unsupported provider/i.test(error.message))) {
    return { code: 'PROVIDER_UNAVAILABLE' };
  }
  const mapped = mapSupabaseAuthError(error);
  return mapped.code === 'NETWORK' || mapped.code === 'RATE_LIMITED' ? mapped : { code: 'SOCIAL_SIGN_IN_FAILED' };
}

/**
 * The device storage the pending-recovery marker lives in: the same
 * `localStorage` (expo-sqlite) that persists the Supabase session, so the two
 * survive or vanish together.
 */
export interface RecoveryMarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Exported for tests. Holds no token, no email, no user id — only « a recovery is unfinished ». */
export const PASSWORD_RECOVERY_PENDING_KEY = 'beautizzy.auth.password-recovery-pending';

/**
 * Supabase persists the recovery session as soon as the link's code is
 * exchanged, exactly like a sign-in. Until the new password is saved, a
 * marker says that session is NOT a sign-in:
 *
 *   set     before the exchange (an exchange interrupted half-way is covered)
 *   cleared when the password is saved, the recovery abandoned, the exchange
 *           fails, or a real sign-in / sign-up / sign-out replaces the session
 *
 * While it is set, restoreSession() never reports the stored session (on a
 * restart the unfinished recovery is discarded: the professional asks for a
 * new link or signs in with her password), and no session event is forwarded
 * as a sign-in (a later token refresh cannot open the app either).
 */
/**
 * Exported for tests. Holds no token, no email, no user id — only « this
 * device asked to sign out and the stored session may still be there ».
 *
 * supabase-js removes the stored session on sign-out EXCEPT when it cannot
 * read it first: offline with an expired access token, the refresh fails and
 * `signOut` returns that error with the session still stored. Without this
 * marker the next launch would restore it offline (bound owner), and the
 * first token refresh once the network is back would sign the device in
 * again. While it is set the stored session is not a sign-in, exactly like a
 * pending recovery:
 *
 *   set     before the sign-out request
 *   cleared once the stored session is really gone, or a new session replaced
 *           it (password sign-in, sign-up with a session, recovery exchange)
 *
 * The sign-out is completed as soon as it can be, without waiting for a
 * restart: once the network is back supabase-js refreshes the kept session
 * (TOKEN_REFRESHED); that event is never forwarded, it retries the local
 * sign-out with the usable session (see `onSessionChange`).
 */
export const SIGN_OUT_PENDING_KEY = 'beautizzy.auth.sign-out-pending';

function createMarker(storage: RecoveryMarkerStorage, key: string) {
  return {
    isPending: () => storage.getItem(key) !== null,
    markPending: () => storage.setItem(key, '1'),
    clear: () => storage.removeItem(key),
  };
}

const SOCIAL_FAILED: SocialSignInOutcome = { kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } };
const SOCIAL_NOT_CONFIGURED: SocialSignInOutcome = { kind: 'failed', failure: { code: 'NOT_CONFIGURED' } };

export function createSupabaseAuthGateway(
  auth: SupabaseAuthApi,
  markerStorage: RecoveryMarkerStorage,
  /** Undefined (tests of the email flows, an unconfigured platform): Google and Apple are never offered. */
  social?: SocialAuthPlatform,
): AuthGateway {
  const recovery = createMarker(markerStorage, PASSWORD_RECOVERY_PENDING_KEY);
  const signOutPending = createMarker(markerStorage, SIGN_OUT_PENDING_KEY);

  /**
   * Ends ONLY this device's recovery session (scope `local`: the account's
   * other devices stay signed in). The marker is cleared only once the stored
   * session is really gone — offline with an expired token supabase-js keeps
   * it, so the next launch tries again.
   */
  const discardRecoverySession = async (): Promise<void> => {
    const { error } = await auth.signOut({ scope: 'local' });
    if (!error) recovery.clear();
  };

  /**
   * Ends ONLY this device's session. Scope `local` is explicit: the
   * supabase-js default is `global`, which revokes every refresh token of the
   * account — the professional's other phones and tablets would be signed out
   * at their next refresh. No BeautIzzy path ever asks for a global sign-out.
   *
   * An `error` does not always mean the session is still stored (offline with
   * a valid access token, supabase-js removes it and reports the failed server
   * call), but it may (offline with an expired one): the marker stays until a
   * later attempt succeeds or a new session replaces it.
   */
  const endLocalSession = async (): Promise<void> => {
    const { error } = await auth.signOut({ scope: 'local' });
    if (!error) signOutPending.clear();
  };

  /**
   * Single flight: a launch, a token refresh and the button never run two
   * sign-outs at once. A rejection is swallowed (the marker stays, a later
   * refresh or launch tries again); every retry is driven by a session event
   * or a launch, never by a timer, so a failing network cannot loop.
   */
  let signOutInFlight: Promise<void> | null = null;
  const completePendingSignOut = (): Promise<void> => {
    signOutInFlight ??= endLocalSession()
      .catch(() => undefined)
      .finally(() => {
        signOutInFlight = null;
      });
    return signOutInFlight;
  };

  /**
   * Password sign-in, sign-up and the recovery exchange each create a NEW
   * session; supabase-js reports it (SIGNED_IN…) before they return and clear
   * the marker. While one runs, a session event is never taken for the
   * leftover session, and none starts before an in-flight sign-out ended.
   */
  let sessionsBeingCreated = 0;
  const creatingSession = async <T>(create: () => Promise<T>): Promise<T> => {
    sessionsBeingCreated += 1;
    try {
      await signOutInFlight;
      return await create();
    } finally {
      sessionsBeingCreated -= 1;
    }
  };

  /**
   * Deferred out of the supabase-js callback (which runs while it notifies,
   * inside its own refresh), and re-checked when it runs: a sign-in may have
   * replaced the session in between.
   */
  const retryPendingSignOutSoon = (): void => {
    if (sessionsBeingCreated > 0) return;
    setTimeout(() => {
      if (sessionsBeingCreated === 0 && signOutPending.isPending()) void completePendingSignOut();
    }, 0);
  };

  /**
   * A Google or Apple session is a real sign-in: it replaced any recovery
   * session, or any session a sign-out could not remove — exactly like a
   * password sign-in.
   */
  const adoptSocialSession = (user: SessionUser): SocialSignInOutcome => {
    recovery.clear();
    signOutPending.clear();
    return { kind: 'authenticated', user: toAuthUser(user) };
  };

  /**
   * Each callback code is exchanged ONCE per run: the browser flow and the
   * `auth-callback` route (Android delivers the redirect to both; the router
   * may replay it) join the same exchange. Supabase consumes the code and the
   * PKCE verifier on the first try, whatever its outcome, so a retry could
   * only fail. In memory only — never persisted or logged.
   */
  const oauthExchanges = new Map<string, { readonly outcome: Promise<SocialSignInOutcome>; settled: boolean }>();
  const exchangeOAuthCode = (code: string): Promise<SocialSignInOutcome> => {
    const existing = oauthExchanges.get(code);
    // Still running: join it. Already settled (a route the router replays,
    // e.g. after a sign-out): nothing to do — never a second sign-in.
    if (existing) return existing.settled ? Promise.resolve({ kind: 'cancelled' }) : existing.outcome;
    const entry: { outcome: Promise<SocialSignInOutcome>; settled: boolean } = {
      outcome: Promise.resolve({ kind: 'cancelled' }),
      settled: false,
    };
    oauthExchanges.set(code, entry);
    entry.outcome = (async (): Promise<SocialSignInOutcome> => {
      try {
        const { data, error } = await creatingSession(() => auth.exchangeCodeForSession(code));
        if (error) return { kind: 'failed', failure: mapSocialSignInError(error) };
        if (!data.session) return SOCIAL_FAILED;
        // Only an OAuth code signs in here. A password recovery code (a
        // recovery link's code pasted on this route) has just opened a
        // recovery session: it is discarded at once, never kept as a sign-in.
        if ((data as { readonly redirectType?: string | null }).redirectType === 'recovery') {
          await auth.signOut({ scope: 'local' });
          return SOCIAL_FAILED;
        }
        return adoptSocialSession(data.session.user);
      } catch (error) {
        return { kind: 'failed', failure: mapSocialSignInError(error) };
      } finally {
        entry.settled = true;
      }
    })();
    return entry.outcome;
  };

  /**
   * Apple sends the name on the first authorization only. It is kept in the
   * account's metadata, for a later first-name suggestion — only the keys the
   * account does not have yet: an existing name is never replaced, and an
   * empty one is never written. Best effort: a failure changes nothing else.
   */
  const keepAppleName = async (user: SessionUser, givenName?: string, familyName?: string): Promise<SessionUser> => {
    if (givenName === undefined && familyName === undefined) return user;
    const known = (key: string) => readString(user.user_metadata, key) !== undefined;
    const fullName = [givenName, familyName].filter((part) => part !== undefined).join(' ');
    const missing: Record<string, string> = {};
    if (givenName !== undefined && !known('given_name')) missing.given_name = givenName;
    if (familyName !== undefined && !known('family_name')) missing.family_name = familyName;
    if (fullName.length > 0 && !known('full_name')) missing.full_name = fullName;
    if (Object.keys(missing).length === 0) return user;
    try {
      const { data, error } = await auth.updateUser({ data: missing });
      if (!error && data.user) return data.user;
    } catch {
      // Best effort: the sign-in itself succeeded.
    }
    return user;
  };

  return {
    async restoreSession(): Promise<RestoredSession> {
      // Checked BEFORE the session, so neither a stored session nor the
      // offline fallback (`unavailable` + local binding) can open the app.
      if (recovery.isPending()) {
        await discardRecoverySession();
        return { kind: 'unauthenticated' };
      }
      // A sign-out this device asked for is never undone by a restart, even
      // when supabase-js could not remove the stored session yet.
      if (signOutPending.isPending()) {
        await completePendingSignOut();
        return { kind: 'unauthenticated' };
      }
      const { data, error } = await auth.getSession();
      if (error) {
        // The persisted session could not be refreshed. Retryable = no
        // network: the session is still stored and will refresh later.
        return isAuthRetryableFetchError(error) ? { kind: 'unavailable' } : { kind: 'unauthenticated' };
      }
      return data.session
        ? { kind: 'authenticated', user: toAuthUser(data.session.user) }
        : { kind: 'unauthenticated' };
    },

    async signUp({ email, password }: AuthCredentials): Promise<SignUpOutcome> {
      const { data, error } = await creatingSession(() =>
        auth.signUp({
          email,
          password,
          options: { emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL },
        }),
      );
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (data.session) {
        recovery.clear();
        signOutPending.clear();
        return { kind: 'authenticated', user: toAuthUser(data.session.user) };
      }
      if (data.user) {
        // With "Confirm email" enabled, an already registered address returns
        // an obfuscated user with no identities instead of an error.
        if (data.user.identities !== undefined && data.user.identities.length === 0) {
          return { kind: 'failed', failure: { code: 'EMAIL_ALREADY_REGISTERED' } };
        }
        // PKCE: the confirmation link returns `sourisapp://sign-in?code=…`
        // once Supabase confirmed the address; that code is never exchanged
        // (only startPasswordRecovery exchanges, and only a recovery code), so
        // confirming never opens a session — the owner signs in.
        return { kind: 'confirmation-required', email: data.user.email ?? email };
      }
      return { kind: 'failed', failure: { code: 'UNKNOWN' } };
    },

    async signIn({ email, password }: AuthCredentials): Promise<SignInOutcome> {
      const { data, error } = await creatingSession(() => auth.signInWithPassword({ email, password }));
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (data.session) {
        // A password sign-in replaced any recovery session, or any session a
        // sign-out could not remove: it is a real one.
        recovery.clear();
        signOutPending.clear();
        return { kind: 'authenticated', user: toAuthUser(data.session.user) };
      }
      return { kind: 'failed', failure: { code: 'UNKNOWN' } };
    },

    async signOut(): Promise<void> {
      // Set first: an interruption mid-request is covered like a failure.
      signOutPending.markPending();
      recovery.clear();
      await completePendingSignOut();
    },

    async resendSignUpConfirmation(email: string): Promise<ResendOutcome> {
      const { error } = await auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL },
      });
      return error ? { kind: 'failed', failure: mapSupabaseAuthError(error) } : { kind: 'sent' };
    },

    async requestPasswordReset(email: string): Promise<PasswordResetRequestOutcome> {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo: PASSWORD_RECOVERY_REDIRECT_URL });
      return error ? { kind: 'failed', failure: mapSupabaseAuthError(error) } : { kind: 'sent' };
    },

    async startPasswordRecovery(code: string): Promise<PasswordRecoveryOutcome> {
      recovery.markPending();
      const { data, error } = await creatingSession(() => auth.exchangeCodeForSession(code));
      if (error) {
        // A failed exchange saves no session.
        recovery.clear();
        return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      }
      if (!data.session) {
        recovery.clear();
        return { kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } };
      }
      // Only a code issued for a password recovery opens a recovery. Any other
      // code (a sign-up confirmation's, pasted into this route) has just
      // produced a session: it is discarded, never kept as a sign-in.
      if ((data as { readonly redirectType?: string | null }).redirectType !== 'recovery') {
        await discardRecoverySession();
        return { kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } };
      }
      // The recovery session replaced whatever a sign-out left stored; from
      // now on the recovery marker alone decides what that session is.
      signOutPending.clear();
      return { kind: 'recovering', user: toAuthUser(data.session.user) };
    },

    async updatePassword(password: string): Promise<PasswordUpdateOutcome> {
      const { data, error } = await auth.updateUser({ password });
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (!data.user) return { kind: 'failed', failure: { code: 'UNKNOWN' } };
      // The password is saved: from now on the stored session is a sign-in.
      recovery.clear();
      return { kind: 'updated', user: toAuthUser(data.user) };
    },

    discardPasswordRecovery: discardRecoverySession,

    async signInWithGoogle(): Promise<SocialSignInOutcome> {
      if (!social) return SOCIAL_NOT_CONFIGURED;
      let url: string;
      try {
        // Built locally (no request): Supabase stores the PKCE verifier on THIS
        // installation and returns the provider URL to open.
        const { data, error } = await auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: OAUTH_REDIRECT_URL,
            skipBrowserRedirect: true,
            // Always the account chooser: a phone shared with another Google
            // account never signs the wrong one in silently.
            queryParams: { prompt: 'select_account' },
          },
        });
        if (error || !data.url) return { kind: 'failed', failure: error ? mapSocialSignInError(error) : { code: 'UNKNOWN' } };
        url = data.url;
      } catch (error) {
        return { kind: 'failed', failure: mapSocialSignInError(error) };
      }
      let result: BrowserAuthResult;
      try {
        result = await social.openAuthSession(url, OAUTH_REDIRECT_URL);
      } catch {
        return { kind: 'failed', failure: { code: 'UNKNOWN' } };
      }
      if (result.kind === 'closed') return { kind: 'cancelled' };
      const callback = readOAuthCallbackUrl(result.url, OAUTH_REDIRECT_URL);
      if (callback.kind !== 'code') return callback;
      return exchangeOAuthCode(callback.code);
    },

    completeOAuthCallback(code: string): Promise<SocialSignInOutcome> {
      return exchangeOAuthCode(code);
    },

    async isAppleSignInAvailable(): Promise<boolean> {
      return social ? social.isAppleSignInAvailable() : false;
    },

    async signInWithApple(): Promise<SocialSignInOutcome> {
      if (!social) return SOCIAL_NOT_CONFIGURED;
      // One nonce per attempt: Apple signs its hash into the identity token,
      // Supabase hashes the raw value and refuses a token that does not carry
      // it — a token captured elsewhere cannot be replayed here.
      let rawNonce: string;
      let credential: AppleCredentialResult;
      try {
        rawNonce = social.createNonce();
        credential = await social.requestAppleCredential(await social.sha256(rawNonce));
      } catch {
        return SOCIAL_FAILED;
      }
      if (credential.kind === 'cancelled') return { kind: 'cancelled' };
      if (credential.kind === 'failed' || !credential.identityToken) return SOCIAL_FAILED;
      const token = credential.identityToken;
      try {
        const { data, error } = await creatingSession(() =>
          auth.signInWithIdToken({ provider: 'apple', token, nonce: rawNonce }),
        );
        if (error) return { kind: 'failed', failure: mapSocialSignInError(error) };
        if (!data.session) return SOCIAL_FAILED;
        const outcome = adoptSocialSession(data.session.user);
        const user = await keepAppleName(data.session.user, credential.givenName, credential.familyName);
        return user === data.session.user ? outcome : adoptSocialSession(user);
      } catch (error) {
        return { kind: 'failed', failure: mapSocialSignInError(error) };
      }
    },

    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((event, session) => {
        // INITIAL_SESSION duplicates restoreSession(); PASSWORD_RECOVERY is
        // reported by startPasswordRecovery() itself. While a recovery is
        // unfinished, no session event is a sign-in (a token refresh of the
        // recovery session, its password update) — only a sign-out passes.
        if (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') return;
        if (session && recovery.isPending()) return;
        // Same after a sign-out supabase-js could not complete offline: the
        // first refresh once the network is back must not sign the device in.
        // That refresh made the kept session usable again: end it now, not at
        // the next launch.
        if (session && signOutPending.isPending()) {
          retryPendingSignOutSoon();
          return;
        }
        listener(session ? toAuthUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
