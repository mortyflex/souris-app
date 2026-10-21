// BeautIzzy — the offering hook: one request per signed-in user through the
// provider's `loadOffering`, an explicit loading / unavailable / available
// state, nothing leaking across accounts, a late answer never applied after
// a sign-out, an account switch or an unmount, no request on a render, and
// no purchase anywhere.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';

import type { PaywallOffering, StorePaywallOffering } from '../../paywall/paywall-offering';
import { unconfiguredSubscriptionSource, type SubscriptionSource } from '../../subscription-source';
import { createFakeSubscriptionSource } from '../../testing/fake-subscription-source';
import { BusinessAccessProvider } from '../BusinessAccessProvider';
import { usePaywallOffering, type PaywallOfferingSession } from '../use-paywall-offering';

const NOA = { id: 'user-noa', email: 'noa@example.com' };

const EUR_PLANS: StorePaywallOffering = {
  status: 'available',
  plans: [{ plan: 'annual', price: { amount: 99, currencyCode: 'EUR', formatted: '99,00 €' } }],
};
const USD_PLANS: StorePaywallOffering = {
  status: 'available',
  plans: [{ plan: 'monthly', price: { amount: 4.99, currencyCode: 'USD', formatted: '$4.99' } }],
};

let latest: PaywallOfferingSession | undefined;
let renders = 0;

function Probe() {
  const session = usePaywallOffering();
  useEffect(() => {
    latest = session;
    renders += 1;
  });
  return <Text testID="offering">{label(session.offering)}</Text>;
}

function label(offering: PaywallOffering): string {
  if (offering.status === 'available') return `available:${offering.plans.map((plan) => plan.price.formatted).join('+')}`;
  if (offering.status === 'unavailable') return `unavailable:${offering.reason}`;
  return 'loading';
}

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });

async function renderHook({
  auth = signedIn(),
  source = createFakeSubscriptionSource({ offerings: true }),
}: { readonly auth?: FakeAuthGateway; readonly source?: SubscriptionSource } = {}) {
  latest = undefined;
  renders = 0;
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement="disabled" source={source}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await act(async () => {});
  return view;
}

type View = Awaited<ReturnType<typeof renderHook>>;
const stateOf = (view: View) => view.getByTestId('offering').props.children as string;

/** A source whose offering answers are released by the test, in order. */
function deferredSource() {
  const resolvers: ((value: StorePaywallOffering) => void)[] = [];
  const requested: string[] = [];
  const source = createFakeSubscriptionSource({
    loadOffering: (userId) =>
      new Promise((resolve) => {
        requested.push(userId);
        resolvers.push(resolve);
      }),
  });
  return { source, resolvers, requested };
}

describe('usePaywallOffering', () => {
  it('loads the offering of the signed-in user once, through the provider, and exposes it', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering(EUR_PLANS);
    const view = await renderHook({ source });
    expect(stateOf(view)).toBe('available:99,00 €');
    expect(source.calls.loadOffering).toEqual(['user-lea']);
  });

  it('is loading while the store is asked, then available', async () => {
    const { source, resolvers } = deferredSource();
    const view = await renderHook({ source });
    expect(stateOf(view)).toBe('loading');
    await act(async () => resolvers[0]!(EUR_PLANS));
    expect(stateOf(view)).toBe('available:99,00 €');
  });

  it('answers not-configured without a store adapter, and never asks', async () => {
    const view = await renderHook({ source: unconfiguredSubscriptionSource });
    expect(stateOf(view)).toBe('unavailable:not-configured');
    const bare = createFakeSubscriptionSource();
    const other = await renderHook({ source: bare });
    expect(stateOf(other)).toBe('unavailable:not-configured');
    expect(bare.calls.loadOffering).toEqual([]);
  });

  it('answers store-unavailable when the source says so, and when it rejects', async () => {
    const view = await renderHook({ source: createFakeSubscriptionSource({ offerings: true }) });
    expect(stateOf(view)).toBe('unavailable:store-unavailable');
    const rejecting = createFakeSubscriptionSource({ loadOffering: () => Promise.reject(new Error('boom')) });
    const other = await renderHook({ source: rejecting });
    expect(stateOf(other)).toBe('unavailable:store-unavailable');
  });

  it('answers no-account while nobody is signed in, and never asks the store', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering(EUR_PLANS);
    const view = await renderHook({ auth: createFakeAuthGateway(), source });
    expect(stateOf(view)).toBe('unavailable:no-account');
    expect(source.calls.loadOffering).toEqual([]);
  });

  it('does not ask the store again on a re-render', async () => {
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering(EUR_PLANS);
    const view = await renderHook({ source });
    const before = source.calls.loadOffering.length;
    await act(async () => {
      view.rerender(
        <AuthProvider gateway={signedIn()}>
          <BusinessAccessProvider enforcement="disabled" source={source}>
            <Probe />
          </BusinessAccessProvider>
        </AuthProvider>,
      );
    });
    expect(renders).toBeGreaterThan(1);
    expect(source.calls.loadOffering).toHaveLength(before);
  });

  it('asks again on retry, and shows loading meanwhile', async () => {
    const { source, resolvers, requested } = deferredSource();
    const view = await renderHook({ source });
    await act(async () => resolvers[0]!({ status: 'unavailable', reason: 'store-unavailable' }));
    expect(stateOf(view)).toBe('unavailable:store-unavailable');
    await act(async () => latest?.retry());
    expect(stateOf(view)).toBe('loading');
    await act(async () => resolvers[1]!(EUR_PLANS));
    expect(stateOf(view)).toBe('available:99,00 €');
    expect(requested).toEqual(['user-lea', 'user-lea']);
  });

  it('a sign-out during loading drops the answer: nothing of the previous user leaks', async () => {
    const auth = signedIn();
    const { source, resolvers } = deferredSource();
    const view = await renderHook({ auth, source });
    expect(stateOf(view)).toBe('loading');
    await act(async () => auth.emitSession(null));
    expect(stateOf(view)).toBe('unavailable:no-account');
    await act(async () => resolvers[0]!(EUR_PLANS));
    expect(stateOf(view)).toBe('unavailable:no-account');
  });

  it('an account switch during loading drops the first user’s answer and loads the second user’s', async () => {
    const auth = signedIn();
    const { source, resolvers, requested } = deferredSource();
    const view = await renderHook({ auth, source });
    await act(async () => auth.emitSession(NOA));
    expect(stateOf(view)).toBe('loading');
    expect(requested).toEqual(['user-lea', 'user-noa']);
    // The late answer for Léa lands nowhere…
    await act(async () => resolvers[0]!(EUR_PLANS));
    expect(stateOf(view)).toBe('loading');
    // …and Noa gets Noa's.
    await act(async () => resolvers[1]!(USD_PLANS));
    expect(stateOf(view)).toBe('available:$4.99');
  });

  it('never shows the previous user’s offering to a user who signs in next', async () => {
    const auth = signedIn();
    const source = createFakeSubscriptionSource({ offerings: true });
    source.respondWithOffering(EUR_PLANS);
    const view = await renderHook({ auth, source });
    expect(stateOf(view)).toBe('available:99,00 €');
    await act(async () => auth.emitSession(null));
    expect(stateOf(view)).toBe('unavailable:no-account');
    source.respondWithOffering(USD_PLANS);
    await act(async () => auth.emitSession(NOA));
    expect(stateOf(view)).toBe('available:$4.99');
    expect(source.calls.loadOffering).toEqual(['user-lea', 'user-noa']);
  });

  it('ignores a late answer after unmount without warnings', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { source, resolvers } = deferredSource();
    const view = await renderHook({ source });
    await act(async () => {
      view.unmount();
    });
    await act(async () => resolvers[0]!(EUR_PLANS));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('is required inside the access provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <AuthProvider gateway={signedIn()}>
          <Probe />
        </AuthProvider>,
      ),
    ).rejects.toThrow('useBusinessAccess must be used inside BusinessAccessProvider');
    jest.restoreAllMocks();
  });
});
