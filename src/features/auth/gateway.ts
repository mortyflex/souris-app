// BeautIzzy — Auth boundary (domain-facing)
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
  /** Password recovery: the link expired, was already used, or a newer one replaced it. */
  | 'RECOVERY_LINK_EXPIRED'
  /** Password recovery: the link cannot be used here (another device, a reinstall, a damaged link). */
  | 'RECOVERY_LINK_INVALID'
  /** Password recovery: the new password is the current one. */
  | 'SAME_PASSWORD'
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

/** Supabase answers the same way whether or not an account exists for the address. */
export type PasswordResetRequestOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

export type PasswordRecoveryOutcome =
  /** The link was valid: a recovery session exists, the new password is still to be chosen. */
  | { readonly kind: 'recovering'; readonly user: AuthUser }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

export type PasswordUpdateOutcome =
  | { readonly kind: 'updated'; readonly user: AuthUser }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

export interface AuthGateway {
  /**
   * Local restoration; must not require network for a still-valid session.
   * Never reports the session of an unfinished password recovery.
   */
  restoreSession(): Promise<RestoredSession>;
  signUp(credentials: AuthCredentials): Promise<SignUpOutcome>;
  signIn(credentials: AuthCredentials): Promise<SignInOutcome>;
  /** Clears the persisted session; never touches BeautIzzy local data. */
  signOut(): Promise<void>;
  resendSignUpConfirmation(email: string): Promise<ResendOutcome>;
  /** Emails a recovery link that returns to the app (sourisapp://reset-password). */
  requestPasswordReset(email: string): Promise<PasswordResetRequestOutcome>;
  /**
   * Exchanges the one-time code carried by the recovery link for a recovery
   * session. PKCE: the exchange only succeeds on the installation that asked.
   */
  startPasswordRecovery(code: string): Promise<PasswordRecoveryOutcome>;
  /** Sets the new password of the recovery session's account. */
  updatePassword(password: string): Promise<PasswordUpdateOutcome>;
  /**
   * Abandons an unfinished recovery: signs out THIS device's recovery session
   * only (the account's other devices stay signed in). Never touches local data.
   */
  discardPasswordRecovery(): Promise<void>;
  /** Session changes after the initial restoration; returns the cleanup function. */
  onSessionChange(listener: (user: AuthUser | null) => void): () => void;
}
