// Souris — AuthGateway bound to Supabase Auth
//
// Translates supabase-js calls and errors into the domain-facing contract.
// Nothing here logs credentials, tokens, or session payloads.

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type User,
} from '@supabase/supabase-js';

import type {
  AuthCredentials,
  AuthFailure,
  AuthGateway,
  AuthUser,
  ResendOutcome,
  RestoredSession,
  SignInOutcome,
  SignUpOutcome,
} from '@/features/auth/gateway';

import type { SourisSupabaseClient } from './client';

export type SupabaseAuthApi = Pick<
  SourisSupabaseClient['auth'],
  'getSession' | 'signUp' | 'signInWithPassword' | 'signOut' | 'resend' | 'onAuthStateChange'
>;

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
      case 'validation_failed':
      case 'email_address_invalid':
        return { code: 'INVALID_EMAIL' };
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return { code: 'RATE_LIMITED' };
      default:
        return { code: 'UNKNOWN' };
    }
  }
  if (looksLikeNetworkFailure(error)) return { code: 'NETWORK' };
  return { code: 'UNKNOWN' };
}

export function createSupabaseAuthGateway(auth: SupabaseAuthApi): AuthGateway {
  return {
    async restoreSession(): Promise<RestoredSession> {
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
      const { data, error } = await auth.signUp({ email, password });
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (data.session) return { kind: 'authenticated', user: toAuthUser(data.session.user) };
      if (data.user) {
        // With "Confirm email" enabled, an already registered address returns
        // an obfuscated user with no identities instead of an error.
        if (data.user.identities !== undefined && data.user.identities.length === 0) {
          return { kind: 'failed', failure: { code: 'EMAIL_ALREADY_REGISTERED' } };
        }
        return { kind: 'confirmation-required', email: data.user.email ?? email };
      }
      return { kind: 'failed', failure: { code: 'UNKNOWN' } };
    },

    async signIn({ email, password }: AuthCredentials): Promise<SignInOutcome> {
      const { data, error } = await auth.signInWithPassword({ email, password });
      if (error) return { kind: 'failed', failure: mapSupabaseAuthError(error) };
      if (data.session) return { kind: 'authenticated', user: toAuthUser(data.session.user) };
      return { kind: 'failed', failure: { code: 'UNKNOWN' } };
    },

    async signOut(): Promise<void> {
      // supabase-js clears the persisted session even when the server call
      // fails (offline); the returned error is therefore not a blocker.
      await auth.signOut();
    },

    async resendSignUpConfirmation(email: string): Promise<ResendOutcome> {
      const { error } = await auth.resend({ type: 'signup', email });
      return error ? { kind: 'failed', failure: mapSupabaseAuthError(error) } : { kind: 'sent' };
    },

    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((event, session) => {
        // INITIAL_SESSION duplicates restoreSession(); every later event is a real change.
        if (event === 'INITIAL_SESSION') return;
        listener(session ? toAuthUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
