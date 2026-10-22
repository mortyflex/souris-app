// BeautIzzy — the checkout hook: the provider's purchase and restore, worded
// as results by THE Plus rule (activated only for a verified entitlement in
// force), a fixture never purchasable, the session's activity reflected, a
// re-verification that starts no transaction, a result dropped after unmount.

import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import type { SubscriptionVerification } from '@/domain/access';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';

import type { PaywallOffering } from '../../paywall/paywall-offering';
import { paywallOfferingFixtures } from '../../paywall/testing/paywall-fixtures';
import type { StorePurchaseOutcome, SubscriptionSource } from '../../subscription-source';
import { createFakeSubscriptionSource } from '../../testing/fake-subscription-source';
import { BusinessAccessProvider } from '../BusinessAccessProvider';
import { usePlusCheckout, type PlusCheckoutResult, type PlusCheckoutSession } from '../use-plus-checkout';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const FUTURE = new Date('2026-11-01T09:00:00.000Z');
const PAST = new Date('2026-10-01T09:00:00.000Z');

const ACTIVE: SubscriptionVerification = { kind: 'verified', status: { kind: 'active', plan: 'annual', expiresAt: FUTURE } };
const LAPSED: SubscriptionVerification = { kind: 'verified', status: { kind: 'active', plan: 'annual', expiresAt: PAST } };
const NEVER: SubscriptionVerification = { kind: 'verified', status: { kind: 'never' } };
const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

const STORE_OFFERING: PaywallOffering = {
  status: 'available',
  reference: 'offering-7',
  plans: [{ plan: 'annual', price: { amount: 49.99, currencyCode: 'USD', formatted: '$49.99' } }],
};

let latest: PlusCheckoutSession | undefined;

function Probe() {
  const session = usePlusCheckout({ clock: () => NOW });
  useEffect(() => {
    latest = session;
  });
  return <Text testID="checkout">{`${session.activity ?? 'idle'}:${session.entitled ? 'plus' : 'none'}:${session.store ?? 'no-store'}`}</Text>;
}

function Host({ source, auth }: { readonly source: SubscriptionSource; readonly auth: FakeAuthGateway }) {
  const [mounted, setMounted] = useState(true);
  return (
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement="disabled" source={source} clock={() => NOW}>
        <Pressable accessibilityLabel="Démonter" onPress={() => setMounted(false)} />
        {mounted && <Probe />}
      </BusinessAccessProvider>
    </AuthProvider>
  );
}

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

async function renderCheckout(source: SubscriptionSource, auth = signedIn()) {
  latest = undefined;
  const view = await render(<Host source={source} auth={auth} />);
  await act(async () => {});
  return view;
}

type View = Awaited<ReturnType<typeof renderCheckout>>;
const stateOf = (view: View) => view.getByTestId('checkout').props.children as string;

async function run(action: () => Promise<PlusCheckoutResult | undefined>) {
  let result: PlusCheckoutResult | undefined;
  await act(async () => {
    result = await action();
  });
  return result;
}

describe('usePlusCheckout — purchase', () => {
  it('reads the session: no activity, not entitled, the Test Store', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    const view = await renderCheckout(source);
    expect(stateOf(view)).toBe('idle:none:test-store');
    expect(latest?.authenticated).toBe(true);
  });

  it('buys the plan of the store offering by its reference, and reports activated for a verified entitlement', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification: ACTIVE });
    const view = await renderCheckout(source);
    const result = await run(() => latest!.purchase(STORE_OFFERING, 'annual'));
    expect(result).toEqual({ kind: 'activated' });
    expect(source.calls.purchase).toEqual([{ userId: 'user-lea', request: { reference: 'offering-7', plan: 'annual' } }]);
    expect(stateOf(view)).toBe('idle:plus:test-store');
  });

  it.each([
    ['unavailable', UNAVAILABLE],
    ['confirmed absence', NEVER],
    ['already lapsed', LAPSED],
  ])('a completed purchase with an inconclusive answer (%s) is received, never activated', async (_label, verification) => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(NEVER);
    source.respondWithPurchase({ kind: 'completed', verification });
    const view = await renderCheckout(source);
    expect(await run(() => latest!.purchase(STORE_OFFERING, 'annual'))).toEqual({ kind: 'received' });
    expect(stateOf(view)).toBe('idle:none:test-store');
  });

  it.each([
    [{ kind: 'cancelled' }, { kind: 'cancelled' }],
    [{ kind: 'pending' }, { kind: 'deferred' }],
    [{ kind: 'failed', reason: 'network' }, { kind: 'failed', operation: 'purchase', reason: 'network' }],
  ] as const)('maps the outcome %o to the result %o', async (outcome, expected) => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWithPurchase(outcome);
    await renderCheckout(source);
    expect(await run(() => latest!.purchase(STORE_OFFERING, 'annual'))).toEqual(expected);
  });

  it('never buys from an offering without a store reference — a fixture, a loading or unavailable one', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    await renderCheckout(source);
    for (const offering of [paywallOfferingFixtures.frenchWithTrial, paywallOfferingFixtures.loading, paywallOfferingFixtures.storeUnavailable]) {
      expect(await run(() => latest!.purchase(offering, 'annual'))).toEqual({ kind: 'failed', operation: 'purchase', reason: 'stale-offering' });
    }
    expect(source.calls.purchase).toEqual([]);
  });

  it('reflects the session’s transaction as its activity while it runs', async () => {
    let release: ((outcome: StorePurchaseOutcome) => void) | undefined;
    const source = createFakeSubscriptionSource({ purchase: () => new Promise((resolve) => (release = resolve)) });
    const view = await renderCheckout(source);
    let pending: Promise<PlusCheckoutResult | undefined> | undefined;
    await act(async () => {
      pending = latest!.purchase(STORE_OFFERING, 'annual');
    });
    expect(stateOf(view)).toBe('purchasing:none:test-store');
    await act(async () => release!({ kind: 'cancelled' }));
    await expect(pending).resolves.toEqual({ kind: 'cancelled' });
    expect(stateOf(view)).toBe('idle:none:test-store');
  });

  it('reports account-changed when the session changed meanwhile', async () => {
    let release: ((outcome: StorePurchaseOutcome) => void) | undefined;
    const source = createFakeSubscriptionSource({ purchase: () => new Promise((resolve) => (release = resolve)) });
    const auth = signedIn();
    await renderCheckout(source, auth);
    let pending: Promise<PlusCheckoutResult | undefined> | undefined;
    await act(async () => {
      pending = latest!.purchase(STORE_OFFERING, 'annual');
    });
    await act(async () => auth.emitSession(null));
    await act(async () => release!({ kind: 'completed', verification: ACTIVE }));
    await expect(pending).resolves.toEqual({ kind: 'account-changed' });
  });

  it('drops the result once the screen unmounted; the provider still applied it', async () => {
    let release: ((outcome: StorePurchaseOutcome) => void) | undefined;
    const source = createFakeSubscriptionSource({ purchase: () => new Promise((resolve) => (release = resolve)) });
    const view = await renderCheckout(source);
    let pending: Promise<PlusCheckoutResult | undefined> | undefined;
    await act(async () => {
      pending = latest!.purchase(STORE_OFFERING, 'annual');
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      fireEvent.press(view.getByLabelText('Démonter'));
    });
    await act(async () => release!({ kind: 'completed', verification: ACTIVE }));
    await expect(pending).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('usePlusCheckout — restore and re-verification', () => {
  it.each([
    [ACTIVE, { kind: 'restored' }],
    [NEVER, { kind: 'nothing-to-restore' }],
    [UNAVAILABLE, { kind: 'restore-received' }],
    [LAPSED, { kind: 'restore-received' }],
  ])('words a completed restore answering %o as %o', async (verification, expected) => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWithRestore({ kind: 'completed', verification });
    await renderCheckout(source);
    expect(await run(() => latest!.restore())).toEqual(expected);
    expect(source.calls.restore).toEqual(['user-lea']);
  });

  it.each([
    [{ kind: 'cancelled' }, { kind: 'cancelled' }],
    [{ kind: 'failed', reason: 'store-problem' }, { kind: 'failed', operation: 'restore', reason: 'store-problem' }],
  ] as const)('maps the restore outcome %o to %o', async (outcome, expected) => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWithRestore(outcome);
    await renderCheckout(source);
    expect(await run(() => latest!.restore())).toEqual(expected);
  });

  it('never restores on its own: mounting, rendering and verifying call nothing', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(ACTIVE);
    await renderCheckout(source);
    await run(() => latest!.retryVerification());
    expect(source.calls.restore).toEqual([]);
    expect(source.calls.purchase).toEqual([]);
  });

  it('retryVerification asks the provider to verify again — no transaction — and words the new answer', async () => {
    const source = createFakeSubscriptionSource({ transactions: true });
    source.respondWith(UNAVAILABLE);
    const view = await renderCheckout(source);
    expect(await run(() => latest!.retryVerification())).toEqual({ kind: 'received' });
    source.respondWith(ACTIVE);
    expect(await run(() => latest!.retryVerification())).toEqual({ kind: 'activated' });
    expect(stateOf(view)).toBe('idle:plus:test-store');
    expect(source.calls.verify).toEqual(['user-lea', 'user-lea', 'user-lea']);
    expect(source.calls.purchase).toEqual([]);
    expect(source.calls.restore).toEqual([]);
  });

  it('shows verifying while the re-verification runs', async () => {
    const answers: ((verification: SubscriptionVerification) => void)[] = [];
    const source = createFakeSubscriptionSource({ transactions: true, verify: () => new Promise((resolve) => answers.push(resolve)) });
    const view = await renderCheckout(source);
    await act(async () => answers[0]!(UNAVAILABLE));
    let pending: Promise<PlusCheckoutResult | undefined> | undefined;
    await act(async () => {
      pending = latest!.retryVerification();
    });
    expect(stateOf(view)).toBe('verifying:none:test-store');
    await act(async () => answers[1]!(ACTIVE));
    await expect(pending).resolves.toEqual({ kind: 'activated' });
    expect(stateOf(view)).toBe('idle:plus:test-store');
  });
});
