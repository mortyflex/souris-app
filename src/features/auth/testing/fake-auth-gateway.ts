// Souris — deterministic AuthGateway for tests (never imported by app code)

import type {
  AuthCredentials,
  AuthGateway,
  AuthUser,
  ResendOutcome,
  RestoredSession,
  SignInOutcome,
  SignUpOutcome,
} from '../gateway';

export interface FakeAuthGateway extends AuthGateway {
  /** Pushes a session change to every subscriber, as Supabase would. */
  emitSession(user: AuthUser | null): void;
  readonly listenerCount: () => number;
  readonly calls: {
    restoreSession: number;
    signUp: AuthCredentials[];
    signIn: AuthCredentials[];
    signOut: number;
    resend: string[];
  };
}

interface FakeAuthGatewayOptions {
  readonly restore?: () => Promise<RestoredSession>;
  readonly signUp?: (credentials: AuthCredentials) => Promise<SignUpOutcome>;
  readonly signIn?: (credentials: AuthCredentials) => Promise<SignInOutcome>;
  readonly resend?: (email: string) => Promise<ResendOutcome>;
}

export const fakeUser: AuthUser = { id: 'user-lea', email: 'lea@example.com' };

export function createFakeAuthGateway(options: FakeAuthGatewayOptions = {}): FakeAuthGateway {
  const listeners = new Set<(user: AuthUser | null) => void>();
  const calls: FakeAuthGateway['calls'] = {
    restoreSession: 0,
    signUp: [],
    signIn: [],
    signOut: 0,
    resend: [],
  };

  return {
    calls,
    listenerCount: () => listeners.size,
    emitSession: (user) => {
      for (const listener of listeners) listener(user);
    },
    restoreSession: () => {
      calls.restoreSession += 1;
      return options.restore ? options.restore() : Promise.resolve({ kind: 'unauthenticated' });
    },
    signUp: (credentials) => {
      calls.signUp.push(credentials);
      return options.signUp
        ? options.signUp(credentials)
        : Promise.resolve({ kind: 'authenticated', user: fakeUser });
    },
    signIn: (credentials) => {
      calls.signIn.push(credentials);
      return options.signIn
        ? options.signIn(credentials)
        : Promise.resolve({ kind: 'authenticated', user: fakeUser });
    },
    signOut: () => {
      calls.signOut += 1;
      return Promise.resolve();
    },
    resendSignUpConfirmation: (email) => {
      calls.resend.push(email);
      return options.resend ? options.resend(email) : Promise.resolve({ kind: 'sent' });
    },
    onSessionChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
