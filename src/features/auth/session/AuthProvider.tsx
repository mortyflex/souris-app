// Souris — Auth session boundary
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
  | { readonly status: 'error'; readonly failure: AuthFailure };

export interface AuthSessionValue {
  readonly state: AuthState;
  readonly signUp: (credentials: AuthCredentials) => Promise<SignUpOutcome>;
  readonly signIn: (credentials: AuthCredentials) => Promise<SignInOutcome>;
  readonly signOut: () => Promise<void>;
  readonly resendSignUpConfirmation: (email: string) => Promise<ResendOutcome>;
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

  const retry = useCallback(() => {
    setState({ status: 'initializing' });
    void restore();
  }, [restore]);

  return (
    <AuthContext.Provider
      value={{ state, signUp, signIn, signOut, resendSignUpConfirmation, retry }}
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
