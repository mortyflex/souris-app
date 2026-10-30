// BeautIzzy — recovery and confirmation links against the REAL Supabase gateway mapping
//
// AuthProvider + createSupabaseAuthGateway over a Supabase-shaped fake that,
// like supabase-js, persists the session an exchange produces. A « restart »
// unmounts the tree and builds a new gateway over the same device storage.
// Business data is never read or written by any of this.

import { act, render } from '@testing-library/react-native';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth, type AuthSessionValue } from '@/features/auth/session/AuthProvider';

import { createSupabaseAuthGateway, type RecoveryMarkerStorage, type SupabaseAuthApi } from '../auth-gateway';

type Session = { readonly user: { readonly id: string; readonly email: string } };
const LEA: Session = { user: { id: 'user-lea', email: 'lea@example.com' } };

/** One device: its storage (marker) and the session supabase-js persisted. */
function createDevice() {
  const items = new Map<string, string>();
  const storage: RecoveryMarkerStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
  let stored: Session | null = null;
  const listeners = new Set<(event: string, session: Session | null) => void>();
  const notify = (event: string, session: Session | null) => listeners.forEach((listener) => listener(event, session));
  const api = {
    getSession: jest.fn(async () => ({ data: { session: stored }, error: null })),
    signUp: jest.fn(async () => ({ data: { user: { ...LEA.user, identities: [{ id: 'i' }] }, session: null }, error: null })),
    signInWithPassword: jest.fn(async () => {
      stored = LEA;
      notify('SIGNED_IN', LEA);
      return { data: { session: LEA }, error: null };
    }),
    signOut: jest.fn(async () => {
      stored = null;
      notify('SIGNED_OUT', null);
      return { error: null };
    }),
    resend: jest.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
    exchangeCodeForSession: jest.fn(async (code: string) => {
      // Like supabase-js: the session is SAVED before the result returns.
      stored = LEA;
      const recovery = code.startsWith('recovery');
      notify(recovery ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', LEA);
      return { data: { session: LEA, user: LEA.user, redirectType: recovery ? 'recovery' : null }, error: null };
    }),
    updateUser: jest.fn(async () => {
      notify('USER_UPDATED', stored);
      return { data: { user: LEA.user }, error: null };
    }),
    onAuthStateChange: jest.fn((listener: (event: string, session: Session | null) => void) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
  };
  return {
    api,
    storage,
    hasStoredSession: () => stored !== null,
    gateway: () => createSupabaseAuthGateway(api as unknown as SupabaseAuthApi, storage),
    refreshToken: () => notify('TOKEN_REFRESHED', stored),
  };
}

let latest: AuthSessionValue | undefined;

function Probe() {
  const value = useAuth();
  useEffect(() => {
    latest = value;
  });
  return <Text testID="status">{value.state.status === 'authenticated' ? `authenticated:${value.state.session}` : value.state.status}</Text>;
}

/** A bound device: the offline fallback would name this owner. */
const boundOwner = () => ({ id: 'user-lea' });

async function launch(device: ReturnType<typeof createDevice>) {
  const view = await render(
    <AuthProvider gateway={device.gateway()} resolveLocalOwner={boundOwner}>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

const statusOf = (view: Awaited<ReturnType<typeof launch>>) => view.getByTestId('status').props.children;

afterEach(() => {
  latest = undefined;
});

describe('interrupted password recovery', () => {
  it('a restart after the link but before the new password never opens the app', async () => {
    const device = createDevice();
    const first = await launch(device);
    await act(async () => {
      await latest?.startPasswordRecovery('recovery-code-1234');
    });
    expect(statusOf(first)).toBe('recovering-password');
    expect(device.hasStoredSession()).toBe(true);
    await first.unmount();

    const second = await launch(device);
    expect(statusOf(second)).toBe('unauthenticated');
    // The recovery session is gone from this device; the old password still signs in.
    expect(device.hasStoredSession()).toBe(false);
    expect(device.api.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('a token refresh during the recovery never turns it into a sign-in', async () => {
    const device = createDevice();
    const view = await launch(device);
    await act(async () => {
      await latest?.startPasswordRecovery('recovery-code-1234');
    });
    await act(async () => device.refreshToken());
    expect(statusOf(view)).toBe('recovering-password');
  });

  it('once the new password is saved, a restart restores the normal session', async () => {
    const device = createDevice();
    const first = await launch(device);
    await act(async () => {
      await latest?.startPasswordRecovery('recovery-code-1234');
    });
    await act(async () => {
      await latest?.completePasswordRecovery('password123');
    });
    expect(statusOf(first)).toBe('authenticated:live');
    await first.unmount();

    const second = await launch(device);
    expect(statusOf(second)).toBe('authenticated:live');
    expect(device.api.signOut).not.toHaveBeenCalled();
  });

  it('« Annuler » signs this device out, and the next launch stays signed out', async () => {
    const device = createDevice();
    const first = await launch(device);
    await act(async () => {
      await latest?.startPasswordRecovery('recovery-code-1234');
    });
    await act(async () => {
      await latest?.cancelPasswordRecovery();
    });
    expect(statusOf(first)).toBe('unauthenticated');
    expect(device.api.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await first.unmount();

    const second = await launch(device);
    expect(statusOf(second)).toBe('unauthenticated');
  });
});

describe('sign-up confirmation under PKCE', () => {
  it('confirming never opens a session: the owner still signs in with her password', async () => {
    const device = createDevice();
    const view = await launch(device);
    let outcome: unknown;
    await act(async () => {
      outcome = await latest?.signUp({ email: 'lea@example.com', password: 'password123' });
    });
    expect(outcome).toEqual({ kind: 'confirmation-required', email: 'lea@example.com' });
    expect(statusOf(view)).toBe('unauthenticated');
    expect(device.api.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(device.hasStoredSession()).toBe(false);

    await act(async () => {
      await latest?.signIn({ email: 'lea@example.com', password: 'password123' });
    });
    expect(statusOf(view)).toBe('authenticated:live');
  });

  it('a confirmation code pasted on the reset route is refused and leaves no session', async () => {
    const device = createDevice();
    const view = await launch(device);
    let outcome: unknown;
    await act(async () => {
      outcome = await latest?.startPasswordRecovery('signup-code-1234');
    });
    expect(outcome).toEqual({ kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } });
    expect(statusOf(view)).toBe('unauthenticated');
    expect(device.hasStoredSession()).toBe(false);
  });

  it('only the reset screen ever exchanges a link code; the sign-in route reads no parameter', () => {
    const SRC = join(__dirname, '..', '..', '..');
    // Source files end in .ts / .tsx; every other dot-less name under src is a folder.
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name: string) => {
        const path = join(dir, name);
        if (/\.tsx?$/.test(name)) return [path];
        if (name.includes('.') || name === '__tests__' || name === 'testing') return [];
        return files(path);
      });
    const using = (pattern: RegExp) =>
      files(SRC)
        .filter((path) => pattern.test(readFileSync(path, 'utf8')))
        .map((path) => path.slice(SRC.length + 1))
        .sort();

    expect(using(/exchangeCodeForSession\(/)).toEqual(['infrastructure/supabase/auth-gateway.ts']);
    // The screen calls it; the contract declares it; the provider and the adapter implement it.
    expect(using(/startPasswordRecovery\(/)).toEqual([
      'features/auth/ResetPasswordScreen.tsx',
      'features/auth/gateway.ts',
      'features/auth/session/AuthProvider.tsx',
      'infrastructure/supabase/auth-gateway.ts',
    ]);
    expect(readFileSync(join(SRC, 'app', '(auth)', 'sign-in.tsx'), 'utf8')).not.toMatch(/useLocalSearchParams|useGlobalSearchParams/);
  });
});
