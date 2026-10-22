// BeautIzzy — Business access provider: the domain decision follows the
// session, the source is a boundary that can fail or stay silent, nothing
// leaks from one account to another, and enforcement disabled keeps every
// professional on full access whatever the store says.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { SubscriptionStatus, SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';

import { SUBSCRIPTION_ENFORCEMENT } from '../../enforcement';
import { unconfiguredSubscriptionSource, type SubscriptionSource } from '../../subscription-source';
import {
  createFakeSubscriptionSource,
  UNAVAILABLE_VERIFICATION,
} from '../../testing/fake-subscription-source';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '../BusinessAccessProvider';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const FUTURE = new Date('2026-11-01T09:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const ACTIVE = verified({ kind: 'active', plan: 'monthly', expiresAt: FUTURE });
const EXPIRED = verified({ kind: 'expired' });
const NEVER = verified({ kind: 'never' });
const COMPLIMENTARY = verified({ kind: 'complimentary' });

const EVERY_VERIFICATION: readonly SubscriptionVerification[] = [
  ACTIVE,
  verified({ kind: 'active', plan: 'annual', expiresAt: FUTURE }),
  verified({ kind: 'trial', plan: 'monthly', expiresAt: FUTURE }),
  verified({ kind: 'cancelled-active', plan: 'annual', expiresAt: FUTURE }),
  verified({ kind: 'complimentary', expiresAt: FUTURE }),
  COMPLIMENTARY,
  EXPIRED,
  NEVER,
  UNAVAILABLE_VERIFICATION,
];

let latest: BusinessAccessValue | undefined;

function Probe() {
  const value = useBusinessAccess();
  useEffect(() => {
    latest = value;
  });
  const { access, canMutate, verification } = value;
  return (
    <Text testID="access-state">
      {`${access.mode}:${access.reason}:${canMutate ? 'write' : 'read'}:${verification?.kind ?? 'pending'}`}
    </Text>
  );
}

interface Harness {
  readonly auth?: FakeAuthGateway;
  readonly source?: SubscriptionSource;
  readonly enforcement?: 'enabled' | 'disabled';
  readonly clock?: () => Date;
}

type RenderedView = Awaited<ReturnType<typeof render>>;

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

async function renderAccess({
  auth = signedIn(),
  source = createFakeSubscriptionSource(),
  enforcement = 'enabled',
  clock = () => NOW,
}: Harness = {}) {
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source} clock={clock}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

const stateOf = (view: RenderedView) => view.getByTestId('access-state').props.children;

describe('BusinessAccessProvider', () => {
  afterEach(() => {
    latest = undefined;
  });

  it('starts pending, verifies the signed-in user once, and applies the answer', async () => {
    let resolve: ((value: SubscriptionVerification) => void) | undefined;
    const source = createFakeSubscriptionSource({
      verify: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    const view = await render(
      <AuthProvider gateway={signedIn()}>
        <BusinessAccessProvider enforcement="enabled" source={source} clock={() => NOW}>
          <Probe />
        </BusinessAccessProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(source.calls.verify).toEqual(['user-lea']);

    await act(async () => resolve?.(ACTIVE));
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(latest?.writeRefusal).toBeUndefined();
    expect(source.listenerCount()).toBe(1);
  });

  it('exposes the domain decision for each verification answer', async () => {
    const expectations: readonly [SubscriptionVerification, string][] = [
      [ACTIVE, 'full:entitled:write:verified'],
      [COMPLIMENTARY, 'full:entitled:write:verified'],
      [EXPIRED, 'read-only:subscription-expired:read:verified'],
      [NEVER, 'read-only:never-subscribed:read:verified'],
      [UNAVAILABLE_VERIFICATION, 'read-only:no-entitlement-evidence:read:unavailable'],
    ];
    for (const [verification, expected] of expectations) {
      const source = createFakeSubscriptionSource();
      source.respondWith(verification);
      const view = await renderAccess({ source });
      expect(stateOf(view)).toBe(expected);
      expect(latest?.verification).toEqual(verification);
      expect(latest?.writeRefusal).toBe(expected.startsWith('read-only') ? expected.split(':')[1] : undefined);
    }
  });

  it('keeps full access under enforcement disabled for every answer, including a failing source', async () => {
    for (const verification of EVERY_VERIFICATION) {
      const source = createFakeSubscriptionSource();
      source.respondWith(verification);
      const view = await renderAccess({ source, enforcement: 'disabled' });
      expect(stateOf(view)).toBe(`full:enforcement-disabled:write:${verification.kind}`);
      expect(latest?.canMutate).toBe(true);
      expect(latest?.writeRefusal).toBeUndefined();
      expect(latest?.enforcement).toBe('disabled');
    }
    const failing = createFakeSubscriptionSource({ verify: () => Promise.reject(new Error('store down')) });
    const view = await renderAccess({ source: failing, enforcement: 'disabled' });
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:unavailable');
  });

  it('ships with enforcement disabled and the unconfigured source: no claim, no restriction', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    await expect(unconfiguredSubscriptionSource.verify('user-lea')).resolves.toEqual(UNAVAILABLE_VERIFICATION);
    expect(unconfiguredSubscriptionSource.onVerificationChange).toBeUndefined();

    const shipped = await renderAccess({ source: unconfiguredSubscriptionSource, enforcement: SUBSCRIPTION_ENFORCEMENT });
    expect(stateOf(shipped)).toBe('full:enforcement-disabled:write:unavailable');

    // The same source under enforcement: unavailable grants nothing.
    const enforced = await renderAccess({ source: unconfiguredSubscriptionSource });
    expect(stateOf(enforced)).toBe('read-only:no-entitlement-evidence:read:unavailable');
  });

  it('survives an absent or rejecting source as unavailable', async () => {
    const absent = await renderAccess({ source: undefined });
    expect(stateOf(absent)).toBe('read-only:no-entitlement-evidence:read:unavailable');

    const rejecting = createFakeSubscriptionSource({ verify: () => Promise.reject(new Error('store down')) });
    const failed = await renderAccess({ source: rejecting });
    expect(stateOf(failed)).toBe('read-only:no-entitlement-evidence:read:unavailable');
  });

  it('applies verifications pushed by the source and re-verifies on refresh', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(NEVER);
    const view = await renderAccess({ source });
    expect(stateOf(view)).toBe('read-only:never-subscribed:read:verified');

    await act(async () => {
      source.emit('user-lea', ACTIVE);
    });
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    source.respondWith(EXPIRED);
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
    expect(source.calls.verify).toEqual(['user-lea', 'user-lea']);
  });

  it('keeps the evidence of the session: a verified entitlement holds while the store is unreachable', async () => {
    let now = NOW;
    const source = createFakeSubscriptionSource();
    source.respondWith(ACTIVE);
    const view = await renderAccess({ source, clock: () => now });
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    source.respondWith(UNAVAILABLE_VERIFICATION);
    now = new Date(FUTURE.getTime() - HOUR_MS);
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('full:entitled:write:unavailable');

    now = new Date(FUTURE.getTime() + HOUR_MS);
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');

    now = new Date(FUTURE.getTime() + 72 * HOUR_MS);
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('read-only:grace-elapsed:read:unavailable');
  });

  it('erases the evidence once the store confirms the end', async () => {
    const source = createFakeSubscriptionSource();
    source.respondWith(ACTIVE);
    const view = await renderAccess({ source });

    source.respondWith(EXPIRED);
    await act(async () => {
      await latest?.refresh();
    });
    source.respondWith(UNAVAILABLE_VERIFICATION);
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
  });

  it('never carries one account’s verification or evidence to another, nor past sign-out', async () => {
    const auth = signedIn();
    const source = createFakeSubscriptionSource();
    source.respondWith(ACTIVE);
    const view = await renderAccess({ auth, source });
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    // Another account: pending at once, then its own (unavailable) answer — never Léa's evidence.
    source.respondWith(UNAVAILABLE_VERIFICATION);
    await act(async () => {
      auth.emitSession({ id: 'user-b' });
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(source.calls.verify).toEqual(['user-lea', 'user-b']);
    expect(source.listenerCount()).toBe(1);

    // Sign-out: nothing verified, nothing to inherit.
    await act(async () => {
      auth.emitSession(null);
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(latest?.verification).toBeUndefined();
    expect(source.listenerCount()).toBe(0);

    // Léa again: a fresh session, verified anew; the earlier proof is gone.
    await act(async () => {
      auth.emitSession(fakeUser);
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(source.calls.verify).toEqual(['user-lea', 'user-b', 'user-lea']);
  });

  it('drops answers and pushes that belong to a previous session', async () => {
    const auth = signedIn();
    const pending = new Map<string, (value: SubscriptionVerification) => void>();
    const source = createFakeSubscriptionSource({
      verify: (userId) =>
        new Promise((resolve) => {
          pending.set(userId, resolve);
        }),
    });
    const view = await renderAccess({ auth, source });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');

    await act(async () => {
      auth.emitSession({ id: 'user-b' });
    });
    await act(async () => pending.get('user-b')?.(NEVER));
    expect(stateOf(view)).toBe('read-only:never-subscribed:read:verified');

    // Léa's late answer, and a push for her, change nothing for user-b.
    await act(async () => pending.get('user-lea')?.(ACTIVE));
    await act(async () => {
      source.emit('user-lea', ACTIVE);
    });
    expect(stateOf(view)).toBe('read-only:never-subscribed:read:verified');
  });

  it('applies only the latest refresh of a session', async () => {
    const resolvers: ((value: SubscriptionVerification) => void)[] = [];
    const source = createFakeSubscriptionSource({
      verify: () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    });
    const view = await renderAccess({ source });
    await act(async () => resolvers[0]?.(NEVER));
    expect(stateOf(view)).toBe('read-only:never-subscribed:read:verified');

    let first: ReturnType<BusinessAccessValue['refresh']> | undefined;
    let second: ReturnType<BusinessAccessValue['refresh']> | undefined;
    await act(async () => {
      first = latest?.refresh();
      second = latest?.refresh();
    });
    await act(async () => resolvers[2]?.(ACTIVE));
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    await act(async () => resolvers[1]?.(EXPIRED));
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    await act(async () => {
      await Promise.all([first, second]);
    });
  });

  it('is required by its hook', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).rejects.toThrow('useBusinessAccess must be used inside BusinessAccessProvider');
    jest.restoreAllMocks();
  });
});

describe('BusinessAccessProvider — loadOffering (Phase 6.2)', () => {
  it('asks the source for the signed-in user only, through the same source as the verification', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering({ status: 'available', plans: [] });
    await renderAccess({ source, enforcement: 'disabled' });
    await expect(latest!.loadOffering()).resolves.toEqual({ status: 'available', plans: [] });
    expect(source.calls.loadOffering).toEqual(['user-lea']);
    expect(source.calls.verify).toEqual(['user-lea']);
  });

  it('answers not-configured without a store, store-unavailable on a rejection, and no-account signed out', async () => {
    await renderAccess({ source: unconfiguredSubscriptionSource, enforcement: 'disabled' });
    await expect(latest!.loadOffering()).resolves.toEqual({ status: 'unavailable', reason: 'not-configured' });

    const rejecting = createFakeSubscriptionSource({ loadOffering: () => Promise.reject(new Error('offline')) });
    await renderAccess({ source: rejecting, enforcement: 'disabled' });
    await expect(latest!.loadOffering()).resolves.toEqual({ status: 'unavailable', reason: 'store-unavailable' });

    const source = createFakeSubscriptionSource({ offerings: true });
    await renderAccess({ auth: createFakeAuthGateway(), source, enforcement: 'disabled' });
    await expect(latest!.loadOffering()).resolves.toEqual({ status: 'unavailable', reason: 'no-account' });
    expect(source.calls.loadOffering).toEqual([]);
  });

  it('loads nothing of its own: no offering request happens without a caller, whatever the verification', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWith(ACTIVE);
    await renderAccess({ source });
    expect(source.calls.verify).toEqual(['user-lea']);
    expect(source.calls.loadOffering).toEqual([]);
  });
});
