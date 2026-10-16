// BeautIzzy — the business write guard: ONE typed refusal, decided by
// BusinessAccess alone; a stable function that judges by the latest access
// even from a closure captured earlier; enforcement disabled refuses nothing;
// the strict provider invariant is kept.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { BusinessAccess, ReadOnlyReason, SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';

import { BusinessAccessProvider } from '../session/BusinessAccessProvider';
import { createFakeSubscriptionSource } from '../testing/fake-subscription-source';
import {
  assertBusinessWriteAccess,
  BusinessAccessDeniedError,
  isBusinessAccessDeniedError,
  useBusinessWriteGuard,
  type BusinessWriteGuard,
} from '../write-guard';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const FUTURE = new Date('2026-11-01T09:00:00.000Z');

const ACTIVE: SubscriptionVerification = {
  kind: 'verified',
  status: { kind: 'active', plan: 'monthly', expiresAt: FUTURE },
};
const EXPIRED: SubscriptionVerification = { kind: 'verified', status: { kind: 'expired' } };

const READ_ONLY_REASONS: readonly ReadOnlyReason[] = [
  'subscription-expired',
  'never-subscribed',
  'no-entitlement-evidence',
  'grace-elapsed',
  'unreliable-evidence',
];

function refusalOf(task: () => void): unknown {
  try {
    task();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('assertBusinessWriteAccess', () => {
  it('permits every full access, whatever its reason', () => {
    const full: readonly BusinessAccess[] = [
      { mode: 'full', reason: 'enforcement-disabled' },
      { mode: 'full', reason: 'entitled' },
      { mode: 'full', reason: 'offline-grace', graceEndsAt: new Date(NOW.getTime() + 3_600_000) },
    ];
    for (const access of full) {
      expect(() => assertBusinessWriteAccess(access, 'clients.addClient')).not.toThrow();
    }
  });

  it('refuses every read-only access with a typed error carrying the reason and the operation', () => {
    for (const reason of READ_ONLY_REASONS) {
      const error = refusalOf(() =>
        assertBusinessWriteAccess({ mode: 'read-only', reason }, 'sales.completeSale'),
      );
      expect(isBusinessAccessDeniedError(error)).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BusinessAccessDeniedError);
      expect((error as BusinessAccessDeniedError).name).toBe('BusinessAccessDeniedError');
      expect((error as BusinessAccessDeniedError).reason).toBe(reason);
      expect((error as BusinessAccessDeniedError).operation).toBe('sales.completeSale');
      expect((error as Error).message).toContain('sales.completeSale');
      expect((error as Error).message).toContain(reason);
    }
  });

  it('recognizes only its own refusal', () => {
    expect(isBusinessAccessDeniedError(new Error('disk full'))).toBe(false);
    expect(isBusinessAccessDeniedError(undefined)).toBe(false);
    expect(isBusinessAccessDeniedError({ name: 'BusinessAccessDeniedError' })).toBe(false);
  });
});

describe('useBusinessWriteGuard', () => {
  /** Every guard function the probe received, one per committed render. */
  let guards: BusinessWriteGuard[] = [];

  function Probe() {
    const guard = useBusinessWriteGuard();
    useEffect(() => {
      guards.push(guard);
    });
    return <Text>probe</Text>;
  }

  const signedIn = () =>
    createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

  afterEach(() => {
    guards = [];
  });

  it('is one stable function that judges by the latest access, even when captured before the access changed', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(ACTIVE);
    await render(
      <AuthProvider gateway={signedIn()}>
        <BusinessAccessProvider enforcement="enabled" source={source} clock={() => NOW}>
          <Probe />
        </BusinessAccessProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    const captured = guards[0]!;
    expect(() => captured('clients.addClient')).not.toThrow();

    // The store revokes the entitlement: no remount, the same function now refuses.
    await act(async () => source.emit(fakeUser.id, EXPIRED));
    expect(guards.every((guard) => guard === captured)).toBe(true);
    const error = refusalOf(() => captured('clients.addClient'));
    expect(isBusinessAccessDeniedError(error)).toBe(true);
    expect((error as BusinessAccessDeniedError).reason).toBe('subscription-expired');

    // A later confirmed entitlement restores it.
    await act(async () => source.emit(fakeUser.id, ACTIVE));
    expect(() => captured('clients.addClient')).not.toThrow();
  });

  it('refuses nothing while enforcement is disabled, whatever the store says', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(EXPIRED);
    await render(
      <AuthProvider gateway={signedIn()}>
        <BusinessAccessProvider enforcement="disabled" source={source} clock={() => NOW}>
          <Probe />
        </BusinessAccessProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(() => guards[0]!('appointments.addAppointment')).not.toThrow();
  });

  it('keeps the strict provider invariant: no BusinessAccessProvider, no guard', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(render(<Probe />)).rejects.toThrow(
        'useBusinessAccess must be used inside BusinessAccessProvider',
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
