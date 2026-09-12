// Souris — Auth boundary (domain-facing)
//
// Screens and providers depend on this contract only. Production binds it to
// Supabase (src/infrastructure/supabase/auth-gateway.ts); tests bind it to
// a deterministic fake. Expected failures are returned as outcomes with a
// stable code; raw provider errors, JSON, and tokens never cross this line.

export interface AuthUser {
  readonly id: string;
  readonly email?: string;
}

export type AuthFailureCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'WEAK_PASSWORD'
  | 'INVALID_EMAIL'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export interface AuthFailure {
  readonly code: AuthFailureCode;
}

/** Thrown by a gateway for failures that are not part of an outcome (e.g. missing configuration). */
export class AuthGatewayError extends Error {
  readonly code: AuthFailureCode;

  constructor(code: AuthFailureCode, message = `Auth gateway failure: ${code}`) {
    super(message);
    this.name = 'AuthGatewayError';
    this.code = code;
  }
}

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

export type SignUpOutcome =
  | { readonly kind: 'authenticated'; readonly user: AuthUser }
  /** The account exists; Supabase requires the email link before a session is issued. */
  | { readonly kind: 'confirmation-required'; readonly email: string }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

export type SignInOutcome =
  | { readonly kind: 'authenticated'; readonly user: AuthUser }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

export type RestoredSession =
  | { readonly kind: 'authenticated'; readonly user: AuthUser }
  | { readonly kind: 'unauthenticated' }
  /** A persisted session exists but could not be validated right now (no network). */
  | { readonly kind: 'unavailable' };

export type ResendOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

export interface AuthGateway {
  /** Local restoration; must not require network for a still-valid session. */
  restoreSession(): Promise<RestoredSession>;
  signUp(credentials: AuthCredentials): Promise<SignUpOutcome>;
  signIn(credentials: AuthCredentials): Promise<SignInOutcome>;
  /** Clears the persisted session; never touches Souris local data. */
  signOut(): Promise<void>;
  resendSignUpConfirmation(email: string): Promise<ResendOutcome>;
  /** Session changes after the initial restoration; returns the cleanup function. */
  onSessionChange(listener: (user: AuthUser | null) => void): () => void;
}
