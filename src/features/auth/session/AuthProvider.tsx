// BeautIzzy — Auth session boundary
//
// Answers ONE question: who is signed in? The state machine:
//
//   initializing → restoreSession()
//                    ├─ authenticated (live)      persisted session valid
//                    ├─ unauthenticated           nothing stored
//                    ├─ authenticated (offline)   stored session could not be
//                    │                            validated (no network) AND the
//                    │                            device is bound to that owner
//                    └─ error                     not configured / no network
//                                                 without a local binding / unknown
//
//   unauthenticated → startPasswordRecovery(code) → recovering-password
//                       ├─ completePasswordRecovery  → authenticated (live)
//                       └─ cancelPasswordRecovery    → unauthenticated
//
// A recovery session is NOT a sign-in: while the new password is not chosen,
// nothing downstream (Business resolution, sync, access) sees an
// authenticated user, and session events of that recovery session are
// ignored. A signed-in session is never replaced by a recovery link. The
// gateway persists that rule across restarts: an unfinished recovery is never
// restored as a session (auth-gateway.ts, the pending-recovery marker).
// A recovery code is single-use: the provider remembers, in memory only, the
// codes already handed to the exchange, so a link the router replays (its
// stack rebuilt from the last opened URL) is never exchanged twice.
//
// Password recovery emails go out one request at a time, and never during
// the cooldown that follows a sent link or a rate-limit refusal
// (password-reset-cooldown.ts): the waiting request is refused here, before
// any network call, whatever the screen shows.
//
// Google and Apple (docs/architecture/AUTH.md §4b), both native, run one at a
// time: a second tap joins the attempt on its way. Their session enters like
// a password sign-in, once per user — the supabase-js SIGNED_IN event of the
// same user never produces a second entry. Whether the account is new
// (Business setup) or existing (its Business) is decided downstream by the
// authenticated user id, never by the email.
//
// Business resolution is a separate provider (BusinessSessionProvider). No
// raw provider error, token, or session payload ever reaches the UI: the
// gateway returns outcomes with stable codes. The session listener is
// registered once per gateway and cleaned up on unmount.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  AuthGatewayError,
  type AuthCredentials,
  type AuthFailure,
  type AuthGateway,
  type AuthUser,
  type PasswordRecoveryOutcome,
  type PasswordResetRequestOutcome,
  type PasswordUpdateOutcome,
  type ResendOutcome,
  type SignInOutcome,
  type SignUpOutcome,
  type SocialSignInOutcome,
} from '../gateway';
import { createPasswordResetCooldown, type PasswordResetCooldown } from '../password-reset-cooldown';

export type AuthState =
  | { readonly status: 'initializing' }
  | { readonly status: 'unauthenticated' }
  | {
      readonly status: 'authenticated';
      readonly user: AuthUser;
      /** `offline`: restored from the local account binding while the stored session waits for network. */
      readonly session: 'live' | 'offline';
    }
  /** A valid recovery link opened a session; the new password is still to be chosen. */
  | { readonly status: 'recovering-password'; readonly user: AuthUser }
  | { readonly status: 'error'; readonly failure: AuthFailure };

export interface AuthSessionValue {
  readonly state: AuthState;
  readonly signUp: (credentials: AuthCredentials) => Promise<SignUpOutcome>;
  readonly signIn: (credentials: AuthCredentials) => Promise<SignInOutcome>;
  readonly signOut: () => Promise<void>;
  readonly resendSignUpConfirmation: (email: string) => Promise<ResendOutcome>;
  /**
   * Single flight per address; refused locally (RATE_LIMITED, no request)
   * while its cooldown runs. A sent link or a rate-limit refusal (re)starts it.
   */
  readonly requestPasswordReset: (email: string) => Promise<PasswordResetRequestOutcome>;
  /** The expiry instant (ms) of this normalized address's resend cooldown, undefined when none runs. */
  readonly passwordResetCooldownEndsAt: (email: string) => number | undefined;
  /** Opens the recovery session of a recovery link's code; refused while signed in. */
  readonly startPasswordRecovery: (code: string) => Promise<PasswordRecoveryOutcome>;
  /** True when this code was already handed to the exchange since the app started (memory only). */
  readonly isRecoveryCodeUsed: (code: string) => boolean;
  /** Saves the new password, then enters like a sign-in. */
  readonly completePasswordRecovery: (password: string) => Promise<PasswordUpdateOutcome>;
  /** Abandons the recovery: the recovery session is signed out, nothing else changes. */
  readonly cancelPasswordRecovery: () => Promise<void>;
  /** Native Google Sign-In. Single flight with Apple; refused while signed in. */
  readonly signInWithGoogle: () => Promise<SocialSignInOutcome>;
  /** Native Sign in with Apple (iOS). Single flight with Google; refused while signed in. */
  readonly signInWithApple: () => Promise<SocialSignInOutcome>;
  /** Whether Sign in with Apple can be offered on this device. */
  readonly isAppleSignInAvailable: () => Promise<boolean>;
  /** Re-runs session restoration after an error. */
  readonly retry: () => void;
}

const AuthContext = createContext<AuthSessionValue | null>(null);

interface AuthProviderProps {
  readonly gateway: AuthGateway;
  /**
   * The owner recorded by the local account binding, used only when the
   * stored session cannot be validated offline. Undefined = unbound device.
   */
  readonly resolveLocalOwner?: () => AuthUser | undefined;
  /** Where the resend cooldown lives; in memory (survives navigation, not a restart) when omitted. */
  readonly passwordResetCooldown?: PasswordResetCooldown;
}

const NOTHING_TO_DO: SocialSignInOutcome = { kind: 'cancelled' };

const RATE_LIMITED: PasswordResetRequestOutcome = { kind: 'failed', failure: { code: 'RATE_LIMITED' } };

function toFailure(error: unknown): AuthFailure {
  return error instanceof AuthGatewayError ? { code: error.code } : { code: 'UNKNOWN' };
}

export function AuthProvider({
  gateway,
  resolveLocalOwner,
  passwordResetCooldown,
  children,
}: PropsWithChildren<AuthProviderProps>) {
  const [state, setState] = useState<AuthState>({ status: 'initializing' });
  const [cooldown] = useState(() => passwordResetCooldown ?? createPasswordResetCooldown({ scope: 'memory' }));
  /** The password reset request on its way, if any: a synchronous guard, never React state. */
  const resetInFlight = useRef<{ readonly email: string; outcome: Promise<PasswordResetRequestOutcome> } | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  /** True from the start of a recovery exchange until the password is saved or the recovery abandoned. */
  const recovering = useRef(false);
  /** The recovery codes already handed to the exchange: in memory, never persisted or logged. */
  const usedRecoveryCodes = useRef(new Set<string>());
  const resolveLocalOwnerRef = useRef(resolveLocalOwner);
  const restoreGeneration = useRef(0);
  useEffect(() => {
    resolveLocalOwnerRef.current = resolveLocalOwner;
  }, [resolveLocalOwner]);

  /** Resolves the persisted session; the caller decides the transitional state. */
  const restore = useCallback(async () => {
    restoreGeneration.current += 1;
    const generation = restoreGeneration.current;
    let next: AuthState;
    try {
      const restored = await gateway.restoreSession();
      if (restored.kind === 'authenticated') {
        next = { status: 'authenticated', user: restored.user, session: 'live' };
      } else if (restored.kind === 'unauthenticated') {
        next = { status: 'unauthenticated' };
      } else {
        const owner = resolveLocalOwnerRef.current?.();
        next = owner
          ? { status: 'authenticated', user: owner, session: 'offline' }
          : { status: 'error', failure: { code: 'NETWORK' } };
      }
    } catch (error) {
      next = { status: 'error', failure: toFailure(error) };
    }
    if (generation === restoreGeneration.current) setState(next);
  }, [gateway]);

  useEffect(() => {
    void restore();
    return () => {
      // Invalidate in-flight restorations for this gateway.
      restoreGeneration.current += 1;
    };
  }, [restore]);

  useEffect(
    () =>
      gateway.onSessionChange((user) => {
        // The recovery session refreshing or being updated is not a sign-in.
        if (user && recovering.current) return;
        recovering.current = false;
        setState(user ? { status: 'authenticated', user, session: 'live' } : { status: 'unauthenticated' });
      }),
    [gateway],
  );

  const signUp = useCallback(
    async (credentials: AuthCredentials): Promise<SignUpOutcome> => {
      let outcome: SignUpOutcome;
      try {
        outcome = await gateway.signUp(credentials);
      } catch (error) {
        return { kind: 'failed', failure: toFailure(error) };
      }
      if (outcome.kind === 'authenticated') {
        recovering.current = false;
        setState({ status: 'authenticated', user: outcome.user, session: 'live' });
      }
      return outcome;
    },
    [gateway],
  );

  const signIn = useCallback(
    async (credentials: AuthCredentials): Promise<SignInOutcome> => {
      let outcome: SignInOutcome;
      try {
        outcome = await gateway.signIn(credentials);
      } catch (error) {
        return { kind: 'failed', failure: toFailure(error) };
      }
      if (outcome.kind === 'authenticated') {
        recovering.current = false;
        setState({ status: 'authenticated', user: outcome.user, session: 'live' });
      }
      return outcome;
    },
    [gateway],
  );

  const signOut = useCallback(async () => {
    try {
      // THIS device only: the account's other devices stay signed in.
      await gateway.signOut();
    } catch {
      // Never surfaced: every caller fires and forgets. The gateway keeps a
      // sign-out it could not complete pending, so no restart undoes it.
    } finally {
      // Signed out on this device either way; local business data stays.
      restoreGeneration.current += 1;
      recovering.current = false;
      setState({ status: 'unauthenticated' });
    }
  }, [gateway]);

  const resendSignUpConfirmation = useCallback(
    async (email: string): Promise<ResendOutcome> => {
      try {
        return await gateway.resendSignUpConfirmation(email);
      } catch (error) {
        return { kind: 'failed', failure: toFailure(error) };
      }
    },
    [gateway],
  );

  const requestPasswordReset = useCallback(
    (email: string): Promise<PasswordResetRequestOutcome> => {
      const pending = resetInFlight.current;
      // A second tap joins the request on its way; it never starts another.
      if (pending) return pending.email === email ? pending.outcome : Promise.resolve(RATE_LIMITED);
      if (cooldown.endsAt(email, Date.now()) !== undefined) return Promise.resolve(RATE_LIMITED);

      // Registered before the gateway is called: even a synchronous throw
      // cannot leave a stale guard behind.
      const flight: { readonly email: string; outcome: Promise<PasswordResetRequestOutcome> } = {
        email,
        outcome: Promise.resolve(RATE_LIMITED),
      };
      resetInFlight.current = flight;
      flight.outcome = (async (): Promise<PasswordResetRequestOutcome> => {
        let result: PasswordResetRequestOutcome;
        try {
          result = await gateway.requestPasswordReset(email);
        } catch (error) {
          result = { kind: 'failed', failure: toFailure(error) };
        }
        // Supabase refuses another email to this address for a minute after
        // one left, and exposes no reliable retry delay: the same wait after
        // a rate-limit refusal. An ordinary failure (network…) starts none.
        if (result.kind === 'sent' || result.failure.code === 'RATE_LIMITED') cooldown.start(email, Date.now());
        if (resetInFlight.current === flight) resetInFlight.current = null;
        return result;
      })();
      return flight.outcome;
    },
    [gateway, cooldown],
  );

  const passwordResetCooldownEndsAt = useCallback(
    (email: string) => cooldown.endsAt(email, Date.now()),
    [cooldown],
  );

  const startPasswordRecovery = useCallback(
    async (code: string): Promise<PasswordRecoveryOutcome> => {
      // A recovery link never replaces the session of a signed-in owner.
      if (stateRef.current.status === 'authenticated') {
        return { kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } };
      }
      // Spent from now on, whatever the outcome: the exchange consumes it.
      usedRecoveryCodes.current.add(code);
      recovering.current = true;
      let outcome: PasswordRecoveryOutcome;
      try {
        outcome = await gateway.startPasswordRecovery(code);
      } catch (error) {
        outcome = { kind: 'failed', failure: toFailure(error) };
      }
      if (outcome.kind === 'recovering') {
        restoreGeneration.current += 1;
        setState({ status: 'recovering-password', user: outcome.user });
      } else {
        recovering.current = false;
      }
      return outcome;
    },
    [gateway],
  );

  const isRecoveryCodeUsed = useCallback((code: string) => usedRecoveryCodes.current.has(code), []);

  const completePasswordRecovery = useCallback(
    async (password: string): Promise<PasswordUpdateOutcome> => {
      let outcome: PasswordUpdateOutcome;
      try {
        outcome = await gateway.updatePassword(password);
      } catch (error) {
        return { kind: 'failed', failure: toFailure(error) };
      }
      if (outcome.kind === 'updated') {
        recovering.current = false;
        setState({ status: 'authenticated', user: outcome.user, session: 'live' });
      }
      return outcome;
    },
    [gateway],
  );

  const cancelPasswordRecovery = useCallback(async () => {
    try {
      // This device's recovery session only — never the global sign-out.
      await gateway.discardPasswordRecovery();
    } finally {
      restoreGeneration.current += 1;
      recovering.current = false;
      setState({ status: 'unauthenticated' });
    }
  }, [gateway]);

  /** The social attempt on its way, if any: a synchronous guard, never React state. */
  const socialInFlight = useRef<Promise<SocialSignInOutcome> | null>(null);

  /**
   * Enters a Google / Apple session like a password sign-in — once per user:
   * the same user arriving again (the supabase-js SIGNED_IN event) keeps the
   * state as it is.
   */
  const enterSocialSession = useCallback((user: AuthUser) => {
    restoreGeneration.current += 1;
    recovering.current = false;
    setState((current) =>
      current.status === 'authenticated' && current.session === 'live' && current.user.id === user.id
        ? current
        : { status: 'authenticated', user, session: 'live' },
    );
  }, []);

  const settleSocial = useCallback(
    async (attempt: () => Promise<SocialSignInOutcome>): Promise<SocialSignInOutcome> => {
      let outcome: SocialSignInOutcome;
      try {
        outcome = await attempt();
      } catch (error) {
        outcome = { kind: 'failed', failure: toFailure(error) };
      }
      if (outcome.kind === 'authenticated') enterSocialSession(outcome.user);
      return outcome;
    },
    [enterSocialSession],
  );

  const runSocialSignIn = useCallback(
    (attempt: () => Promise<SocialSignInOutcome>): Promise<SocialSignInOutcome> => {
      // A second tap — on either button — joins the attempt on its way.
      if (socialInFlight.current) return socialInFlight.current;
      if (stateRef.current.status === 'authenticated') return Promise.resolve(NOTHING_TO_DO);
      const flight = settleSocial(attempt).finally(() => {
        if (socialInFlight.current === flight) socialInFlight.current = null;
      });
      socialInFlight.current = flight;
      return flight;
    },
    [settleSocial],
  );

  const signInWithGoogle = useCallback(() => runSocialSignIn(() => gateway.signInWithGoogle()), [gateway, runSocialSignIn]);
  const signInWithApple = useCallback(() => runSocialSignIn(() => gateway.signInWithApple()), [gateway, runSocialSignIn]);
  const isAppleSignInAvailable = useCallback(async () => {
    try {
      return await gateway.isAppleSignInAvailable();
    } catch {
      return false;
    }
  }, [gateway]);

  const retry = useCallback(() => {
    setState({ status: 'initializing' });
    void restore();
  }, [restore]);

  return (
    <AuthContext.Provider
      value={{
        state,
        signUp,
        signIn,
        signOut,
        resendSignUpConfirmation,
        requestPasswordReset,
        passwordResetCooldownEndsAt,
        startPasswordRecovery,
        isRecoveryCodeUsed,
        completePasswordRecovery,
        cancelPasswordRecovery,
        signInWithGoogle,
        signInWithApple,
        isAppleSignInAvailable,
        retry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthSessionValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
