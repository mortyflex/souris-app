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
} from '@/features/auth/gateway';

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
>;

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

function toAuthUser(user: Pick<User, 'id' | 'email'>): AuthUser {
  return user.email ? { id: user.id, email: user.email } : { id: user.id };
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
        return { code: 'UNKNOWN' };
    }
  }
  if (looksLikeNetworkFailure(error)) return { code: 'NETWORK' };
  return { code: 'UNKNOWN' };
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
function createRecoveryMarker(storage: RecoveryMarkerStorage) {
  return {
    isPending: () => storage.getItem(PASSWORD_RECOVERY_PENDING_KEY) !== null,
    markPending: () => storage.setItem(PASSWORD_RECOVERY_PENDING_KEY, '1'),
    clear: () => storage.removeItem(PASSWORD_RECOVERY_PENDING_KEY),
  };
}

export function createSupabaseAuthGateway(auth: SupabaseAuthApi, markerStorage: RecoveryMarkerStorage): AuthGateway {
  const recovery = createRecoveryMarker(markerStorage);

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

  return {
    async restoreSession(): Promise<RestoredSession> {
      // Checked BEFORE the session, so neither a stored session nor the
      // offline fallback (`unavailable` + local binding) can open the app.
      if (recovery.isPending()) {
        await discardRecoverySession();
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
      const { data, error } = await auth.signUp({
        email,
        password,
        options: { emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL },
      });
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (data.session) {
        recovery.clear();
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
      const { data, error } = await auth.signInWithPassword({ email, password });
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (data.session) {
        // A password sign-in replaced any recovery session: it is a real one.
        recovery.clear();
        return { kind: 'authenticated', user: toAuthUser(data.session.user) };
      }
      return { kind: 'failed', failure: { code: 'UNKNOWN' } };
    },

    async signOut(): Promise<void> {
      // supabase-js clears the persisted session even when the server call
      // fails (offline); the returned error is therefore not a blocker.
      await auth.signOut();
      recovery.clear();
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
      const { data, error } = await auth.exchangeCodeForSession(code);
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

    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((event, session) => {
        // INITIAL_SESSION duplicates restoreSession(); PASSWORD_RECOVERY is
        // reported by startPasswordRecovery() itself. While a recovery is
        // unfinished, no session event is a sign-in (a token refresh of the
        // recovery session, its password update) — only a sign-out passes.
        if (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') return;
        if (session && recovery.isPending()) return;
        listener(session ? toAuthUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
