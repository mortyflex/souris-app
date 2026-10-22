// BeautIzzy — the provider's transactions (Phase 6.3): bound to the signed-in
// user, one at a time for the session, refused outside a purchasable store,
// applied through the SAME verification pipeline — never a separate
// entitlement —, superseding a verification in flight, applied to nobody when
// the session changed meanwhile, and never started on their own.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { SubscriptionStatus, SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';

import type { StorePurchaseOutcome, StoreRestoreOutcome, SubscriptionSource } from '../../subscription-source';
import { createFakeSubscriptionSource } from '../../testing/fake-subscription-source';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '../BusinessAccessProvider';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const FUTURE = new Date('2026-11-01T09:00:00.000Z');
const NOA = { id: 'user-noa', email: 'noa@example.com' };

const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });
const ACTIVE = verified({ kind: 'active', plan: 'annual', expiresAt: FUTURE });
const NEVER = verified({ kind: 'never' });
const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };
const REQUEST = { reference: 'offering-1', plan: 'annual' as const };

let latest: BusinessAccessValue | undefined;

function Probe() {
  const value = useBusinessAccess();
  useEffect(() => {
    latest = value;
  });
  const { access, verification, storeOperation } = value;
  return <Text testID="access-state">{`${access.reason}:${verification?.kind ?? 'pending'}:${storeOperation ?? 'idle'}`}</Text>;
}

type View = Awaited<ReturnType<typeof render>>;
const stateOf = (view: View) => view.getByTestId('access-state').props.children as string;

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

async function renderAccess({
  auth = signedIn(),
  source = createFakeSubscriptionSource({ transactions: true }),
  enforcement = 'disabled',
}: { readonly auth?: FakeAuthGateway; readonly source?: SubscriptionSource; readonly enforcement?: 'enabled' | 'disabled' } = {}) {
  latest = undefined;
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source} clock={() => NOW}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

/** A source whose purchase / restore answers are released by the test. */
function deferredSource() {
  const purchases: ((outcome: StorePurchaseOutcome) => void)[] = [];
  const restores: ((outcome: StoreRestoreOutcome) => void)[] = [];
  const source = createFakeSubscriptionSource({
    purchase: () => new Promise((resolve) => purchases.push(resolve)),
    restore: () => new Promise((resolve) => restores.push(resolve)),
  });
  return { source, purchases, restores };
}

afterEach(() => {
  latest = undefined;
});

describe('BusinessAccessProvider — purchase', () => {
  it('buys for the signed-in user through the source, and applies the completed verification through the session pipeline', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification: ACTIVE });
    const view = await renderAccess({ source, enforcement: 'enabled' });
    expect(stateOf(view)).toBe('never-subscribed:verified:idle');

    let outcome: Awaited<ReturnType<BusinessAccessValue['purchase']>> | undefined;
    await act(async () => {
      outcome = await latest!.purchase(REQUEST);
    });
    expect(outcome).toEqual({ kind: 'completed', verification: ACTIVE });
    expect(source.calls.purchase).toEqual([{ userId: 'user-lea', request: REQUEST }]);
    // The domain rule read the store's answer: full access, entitled — no flag was set anywhere.
    expect(stateOf(view)).toBe('entitled:verified:idle');
    expect(latest?.verification).toEqual(ACTIVE);
  });

  it('with enforcement disabled, a purchase changes the verification and nothing of the access', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification: ACTIVE });
    const view = await renderAccess({ source });
    expect(stateOf(view)).toBe('enforcement-disabled:verified:idle');
    await act(async () => {
      await latest!.purchase(REQUEST);
    });
    expect(stateOf(view)).toBe('enforcement-disabled:verified:idle');
    expect(latest?.verification).toEqual(ACTIVE);
    expect(latest?.enforcement).toBe('disabled');
  });

  it.each([
    ['cancelled', { kind: 'cancelled' }],
    ['pending', { kind: 'pending' }],
    ['failed', { kind: 'failed', reason: 'store-problem' }],
  ] as const)('a %s outcome is returned as is and changes nothing', async (_label, scripted) => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase(scripted);
    const view = await renderAccess({ source, enforcement: 'enabled' });
    let outcome: unknown;
    await act(async () => {
      outcome = await latest!.purchase(REQUEST);
    });
    expect(outcome).toEqual(scripted);
    expect(stateOf(view)).toBe('never-subscribed:verified:idle');
  });

  it('a completed purchase whose verification is unavailable applies it as such: nothing is granted', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification: UNAVAILABLE });
    const view = await renderAccess({ source, enforcement: 'enabled' });
    await act(async () => {
      await latest!.purchase(REQUEST);
    });
    // Verified `never` before, unavailable now, no proof: read-only without evidence — never entitled.
    expect(stateOf(view)).toBe('no-entitlement-evidence:unavailable:idle');
  });

  it('refuses without an account, without a transacting source, and outside a purchasable store — without touching the source', async () => {
    const signedOut = createFakeAuthGateway({ restore: async () => ({ kind: 'unauthenticated' }) });
    const transacting = createFakeSubscriptionSource({ transactions: true });
    await renderAccess({ auth: signedOut, source: transacting });
    await expect(latest!.purchase(REQUEST)).resolves.toEqual({ kind: 'failed', reason: 'no-account' });
    await expect(latest!.restore()).resolves.toEqual({ kind: 'failed', reason: 'no-account' });
    expect(transacting.calls.purchase).toEqual([]);
    expect(transacting.calls.restore).toEqual([]);
  });

  it('refuses when the source has no transactions (not-configured)', async () => {
    const readOnly = createFakeSubscriptionSource({ offerings: true });
    await renderAccess({ source: readOnly });
    expect(latest?.store).toBeUndefined();
    await expect(latest!.purchase(REQUEST)).resolves.toEqual({ kind: 'failed', reason: 'not-configured' });
    await expect(latest!.restore()).resolves.toEqual({ kind: 'failed', reason: 'not-configured' });
  });

  it('refuses a purchase against the App Store in this phase (not-enabled), while a restore stays possible', async () => {
    const appStore = createFakeSubscriptionSource({ transactions: true, store: 'app-store' });
    appStore.respondWithRestore({ kind: 'completed', verification: NEVER });
    await renderAccess({ source: appStore });
    expect(latest?.store).toBe('app-store');
    await expect(latest!.purchase(REQUEST)).resolves.toEqual({ kind: 'failed', reason: 'not-enabled' });
    expect(appStore.calls.purchase).toEqual([]);
    let outcome: unknown;
    await act(async () => {
      outcome = await latest!.restore();
    });
    expect(outcome).toEqual({ kind: 'completed', verification: NEVER });
  });

  it('exposes the Test Store of a transacting source', async () => {
    await renderAccess();
    expect(latest?.store).toBe('test-store');
  });
});

describe('BusinessAccessProvider — one transaction at a time', () => {
  it('refuses a second purchase, and a restore, while a purchase is in flight; reports the operation; frees it after', async () => {
    const { source, purchases } = deferredSource();
    const view = await renderAccess({ source });
    let first: Promise<unknown> | undefined;
    await act(async () => {
      first = latest!.purchase(REQUEST);
    });
    expect(stateOf(view)).toBe('enforcement-disabled:unavailable:purchase');
    await expect(latest!.purchase(REQUEST)).resolves.toEqual({ kind: 'failed', reason: 'operation-in-progress' });
    await expect(latest!.restore()).resolves.toEqual({ kind: 'failed', reason: 'operation-in-progress' });
    expect(source.calls.purchase).toHaveLength(1);
    expect(source.calls.restore).toEqual([]);

    await act(async () => purchases[0]!({ kind: 'cancelled' }));
    await expect(first).resolves.toEqual({ kind: 'cancelled' });
    expect(stateOf(view)).toBe('enforcement-disabled:unavailable:idle');
    // Free again: the next purchase reaches the source.
    await act(async () => {
      void latest!.purchase(REQUEST);
    });
    expect(source.calls.purchase).toHaveLength(2);
    await act(async () => purchases[1]!({ kind: 'cancelled' }));
  });

  it('two taps in the same tick: exactly one reaches the source', async () => {
    const { source, purchases } = deferredSource();
    await renderAccess({ source });
    let outcomes: unknown[] = [];
    await act(async () => {
      const both = Promise.all([latest!.purchase(REQUEST), latest!.purchase(REQUEST)]);
      purchases[0]!({ kind: 'cancelled' });
      outcomes = await both;
    });
    expect(source.calls.purchase).toHaveLength(1);
    expect(outcomes).toEqual([{ kind: 'cancelled' }, { kind: 'failed', reason: 'operation-in-progress' }]);
  });

  it('a restore in flight blocks a purchase the same way', async () => {
    const { source, restores } = deferredSource();
    const view = await renderAccess({ source });
    let first: Promise<unknown> | undefined;
    await act(async () => {
      first = latest!.restore();
    });
    expect(stateOf(view)).toBe('enforcement-disabled:unavailable:restore');
    await expect(latest!.purchase(REQUEST)).resolves.toEqual({ kind: 'failed', reason: 'operation-in-progress' });
    await act(async () => restores[0]!({ kind: 'cancelled' }));
    await expect(first).resolves.toEqual({ kind: 'cancelled' });
    expect(stateOf(view)).toBe('enforcement-disabled:unavailable:idle');
  });

  it('a source that rejects frees the session with a failed outcome', async () => {
    const source = createFakeSubscriptionSource({ purchase: () => Promise.reject(new Error('boom')) });
    const view = await renderAccess({ source });
    let outcome: unknown;
    await act(async () => {
      outcome = await latest!.purchase(REQUEST);
    });
    expect(outcome).toEqual({ kind: 'failed', reason: 'unexpected' });
    expect(stateOf(view)).toBe('enforcement-disabled:unavailable:idle');
  });
});

describe('BusinessAccessProvider — the store answer is the newest word', () => {
  it('a verification still in flight when the purchase completes is dropped, never replacing the purchase answer', async () => {
    const verifications: ((verification: SubscriptionVerification) => void)[] = [];
    const source = createFakeSubscriptionSource({
      verify: () => new Promise((resolve) => verifications.push(resolve)),
      purchase: () => Promise.resolve({ kind: 'completed', verification: ACTIVE }),
    });
    const view = await renderAccess({ source, enforcement: 'enabled' });
    await act(async () => verifications[0]!(NEVER));
    expect(stateOf(view)).toBe('never-subscribed:verified:idle');

    // A refresh starts, then the purchase completes before the refresh answers.
    let refresh: Promise<unknown> | undefined;
    await act(async () => {
      refresh = latest!.refresh();
    });
    await act(async () => {
      await latest!.purchase(REQUEST);
    });
    expect(stateOf(view)).toBe('entitled:verified:idle');
    await act(async () => verifications[1]!(NEVER));
    await expect(refresh).resolves.toBeUndefined();
    expect(stateOf(view)).toBe('entitled:verified:idle');
    expect(latest?.verification).toEqual(ACTIVE);
  });

  it('a verification started AFTER the purchase still applies: a later store answer wins', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification: ACTIVE });
    const view = await renderAccess({ source, enforcement: 'enabled' });
    await act(async () => {
      await latest!.purchase(REQUEST);
    });
    expect(stateOf(view)).toBe('entitled:verified:idle');
    source.respondWith(verified({ kind: 'expired' }));
    await act(async () => {
      await latest!.refresh();
    });
    expect(stateOf(view)).toBe('subscription-expired:verified:idle');
  });

  it('a push from the store after the purchase goes through the same listener, unchanged', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification: UNAVAILABLE });
    const view = await renderAccess({ source, enforcement: 'enabled' });
    await act(async () => {
      await latest!.purchase(REQUEST);
    });
    expect(source.listenerCount()).toBe(1);
    await act(async () => source.emit('user-lea', ACTIVE));
    expect(stateOf(view)).toBe('entitled:verified:idle');
  });
});

describe('BusinessAccessProvider — the session changes during a transaction', () => {
  it('a sign-out during the purchase: the outcome is applied to nobody and reported as account-changed', async () => {
    const { source, purchases } = deferredSource();
    const auth = signedIn();
    const view = await renderAccess({ source, auth });
    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = latest!.purchase(REQUEST);
    });
    await act(async () => auth.emitSession(null));
    expect(stateOf(view)).toBe('enforcement-disabled:pending:purchase');
    await act(async () => purchases[0]!({ kind: 'completed', verification: ACTIVE }));
    await expect(outcome).resolves.toEqual({ kind: 'account-changed' });
    expect(stateOf(view)).toBe('enforcement-disabled:pending:idle');
    expect(latest?.verification).toBeUndefined();
  });

  it('an account switch during the purchase: the new account never receives the previous account’s result', async () => {
    const { source, purchases } = deferredSource();
    const auth = signedIn();
    const view = await renderAccess({ source, auth, enforcement: 'enabled' });
    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = latest!.purchase(REQUEST);
    });
    await act(async () => auth.emitSession(NOA));
    await act(async () => {});
    expect(source.calls.verify).toEqual(['user-lea', 'user-noa']);
    await act(async () => purchases[0]!({ kind: 'completed', verification: ACTIVE }));
    await expect(outcome).resolves.toEqual({ kind: 'account-changed' });
    // Noa's session: the fake source answers unavailable for her, and the purchase of Léa left nothing.
    expect(stateOf(view)).toBe('no-entitlement-evidence:unavailable:idle');
    expect(latest?.verification).toEqual(UNAVAILABLE);
  });

  it('a restore in flight across a sign-out is reported the same way', async () => {
    const { source, restores } = deferredSource();
    const auth = signedIn();
    await renderAccess({ source, auth });
    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = latest!.restore();
    });
    await act(async () => auth.emitSession(null));
    await act(async () => restores[0]!({ kind: 'completed', verification: ACTIVE }));
    await expect(outcome).resolves.toEqual({ kind: 'account-changed' });
    expect(latest?.verification).toBeUndefined();
  });
});

describe('BusinessAccessProvider — a restore is user-initiated only', () => {
  it('never restores at mount, on a verification, on a push or on a refresh', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(ACTIVE);
    await renderAccess({ source });
    await act(async () => {
      await latest!.refresh();
    });
    await act(async () => source.emit('user-lea', ACTIVE));
    expect(source.calls.restore).toEqual([]);
    expect(source.calls.purchase).toEqual([]);
  });

  it('applies a completed restore through the pipeline, and a confirmed absence as such', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(UNAVAILABLE);
    source.respondWithRestore({ kind: 'completed', verification: ACTIVE });
    const view = await renderAccess({ source, enforcement: 'enabled' });
    expect(stateOf(view)).toBe('no-entitlement-evidence:unavailable:idle');
    await act(async () => {
      await latest!.restore();
    });
    expect(stateOf(view)).toBe('entitled:verified:idle');
    source.respondWithRestore({ kind: 'completed', verification: NEVER });
    await act(async () => {
      await latest!.restore();
    });
    expect(stateOf(view)).toBe('never-subscribed:verified:idle');
    expect(source.calls.restore).toEqual(['user-lea', 'user-lea']);
  });
});
