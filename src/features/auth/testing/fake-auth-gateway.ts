// BeautIzzy — deterministic AuthGateway for tests (never imported by app code)

import type {
  AuthCredentials,
  AuthGateway,
  AuthUser,
  PasswordRecoveryOutcome,
  PasswordResetRequestOutcome,
  PasswordUpdateOutcome,
  ResendOutcome,
  RestoredSession,
  SignInOutcome,
  SignUpOutcome,
  SocialSignInOutcome,
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
    requestPasswordReset: string[];
    startPasswordRecovery: string[];
    updatePassword: string[];
    discardPasswordRecovery: number;
    signInWithGoogle: number;
    signInWithApple: number;
  };
}

interface FakeAuthGatewayOptions {
  readonly restore?: () => Promise<RestoredSession>;
  readonly signUp?: (credentials: AuthCredentials) => Promise<SignUpOutcome>;
  readonly signIn?: (credentials: AuthCredentials) => Promise<SignInOutcome>;
  readonly resend?: (email: string) => Promise<ResendOutcome>;
  readonly requestPasswordReset?: (email: string) => Promise<PasswordResetRequestOutcome>;
  readonly startPasswordRecovery?: (code: string) => Promise<PasswordRecoveryOutcome>;
  readonly updatePassword?: (password: string) => Promise<PasswordUpdateOutcome>;
  readonly signInWithGoogle?: () => Promise<SocialSignInOutcome>;
  readonly signInWithApple?: () => Promise<SocialSignInOutcome>;
  /** Defaults to false (Android, or an unconfigured build). */
  readonly appleAvailable?: boolean;
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
    requestPasswordReset: [],
    startPasswordRecovery: [],
    updatePassword: [],
    discardPasswordRecovery: 0,
    signInWithGoogle: 0,
    signInWithApple: 0,
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
    requestPasswordReset: (email) => {
      calls.requestPasswordReset.push(email);
      return options.requestPasswordReset ? options.requestPasswordReset(email) : Promise.resolve({ kind: 'sent' });
    },
    startPasswordRecovery: (code) => {
      calls.startPasswordRecovery.push(code);
      return options.startPasswordRecovery
        ? options.startPasswordRecovery(code)
        : Promise.resolve({ kind: 'recovering', user: fakeUser });
    },
    updatePassword: (password) => {
      calls.updatePassword.push(password);
      return options.updatePassword ? options.updatePassword(password) : Promise.resolve({ kind: 'updated', user: fakeUser });
    },
    discardPasswordRecovery: () => {
      calls.discardPasswordRecovery += 1;
      return Promise.resolve();
    },
    signInWithGoogle: () => {
      calls.signInWithGoogle += 1;
      return options.signInWithGoogle ? options.signInWithGoogle() : Promise.resolve({ kind: 'authenticated', user: fakeUser });
    },
    isAppleSignInAvailable: () => Promise.resolve(options.appleAvailable ?? false),
    signInWithApple: () => {
      calls.signInWithApple += 1;
      return options.signInWithApple ? options.signInWithApple() : Promise.resolve({ kind: 'authenticated', user: fakeUser });
    },
    onSessionChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
