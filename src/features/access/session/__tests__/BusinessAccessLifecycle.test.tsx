// BeautIzzy — Business access over time: an entitlement that ends while the
// app stays open, the 72-hour offline grace with a real end, a deadline missed
// while suspended and caught up on in the foreground, and every timer and
// listener dying with the session. Fake clock, fake timers, fake store: one
// render per test.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { OFFLINE_ACCESS_GRACE_PERIOD_HOURS, type SubscriptionStatus, type SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';

import { SUBSCRIPTION_ENFORCEMENT } from '../../enforcement';
import type { SubscriptionSource } from '../../subscription-source';
import {
  createFakeSubscriptionSource,
  UNAVAILABLE_VERIFICATION,
  type FakeSubscriptionSource,
} from '../../testing/fake-subscription-source';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '../BusinessAccessProvider';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const GRACE_MS = OFFLINE_ACCESS_GRACE_PERIOD_HOURS * HOUR_MS;

const NOW = new Date('2026-10-15T09:00:00.000Z');
const EXPIRY = new Date(NOW.getTime() + 2 * HOUR_MS);
const GRACE_END = new Date(EXPIRY.getTime() + GRACE_MS);

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const activeUntil = (expiresAt: Date) => verified({ kind: 'active', plan: 'monthly', expiresAt });
const EXPIRED = verified({ kind: 'expired' });

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

type RenderedView = Awaited<ReturnType<typeof render>>;
const stateOf = (view: RenderedView) => view.getByTestId('access-state').props.children;

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

/** A source whose first answer is scripted, like a store reached at launch. */
function sourceAnswering(first: SubscriptionVerification): FakeSubscriptionSource {
  const source = createFakeSubscriptionSource();
  source.respondWith(first);
  return source;
}

interface Harness {
  readonly auth?: FakeAuthGateway;
  readonly source?: SubscriptionSource;
  readonly enforcement?: 'enabled' | 'disabled';
}

// The provider reads the faked system clock, exactly as the application does.
async function renderAccess({ auth = signedIn(), source, enforcement = 'enabled' }: Harness) {
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

/** Time passes with the app running: timers fire as they come due. */
async function elapse(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The app was suspended: the clock jumps but no timer could fire. */
function suspendUntil(instant: Date) {
  jest.setSystemTime(instant);
}

/** The AppState listeners of the mounted providers, fired by hand. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

async function foreground() {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener('active');
  });
}

describe('BusinessAccessProvider — lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    latest = undefined;
    appStateListeners.clear();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps an active entitlement full until its end, verifying nothing in between', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    await elapse(2 * HOUR_MS - 1);
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(source.calls.verify).toEqual(['user-lea']);
  });

  it('re-resolves at the end of the entitlement and asks the store again', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    source.respondWith(UNAVAILABLE_VERIFICATION);

    await elapse(2 * HOUR_MS);
    // The store could not be reached: the proof speaks, and grants its grace.
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    expect(latest?.access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    expect(source.calls.verify).toEqual(['user-lea', 'user-lea']);
  });

  it('keeps full access through a renewal confirmed at the end, and waits for the new end', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    const renewedUntil = new Date(EXPIRY.getTime() + 30 * DAY_MS);
    source.respondWith(activeUntil(renewedUntil));

    await elapse(2 * HOUR_MS);
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(latest?.verification).toEqual(activeUntil(renewedUntil));

    source.respondWith(EXPIRED);
    await elapse(30 * DAY_MS - 1);
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    await elapse(1);
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
    expect(source.calls.verify).toHaveLength(3);
  });

  it('becomes read-only at once when the store confirms the end, and forgets the proof', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    source.respondWith(EXPIRED);

    await elapse(2 * HOUR_MS);
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
    expect(latest?.writeRefusal).toBe('subscription-expired');

    source.respondWith(UNAVAILABLE_VERIFICATION);
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('gives a cancelled subscription no grace: read-only at its end when the store is unreachable', async () => {
    const source = sourceAnswering(verified({ kind: 'cancelled-active', plan: 'annual', expiresAt: EXPIRY }));
    const view = await renderAccess({ source });
    source.respondWith(UNAVAILABLE_VERIFICATION);

    await elapse(2 * HOUR_MS - 1);
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    await elapse(1);
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:unavailable');
    await elapse(GRACE_MS);
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:unavailable');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ends the offline grace exactly 72 hours after the proven end, however often the store is asked', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    source.respondWith(UNAVAILABLE_VERIFICATION);

    await elapse(2 * HOUR_MS);
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');

    // Hours of failed refreshes: the grace deadline does not move by a millisecond.
    for (let round = 0; round < 7; round += 1) {
      await elapse(10 * HOUR_MS);
      await act(async () => {
        await latest?.refresh();
      });
      expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
      expect(latest?.access).toEqual({ mode: 'full', reason: 'offline-grace', graceEndsAt: GRACE_END });
    }
    const untilGraceEnd = GRACE_END.getTime() - Date.now();
    await elapse(untilGraceEnd - 1);
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');

    await elapse(1);
    expect(stateOf(view)).toBe('read-only:grace-elapsed:read:unavailable');
    expect(latest?.writeRefusal).toBe('grace-elapsed');
    expect(jest.getTimerCount()).toBe(0);

    // A verification that finally succeeds restores access at once.
    source.respondWith(activeUntil(new Date(Date.now() + DAY_MS)));
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('full:entitled:write:verified');
  });

  it('never schedules anything for an indefinite complimentary access', async () => {
    const source = sourceAnswering(verified({ kind: 'complimentary' }));
    const view = await renderAccess({ source });
    expect(jest.getTimerCount()).toBe(0);

    await elapse(400 * DAY_MS);
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(source.calls.verify).toEqual(['user-lea']);
  });

  it('holds a time-limited complimentary access to its end: confirmed end → read-only, unreachable → the grace, then read-only', async () => {
    const source = sourceAnswering(verified({ kind: 'complimentary', expiresAt: EXPIRY }));
    const view = await renderAccess({ source });
    source.respondWith(UNAVAILABLE_VERIFICATION);

    await elapse(2 * HOUR_MS);
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    await elapse(GRACE_MS);
    expect(stateOf(view)).toBe('read-only:grace-elapsed:read:unavailable');

    source.respondWith(verified({ kind: 'complimentary', expiresAt: new Date(Date.now() + HOUR_MS) }));
    await act(async () => {
      await latest?.refresh();
    });
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    source.respondWith(EXPIRED);
    await elapse(HOUR_MS);
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
  });

  it('reaches a deadline farther than one timer can wait, in steps, without asking the store early', async () => {
    const source = sourceAnswering(activeUntil(new Date(NOW.getTime() + 60 * DAY_MS)));
    const view = await renderAccess({ source });
    source.respondWith(UNAVAILABLE_VERIFICATION);

    await elapse(30 * DAY_MS);
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(source.calls.verify).toEqual(['user-lea']);
    expect(jest.getTimerCount()).toBe(1);

    await elapse(30 * DAY_MS);
    expect(stateOf(view)).toBe('full:offline-grace:write:unavailable');
    expect(source.calls.verify).toEqual(['user-lea', 'user-lea']);
  });

  it('catches up in the foreground on a deadline that passed while suspended', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    source.respondWith(UNAVAILABLE_VERIFICATION);
    expect(appStateListeners.size).toBe(1);

    // Suspended through the end AND the whole grace: no timer could fire.
    suspendUntil(new Date(GRACE_END.getTime() + MINUTE_MS));
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    await foreground();
    expect(stateOf(view)).toBe('read-only:grace-elapsed:read:unavailable');
    expect(source.calls.verify).toEqual(['user-lea', 'user-lea']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('re-verifies in the foreground, and a renewal found there restores full access', async () => {
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source });
    const renewedUntil = new Date(EXPIRY.getTime() + 30 * DAY_MS);
    source.respondWith(activeUntil(renewedUntil));

    suspendUntil(new Date(EXPIRY.getTime() + DAY_MS));
    await foreground();
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(latest?.verification).toEqual(activeUntil(renewedUntil));

    // Back and forth between foreground and background never adds a listener.
    await foreground();
    await foreground();
    expect(appStateListeners.size).toBe(1);
    expect(source.calls.verify).toHaveLength(4);
  });

  it('clears timers and listeners on sign-out: nothing fires for the previous session', async () => {
    const auth = signedIn();
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ auth, source });
    expect(jest.getTimerCount()).toBe(1);
    expect(appStateListeners.size).toBe(1);
    expect(source.listenerCount()).toBe(1);

    await act(async () => {
      auth.emitSession(null);
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(jest.getTimerCount()).toBe(0);
    expect(appStateListeners.size).toBe(0);
    expect(source.listenerCount()).toBe(0);

    await elapse(2 * HOUR_MS + GRACE_MS);
    expect(source.calls.verify).toEqual(['user-lea']);
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
  });

  it('lets no scheduled or late result of one account reach another', async () => {
    const auth = signedIn();
    const pending = new Map<string, (value: SubscriptionVerification) => void>();
    const source = createFakeSubscriptionSource({
      verify: (userId) =>
        new Promise((resolve) => {
          pending.set(userId, resolve);
        }),
    });
    const view = await renderAccess({ auth, source });
    await act(async () => pending.get('user-lea')?.(activeUntil(EXPIRY)));
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(jest.getTimerCount()).toBe(1);

    // Another professional signs in: Léa's timer is gone with her session.
    await act(async () => {
      auth.emitSession({ id: 'user-b' });
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(jest.getTimerCount()).toBe(0);

    // Léa's end passes: no verification is requested for anyone.
    await elapse(2 * HOUR_MS);
    expect(source.calls.verify).toEqual(['user-lea', 'user-b']);
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');

    // Léa's late answer and a late push for her change nothing for user-b.
    await act(async () => pending.get('user-lea')?.(activeUntil(new Date(Date.now() + DAY_MS))));
    await act(async () => {
      source.emit('user-lea', activeUntil(new Date(Date.now() + DAY_MS)));
    });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(jest.getTimerCount()).toBe(0);

    await act(async () => pending.get('user-b')?.(EXPIRED));
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
  });

  it('stays safe with an unreachable or failing store: no deadline, no crash, read-only honestly', async () => {
    const source = createFakeSubscriptionSource({ verify: () => Promise.reject(new Error('store down')) });
    const view = await renderAccess({ source });
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(jest.getTimerCount()).toBe(0);

    await elapse(30 * DAY_MS);
    await foreground();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:unavailable');
    expect(source.calls.verify).toHaveLength(2);
  });

  it('under enforcement disabled, time and foreground change nothing: full, no deadline, no timer', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const source = sourceAnswering(activeUntil(EXPIRY));
    const view = await renderAccess({ source, enforcement: SUBSCRIPTION_ENFORCEMENT });
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
    expect(jest.getTimerCount()).toBe(0);

    source.respondWith(EXPIRED);
    await elapse(2 * HOUR_MS + GRACE_MS);
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
    expect(source.calls.verify).toEqual(['user-lea']);

    await foreground();
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
    expect(latest?.canMutate).toBe(true);
    expect(latest?.writeRefusal).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
