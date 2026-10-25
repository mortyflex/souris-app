// BeautIzzy — the real source under the real provider: the SDK is identified
// with the signed-in Supabase user, sign-out exposes nothing and switches no
// identity, another account is switched to with logIn and reads its own
// answer, the foreground refresh re-verifies without a second configure, a
// store push reaches the session, and enforcement disabled keeps full access
// whatever RevenueCat says.

import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { BusinessAccessProvider, useBusinessAccess, type BusinessAccessValue } from '@/features/access/session/BusinessAccessProvider';
import { usePlusCheckout, type PlusCheckoutResult, type PlusCheckoutSession } from '@/features/access/session/use-plus-checkout';
import { usePaywallOffering, type PaywallOfferingSession } from '@/features/access/session/use-paywall-offering';
import { SubscriptionStatusSection } from '@/features/access/status/SubscriptionStatusSection';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { HomeHeader } from '@/features/home/components/HomeHeader';

import { PURCHASES_ERROR_CODE, type MakePurchaseResult } from '../sdk';
import { createRevenueCatSubscriptionSource } from '../subscription-source';
import { customerInfo, NEXT_MONTH, NOW, plusEntitlement } from '../testing/customer-info-fixtures';
import { createFakeRevenueCatSdk, makePurchaseResult, purchasesError, type FakeRevenueCatSdk } from '../testing/fake-revenuecat-sdk';
import { appStoreOfferings, testStoreOfferings } from '../testing/offering-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const API_KEY = 'test_FakeTestStoreKeyForUnitTestsOnly';
const LEA = fakeUser.id;
const NOA = 'user-noa';

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

const appStateListeners = new Set<(state: AppStateStatus) => void>();

const settle = () => act(async () => {});

async function foreground() {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener('active');
  });
}

function scriptedSdk(): FakeRevenueCatSdk {
  const sdk = createFakeRevenueCatSdk();
  sdk.setCustomerInfo(LEA, customerInfo({ originalAppUserId: LEA }));
  sdk.setCustomerInfo(NOA, customerInfo({ plus: null, originalAppUserId: NOA }));
  return sdk;
}

async function renderAccess(sdk: FakeRevenueCatSdk, auth: FakeAuthGateway, enforcement: 'enabled' | 'disabled' = 'enabled') {
  const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={enforcement} source={source} clock={() => NOW}>
        <Probe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await settle();
  await settle();
  return view;
}

type RenderedView = Awaited<ReturnType<typeof render>>;
const stateOf = (view: RenderedView) => view.getByTestId('access-state').props.children;

const signedIn = () => createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
const signedOut = () => createFakeAuthGateway({ restore: async () => ({ kind: 'unauthenticated' }) });

describe('BusinessAccessProvider with the RevenueCat source', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    latest = undefined;
    appStateListeners.clear();
    jest.restoreAllMocks();
  });

  it('identifies the SDK with the signed-in Supabase user id, once, and resolves access from its answer', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedIn());
    expect(stateOf(view)).toBe('full:entitled:write:verified');
    expect(sdk.calls.configure).toEqual([{ apiKey: API_KEY, appUserID: LEA }]);
    expect(sdk.calls.logIn).toEqual([]);
    expect(sdk.listenerCount()).toBe(1);
  });

  it('touches the SDK in no way while nobody is signed in', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedOut());
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(sdk.calls.configure).toEqual([]);
    expect(sdk.calls.getCustomerInfo).toBe(0);
    expect(sdk.listenerCount()).toBe(0);
  });

  it('on sign-out exposes nothing, releases the SDK listener and creates no anonymous identity; the next account is switched to with logIn', async () => {
    const sdk = scriptedSdk();
    const auth = signedIn();
    const view = await renderAccess(sdk, auth);
    expect(stateOf(view)).toBe('full:entitled:write:verified');

    await act(async () => auth.emitSession(null));
    await settle();
    expect(stateOf(view)).toBe('read-only:no-entitlement-evidence:read:pending');
    expect(latest?.verification).toBeUndefined();
    expect(sdk.listenerCount()).toBe(0);
    expect(sdk.appUserId()).toBe(LEA);

    await act(async () => auth.emitSession({ id: NOA }));
    await settle();
    await settle();
    expect(stateOf(view)).toBe('read-only:never-subscribed:read:verified');
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.logIn).toEqual([NOA]);
    expect(sdk.appUserId()).toBe(NOA);
    expect(sdk.listenerCount()).toBe(1);
  });

  it('re-verifies on return to the foreground without configuring again', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedIn());
    const reads = sdk.calls.getCustomerInfo;
    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ isActive: false }) }));
    await foreground();
    await settle();
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
    expect(sdk.calls.getCustomerInfo).toBe(reads + 1);
    expect(sdk.calls.configure).toHaveLength(1);
  });

  it('applies a store push to the session as a fresh re-read', async () => {
    const sdk = scriptedSdk();
    const view = await renderAccess(sdk, signedIn());
    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ isActive: false }) }));
    await act(async () => sdk.emit(customerInfo()));
    await settle();
    expect(stateOf(view)).toBe('read-only:subscription-expired:read:verified');
  });

  it.each([
    ['active', customerInfo()],
    ['trial', customerInfo({ plus: plusEntitlement({ periodType: 'TRIAL' }) })],
    ['expired', customerInfo({ plus: plusEntitlement({ isActive: false }) })],
    ['never', customerInfo({ plus: null })],
    ['unavailable', undefined],
  ])('keeps full access under enforcement disabled when RevenueCat answers %s — the production state', async (_label, answer) => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo(LEA, answer);
    const view = await renderAccess(sdk, signedIn(), SUBSCRIPTION_ENFORCEMENT);
    expect(stateOf(view)).toMatch(/^full:enforcement-disabled:write:/);
  });
});

// ---------------------------------------------------------------------------
// End to end (Phase 6.3): the real source over the fake SDK, the real
// provider, the real checkout hook, the real Accueil header and « Mon
// abonnement ». A Test Store purchase ends with the badge and the active
// status through the existing pipeline — THE rule `hasVerifiedPlusEntitlement`
// — or with nothing, when the store confirmed nothing.
// ---------------------------------------------------------------------------

let checkout: PlusCheckoutSession | undefined;
let offeringSession: PaywallOfferingSession | undefined;

function CheckoutProbe() {
  const session = usePlusCheckout({ clock: () => NOW });
  const offering = usePaywallOffering();
  useEffect(() => {
    checkout = session;
    offeringSession = offering;
  });
  return null;
}

async function renderProduct(sdk: FakeRevenueCatSdk, auth: FakeAuthGateway) {
  const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
  const view = await render(
    <AuthProvider gateway={auth}>
      <BusinessAccessProvider enforcement={SUBSCRIPTION_ENFORCEMENT} source={source} clock={() => NOW}>
        <HomeHeader clock={() => NOW} />
        <SubscriptionStatusSection clock={() => NOW} />
        <Probe />
        <CheckoutProbe />
      </BusinessAccessProvider>
    </AuthProvider>,
  );
  await settle();
  await settle();
  return view;
}

const purchased = (info: ReturnType<typeof customerInfo>, productIdentifier: string): MakePurchaseResult =>
  makePurchaseResult(info, productIdentifier, NOW);

/** A Test Store product in the `plus` record: the plan stays unknown, the access does not depend on it. */
const testStoreEntitlement = (overrides: Parameters<typeof plusEntitlement>[0] = {}) =>
  plusEntitlement({ productIdentifier: testStoreOfferings.current!.annual!.product.identifier, store: 'TEST_STORE' as never, ...overrides });

async function runCheckout(action: () => Promise<PlusCheckoutResult | undefined>) {
  let result: PlusCheckoutResult | undefined;
  await act(async () => {
    result = await action();
  });
  await settle();
  return result;
}

describe('Test Store purchase — the whole chain (Phase 6.3)', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    latest = undefined;
    checkout = undefined;
    offeringSession = undefined;
    appStateListeners.clear();
    jest.restoreAllMocks();
  });

  function neverSubscribedSdk() {
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo(LEA, customerInfo({ plus: null, originalAppUserId: LEA }));
    sdk.setOfferings(LEA, testStoreOfferings);
    return sdk;
  }

  it('a verified Test Store purchase: the ORIGINAL package is bought, the badge appears on Accueil and « Mon abonnement » reads active — through the existing pipeline', async () => {
    const sdk = neverSubscribedSdk();
    sdk.scriptPurchase(LEA, (pkg) => {
      const info = customerInfo({ plus: testStoreEntitlement(), originalAppUserId: LEA });
      sdk.setCustomerInfo(LEA, info);
      sdk.emit(info); // the SDK fires its update event after a purchase
      return Promise.resolve(purchased(info, pkg.product.identifier));
    });
    const view = await renderProduct(sdk, signedIn());
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(view.getByText('Aucun abonnement actif')).toBeTruthy();
    await act(async () => {});
    const offering = offeringSession!.offering;
    expect(offering.status === 'available' && offering.reference).toBe('offering-1');

    const result = await runCheckout(() => checkout!.purchase(offering, 'annual'));
    expect(result).toEqual({ kind: 'activated' });
    expect(sdk.calls.purchasePackage).toHaveLength(1);
    expect(sdk.calls.purchasePackage[0]!.pkg).toBe(testStoreOfferings.current!.annual);
    expect(sdk.calls.purchasePackage[0]!.appUserId).toBe(LEA);
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.listenerCount()).toBe(1);

    // Accueil: the « Plus » mark, from the verification only (enforcement is disabled: access never changed).
    expect(view.getByTestId('home-plus-mark')).toBeTruthy();
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
    // « Mon abonnement »: active, the period end, no plan (a Test Store product establishes none).
    expect(view.getByText('Abonnement actif')).toBeTruthy();
    expect(view.getByText(/Période en cours jusqu’au 21 novembre 2026/)).toBeTruthy();
    expect(view.queryByText('Annuel')).toBeNull();
    expect(latest?.verification).toEqual({ kind: 'verified', status: { kind: 'active', plan: 'unknown', expiresAt: NEXT_MONTH } });
    expect(checkout?.entitled).toBe(true);
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
  });

  it('a cancelled purchase: no badge, « Mon abonnement » unchanged, the account untouched', async () => {
    const sdk = neverSubscribedSdk();
    sdk.scriptPurchase(LEA, () => Promise.reject(purchasesError(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)));
    const view = await renderProduct(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual'))).toEqual({ kind: 'cancelled' });
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(view.getByText('Aucun abonnement actif')).toBeTruthy();
    expect(latest?.verification).toEqual({ kind: 'verified', status: { kind: 'never' } });
  });

  it('a completed purchase the store cannot confirm yet: no badge, a neutral status, then the badge once a re-verification confirms', async () => {
    const sdk = neverSubscribedSdk();
    const stale = new Date(NOW.getTime() - 10 * 60 * 1000);
    sdk.scriptPurchase(LEA, (pkg) =>
      Promise.resolve(purchased(customerInfo({ plus: testStoreEntitlement(), originalAppUserId: LEA, requestDate: stale }), pkg.product.identifier)),
    );
    const view = await renderProduct(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual'))).toEqual({ kind: 'received' });
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(view.getByText('Abonnement non vérifié')).toBeTruthy();

    // The store now answers fresh: « Vérifier à nouveau » — one verification, no second purchase.
    sdk.setCustomerInfo(LEA, customerInfo({ plus: testStoreEntitlement(), originalAppUserId: LEA }));
    expect(await runCheckout(() => checkout!.retryVerification())).toEqual({ kind: 'activated' });
    expect(sdk.calls.purchasePackage).toHaveLength(1);
    expect(view.getByTestId('home-plus-mark')).toBeTruthy();
    expect(view.getByText('Abonnement actif')).toBeTruthy();
  });

  it('a sign-out during the purchase sheet: nothing of the result reaches the empty session, and the next account reads its own answer', async () => {
    const sdk = neverSubscribedSdk();
    sdk.setCustomerInfo(NOA, customerInfo({ plus: null, originalAppUserId: NOA }));
    let finish: ((pkg: { product: { identifier: string } }) => void) | undefined;
    sdk.scriptPurchase(
      LEA,
      (pkg) =>
        new Promise((resolve) => {
          finish = () => {
            const info = customerInfo({ plus: testStoreEntitlement(), originalAppUserId: LEA });
            sdk.setCustomerInfo(LEA, info);
            resolve(purchased(info, pkg.product.identifier));
          };
        }),
    );
    const auth = signedIn();
    const view = await renderProduct(sdk, auth);
    await act(async () => {});
    let pending: Promise<PlusCheckoutResult | undefined> | undefined;
    await act(async () => {
      pending = checkout!.purchase(offeringSession!.offering, 'annual');
    });
    await act(async () => auth.emitSession(null));
    await act(async () => auth.emitSession({ id: NOA, email: 'noa@example.com' }));
    await settle();
    await act(async () => finish!({ product: { identifier: '' } }));
    await settle();
    await expect(pending).resolves.toEqual({ kind: 'account-changed' });
    // Noa: her own answer (never), no badge; the switch to her waited for the transaction.
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(view.getByText('Aucun abonnement actif')).toBeTruthy();
    expect(sdk.calls.logIn).toEqual([NOA]);
    expect(sdk.calls.purchasePackage[0]!.appUserId).toBe(LEA);
  });

  it('a user-initiated restore with a Test Store entitlement reaches the badge the same way; nothing restores by itself', async () => {
    const sdk = neverSubscribedSdk();
    const view = await renderProduct(sdk, signedIn());
    await foreground();
    await settle();
    expect(sdk.calls.restorePurchases).toEqual([]);
    sdk.setCustomerInfo(LEA, customerInfo({ plus: testStoreEntitlement(), originalAppUserId: LEA }));
    expect(await runCheckout(() => checkout!.restore())).toEqual({ kind: 'restored' });
    expect(sdk.calls.restorePurchases).toEqual([LEA]);
    expect(view.getByTestId('home-plus-mark')).toBeTruthy();
    expect(view.getByText('Abonnement actif')).toBeTruthy();
  });

  it('an App Store offering bought in the Test Store flow is refused by nothing here, but the plan is read from the product only', async () => {
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo(LEA, customerInfo({ plus: null, originalAppUserId: LEA }));
    sdk.setOfferings(LEA, appStoreOfferings);
    sdk.scriptPurchase(LEA, (pkg) => {
      const info = customerInfo({ plus: plusEntitlement({ productIdentifier: pkg.product.identifier }), originalAppUserId: LEA });
      sdk.setCustomerInfo(LEA, info);
      return Promise.resolve(purchased(info, pkg.product.identifier));
    });
    const view = await renderProduct(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual'))).toEqual({ kind: 'activated' });
    expect(view.getByText('Annuel')).toBeTruthy();
    expect(latest?.verification).toEqual({ kind: 'verified', status: { kind: 'active', plan: 'annual', expiresAt: NEXT_MONTH } });
  });
});

// ---------------------------------------------------------------------------
// End to end (Phase 6.4B): the real source in Apple Sandbox mode over the fake
// SDK, the real provider, the real checkout hook, Accueil and « Mon
// abonnement ». The explicit Apple Sandbox test of a declared account buys the
// ORIGINAL App Store package; the CustomerInfo the store answers is applied
// through the existing pipeline — the `plus` entitlement is recognized, the
// plan is read from the exact App Store product — and the post-purchase SDK
// event follows the listener path. A product purchase, an undeclared account
// or a release-shaped source transacts nothing.
// ---------------------------------------------------------------------------

describe('Apple Sandbox test — the whole chain (Phase 6.4B)', () => {
  const APPLE_KEY = 'appl_FakeAppleKeyForUnitTestsOnly';
  const TESTER_MODE = { testAccounts: [fakeUser.email!.toLowerCase()] };

  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    latest = undefined;
    checkout = undefined;
    offeringSession = undefined;
    appStateListeners.clear();
    jest.restoreAllMocks();
  });

  function appStoreSdk() {
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo(LEA, customerInfo({ plus: null, originalAppUserId: LEA }));
    sdk.setOfferings(LEA, appStoreOfferings);
    return sdk;
  }

  async function renderSandbox(
    sdk: FakeRevenueCatSdk,
    auth: FakeAuthGateway,
    { mode }: { readonly mode: { readonly testAccounts: readonly string[] } | undefined } = { mode: TESTER_MODE },
  ) {
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: APPLE_KEY, store: 'app-store', appleSandbox: mode, clock: () => NOW });
    const view = await render(
      <AuthProvider gateway={auth}>
        <BusinessAccessProvider enforcement={SUBSCRIPTION_ENFORCEMENT} source={source} clock={() => NOW}>
          <HomeHeader clock={() => NOW} />
          <SubscriptionStatusSection clock={() => NOW} />
          <Probe />
          <CheckoutProbe />
        </BusinessAccessProvider>
      </AuthProvider>,
    );
    await settle();
    await settle();
    return view;
  }

  it('a verified Apple Sandbox purchase of the annual plan: the ORIGINAL App Store package, the `plus` entitlement recognized with its plan, the badge and the active status', async () => {
    const sdk = appStoreSdk();
    sdk.scriptPurchase(LEA, (pkg) => {
      const info = customerInfo({ plus: plusEntitlement({ productIdentifier: pkg.product.identifier }), originalAppUserId: LEA });
      sdk.setCustomerInfo(LEA, info);
      sdk.emit(info); // the SDK fires its update event after a purchase
      return Promise.resolve(purchased(info, pkg.product.identifier));
    });
    const view = await renderSandbox(sdk, signedIn());
    expect(sdk.calls.configure).toEqual([{ apiKey: APPLE_KEY, appUserID: LEA }]);
    expect(checkout?.appleSandbox).toBe(true);
    expect(checkout?.dedicatedTestAccount).toBe(true);
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    await act(async () => {});
    const offering = offeringSession!.offering;
    expect(offering.status === 'available' && offering.reference).toBe('offering-1');

    const result = await runCheckout(() => checkout!.purchase(offering, 'annual', 'apple-sandbox-test'));
    expect(result).toEqual({ kind: 'activated' });
    expect(sdk.calls.purchasePackage).toHaveLength(1);
    expect(sdk.calls.purchasePackage[0]!.pkg).toBe(appStoreOfferings.current!.annual);
    expect(sdk.calls.purchasePackage[0]!.appUserId).toBe(LEA);
    expect(sdk.calls.restorePurchases).toEqual([]);
    expect(sdk.listenerCount()).toBe(1);

    expect(view.getByTestId('home-plus-mark')).toBeTruthy();
    expect(view.getByText('Abonnement actif')).toBeTruthy();
    expect(view.getByText('Annuel')).toBeTruthy();
    expect(latest?.verification).toEqual({ kind: 'verified', status: { kind: 'active', plan: 'annual', expiresAt: NEXT_MONTH } });
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
  });

  it('a trial started in the Sandbox is recognized as a trial through the same pipeline', async () => {
    const sdk = appStoreSdk();
    sdk.scriptPurchase(LEA, (pkg) => {
      const info = customerInfo({ plus: plusEntitlement({ productIdentifier: pkg.product.identifier, periodType: 'TRIAL' }), originalAppUserId: LEA });
      sdk.setCustomerInfo(LEA, info);
      return Promise.resolve(purchased(info, pkg.product.identifier));
    });
    const view = await renderSandbox(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'monthly', 'apple-sandbox-test'))).toEqual({ kind: 'activated' });
    expect(sdk.calls.purchasePackage[0]!.pkg).toBe(appStoreOfferings.current!.monthly);
    expect(view.getByTestId('home-plus-mark')).toBeTruthy();
    expect(latest?.verification).toMatchObject({ kind: 'verified', status: { kind: 'trial', plan: 'monthly' } });
  });

  it('a cancelled Sandbox purchase sheet: no badge, the status unchanged, no record made up', async () => {
    const sdk = appStoreSdk();
    sdk.scriptPurchase(LEA, () => Promise.reject(purchasesError(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)));
    const view = await renderSandbox(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual', 'apple-sandbox-test'))).toEqual({ kind: 'cancelled' });
    expect(sdk.calls.purchasePackage).toHaveLength(1);
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(view.getByText('Aucun abonnement actif')).toBeTruthy();
    expect(latest?.verification).toEqual({ kind: 'verified', status: { kind: 'never' } });
  });

  it.each([
    [PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR, { kind: 'deferred' }],
    [PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR, { kind: 'failed', operation: 'purchase', reason: 'store-problem' }],
    [PURCHASES_ERROR_CODE.NETWORK_ERROR, { kind: 'failed', operation: 'purchase', reason: 'network' }],
    [PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR, { kind: 'failed', operation: 'purchase', reason: 'network' }],
    [PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR, { kind: 'failed', operation: 'purchase', reason: 'not-allowed' }],
    [PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR, { kind: 'failed', operation: 'purchase', reason: 'already-owned' }],
  ] as const)('the SDK rejection %s is worded as %o and grants nothing', async (code, expected) => {
    const sdk = appStoreSdk();
    sdk.scriptPurchase(LEA, () => Promise.reject(purchasesError(code)));
    const view = await renderSandbox(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual', 'apple-sandbox-test'))).toEqual(expected);
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(checkout?.entitled).toBe(false);
  });

  it('a product purchase, an undeclared account or a release-shaped source never reaches the SDK', async () => {
    const sdk = appStoreSdk();
    sdk.scriptPurchase(LEA, (pkg) => Promise.resolve(purchased(customerInfo({ originalAppUserId: LEA }), pkg.product.identifier)));
    await renderSandbox(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual'))).toEqual({
      kind: 'failed',
      operation: 'purchase',
      reason: 'not-enabled',
    });

    await renderSandbox(sdk, signedIn(), { mode: { testAccounts: ['someone-else@example.com'] } });
    await act(async () => {});
    expect(checkout?.dedicatedTestAccount).toBe(false);
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual', 'apple-sandbox-test'))).toEqual({
      kind: 'failed',
      operation: 'purchase',
      reason: 'not-test-account',
    });
    expect(await runCheckout(() => checkout!.restore())).toEqual({ kind: 'failed', operation: 'restore', reason: 'not-test-account' });

    await renderSandbox(sdk, signedIn(), { mode: undefined });
    await act(async () => {});
    expect(checkout?.appleSandbox).toBe(false);
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual', 'apple-sandbox-test'))).toEqual({
      kind: 'failed',
      operation: 'purchase',
      reason: 'not-enabled',
    });
    expect(sdk.calls.purchasePackage).toEqual([]);
    expect(sdk.calls.restorePurchases).toEqual([]);
  });

  it('a user-initiated Sandbox restore with an App Store entitlement reaches the badge with its plan; a restore without one confirms the absence; nothing restores by itself', async () => {
    const sdk = appStoreSdk();
    const view = await renderSandbox(sdk, signedIn());
    await foreground();
    await settle();
    expect(sdk.calls.restorePurchases).toEqual([]);
    expect(await runCheckout(() => checkout!.restore())).toEqual({ kind: 'nothing-to-restore' });
    expect(sdk.calls.restorePurchases).toEqual([LEA]);
    expect(view.queryByTestId('home-plus-mark')).toBeNull();

    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ productIdentifier: appStoreOfferings.current!.annual!.product.identifier }), originalAppUserId: LEA }));
    expect(await runCheckout(() => checkout!.restore())).toEqual({ kind: 'restored' });
    expect(sdk.calls.restorePurchases).toEqual([LEA, LEA]);
    expect(view.getByTestId('home-plus-mark')).toBeTruthy();
    expect(view.getByText('Abonnement actif')).toBeTruthy();
    expect(view.getByText('Annuel')).toBeTruthy();
  });

  it('a Sandbox restore the store cannot answer is worded as network, grants nothing', async () => {
    const sdk = createFakeRevenueCatSdk({ restorePurchases: () => Promise.reject(purchasesError(PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR)) });
    sdk.setCustomerInfo(LEA, customerInfo({ plus: null, originalAppUserId: LEA }));
    sdk.setOfferings(LEA, appStoreOfferings);
    const view = await renderSandbox(sdk, signedIn());
    expect(await runCheckout(() => checkout!.restore())).toEqual({ kind: 'failed', operation: 'restore', reason: 'network' });
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
  });

  it('an expiration pushed by the store after a Sandbox purchase is applied through the listener: the badge leaves', async () => {
    const sdk = appStoreSdk();
    sdk.scriptPurchase(LEA, (pkg) => {
      const info = customerInfo({ plus: plusEntitlement({ productIdentifier: pkg.product.identifier }), originalAppUserId: LEA });
      sdk.setCustomerInfo(LEA, info);
      return Promise.resolve(purchased(info, pkg.product.identifier));
    });
    const view = await renderSandbox(sdk, signedIn());
    await act(async () => {});
    expect(await runCheckout(() => checkout!.purchase(offeringSession!.offering, 'annual', 'apple-sandbox-test'))).toEqual({ kind: 'activated' });
    expect(view.getByTestId('home-plus-mark')).toBeTruthy();

    const expired = customerInfo({
      plus: plusEntitlement({ productIdentifier: appStoreOfferings.current!.annual!.product.identifier, isActive: false, willRenew: false }),
      originalAppUserId: LEA,
    });
    sdk.setCustomerInfo(LEA, expired);
    await act(async () => sdk.emit(expired));
    await settle();
    expect(view.queryByTestId('home-plus-mark')).toBeNull();
    expect(latest?.verification).toMatchObject({ kind: 'verified', status: { kind: 'expired' } });
    expect(stateOf(view)).toBe('full:enforcement-disabled:write:verified');
  });
});
