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
} from '../gateway';

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
  readonly requestPasswordReset: (email: string) => Promise<PasswordResetRequestOutcome>;
  /** Opens the recovery session of a recovery link's code; refused while signed in. */
  readonly startPasswordRecovery: (code: string) => Promise<PasswordRecoveryOutcome>;
  /** True when this code was already handed to the exchange since the app started (memory only). */
  readonly isRecoveryCodeUsed: (code: string) => boolean;
  /** Saves the new password, then enters like a sign-in. */
  readonly completePasswordRecovery: (password: string) => Promise<PasswordUpdateOutcome>;
  /** Abandons the recovery: the recovery session is signed out, nothing else changes. */
  readonly cancelPasswordRecovery: () => Promise<void>;
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
}

function toFailure(error: unknown): AuthFailure {
  return error instanceof AuthGatewayError ? { code: error.code } : { code: 'UNKNOWN' };
}

export function AuthProvider({
  gateway,
  resolveLocalOwner,
  children,
}: PropsWithChildren<AuthProviderProps>) {
  const [state, setState] = useState<AuthState>({ status: 'initializing' });
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
      await gateway.signOut();
    } finally {
      // The persisted session is gone either way; local business data stays.
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
    async (email: string): Promise<PasswordResetRequestOutcome> => {
      try {
        return await gateway.requestPasswordReset(email);
      } catch (error) {
        return { kind: 'failed', failure: toFailure(error) };
      }
    },
    [gateway],
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
        startPasswordRecovery,
        isRecoveryCodeUsed,
        completePasswordRecovery,
        cancelPasswordRecovery,
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
