// BeautIzzy — the RevenueCat source: one configure with the Supabase user id,
// identity switches with logIn and never an anonymous identity, no answer
// for a user the SDK does not hold, serialized transitions, pushes delivered
// to the identified account only, and every failure as `unavailable`.

import type { SubscriptionVerification } from '@/domain/access';

import { CUSTOMER_INFO_FRESHNESS_MS } from '../customer-info';
import { PURCHASES_ERROR_CODE, type CustomerInfo, type LogInResult, type MakePurchaseResult, type PurchasesPackage } from '../sdk';
import { createRevenueCatSubscriptionSource } from '../subscription-source';
import { customerInfo, NEXT_MONTH, NOW, plusEntitlement } from '../testing/customer-info-fixtures';
import {
  createFakeRevenueCatSdk,
  makePurchaseResult,
  purchasesError,
  type FakeRevenueCatSdkOptions,
} from '../testing/fake-revenuecat-sdk';
import {
  ELIGIBLE,
  INELIGIBLE,
  appStoreEligibility,
  appStoreOfferings,
  offering,
  offerings,
  rcPackage,
  storeProduct,
  testStoreOfferings,
} from '../testing/offering-fixtures';

const API_KEY = 'test_FakeTestStoreKeyForUnitTestsOnly';
const LEA = 'user-lea';
const NOA = 'user-noa';

const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };
const ACTIVE_MONTHLY: SubscriptionVerification = {
  kind: 'verified',
  status: { kind: 'active', plan: 'monthly', expiresAt: NEXT_MONTH },
};
const NEVER: SubscriptionVerification = { kind: 'verified', status: { kind: 'never' } };

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function harness(options: FakeRevenueCatSdkOptions = {}, clock: () => Date = () => NOW) {
  const sdk = createFakeRevenueCatSdk(options);
  sdk.setCustomerInfo(LEA, customerInfo({ originalAppUserId: LEA }));
  sdk.setCustomerInfo(NOA, customerInfo({ plus: null, originalAppUserId: NOA }));
  const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock });
  return { sdk, source };
}

describe('createRevenueCatSubscriptionSource — identity', () => {
  it('configures the SDK once, with the authenticated user id as App User ID, and reads that user', async () => {
    const { sdk, source } = harness();
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
    expect(sdk.calls.configure).toEqual([{ apiKey: API_KEY, appUserID: LEA }]);
    expect(sdk.calls.logIn).toEqual([]);
    expect(sdk.appUserId()).toBe(LEA);
  });

  it('never configures an anonymous or shared identity: no configure happens before a verification', () => {
    const { sdk } = harness();
    expect(sdk.calls.configure).toEqual([]);
    expect(sdk.appUserId()).toBeUndefined();
  });

  it('switches to another account with logIn, and answers for that account only', async () => {
    const { sdk, source } = harness();
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
    await expect(source.verify(NOA)).resolves.toEqual(NEVER);
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.logIn).toEqual([NOA]);
    expect(sdk.appUserId()).toBe(NOA);
    // Back to the first account: another switch, never a second configure.
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.logIn).toEqual([NOA, LEA]);
  });

  it('uses the CustomerInfo a switch produced instead of reading again', async () => {
    const { sdk, source } = harness();
    await source.verify(LEA);
    const reads = sdk.calls.getCustomerInfo;
    await expect(source.verify(NOA)).resolves.toEqual(NEVER);
    expect(sdk.calls.getCustomerInfo).toBe(reads);
  });

  it('answers unavailable — and reads nothing — when the switch to the new account fails', async () => {
    let attempts = 0;
    const { sdk, source } = harness({
      logIn: () => {
        attempts += 1;
        return Promise.reject(new Error('offline'));
      },
    });
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
    const reads = sdk.calls.getCustomerInfo;
    await expect(source.verify(NOA)).resolves.toEqual(UNAVAILABLE);
    expect(sdk.calls.getCustomerInfo).toBe(reads);
    expect(sdk.appUserId()).toBe(LEA);
    // The previous account's information is never served to the new one, and the switch is retried.
    await expect(source.verify(NOA)).resolves.toEqual(UNAVAILABLE);
    expect(attempts).toBe(2);
  });

  it('answers unavailable when the SDK does not hold the requested identity', async () => {
    const sdk = createFakeRevenueCatSdk({ configure: () => undefined });
    sdk.setCustomerInfo(LEA, customerInfo());
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
    // The native SDK drifts to another identity behind the source's back.
    sdk.configure({ apiKey: API_KEY, appUserID: NOA });
    await expect(source.verify(LEA)).resolves.toEqual(UNAVAILABLE);
  });

  it('answers unavailable without crashing when the native module is absent, and never retries configure', async () => {
    const { sdk, source } = harness({
      configure: () => {
        throw new Error('react-native-purchases: native module not available');
      },
    });
    await expect(source.verify(LEA)).resolves.toEqual(UNAVAILABLE);
    await expect(source.verify(LEA)).resolves.toEqual(UNAVAILABLE);
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.getCustomerInfo).toBe(0);
  });
});

describe('createRevenueCatSubscriptionSource — verification', () => {
  it('maps the CustomerInfo of the identified user through the domain mapping', async () => {
    const { sdk, source } = harness();
    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ periodType: 'TRIAL' }) }));
    await expect(source.verify(LEA)).resolves.toEqual({
      kind: 'verified',
      status: { kind: 'trial', plan: 'monthly', expiresAt: NEXT_MONTH },
    });
  });

  it('answers unavailable when the SDK rejects the read', async () => {
    const { sdk, source } = harness();
    sdk.setCustomerInfo(LEA, undefined);
    await expect(source.verify(LEA)).resolves.toEqual(UNAVAILABLE);
  });

  it('refetches a stale cached answer instead of trusting it, and answers unavailable while the store does not answer', async () => {
    const stale = customerInfo({ requestDate: new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS - 1) });
    let served: Promise<CustomerInfo> = Promise.resolve(stale);
    const { sdk, source } = harness({ getCustomerInfo: () => served });
    await expect(source.verify(LEA)).resolves.toEqual(UNAVAILABLE);
    expect(sdk.calls.invalidateCustomerInfoCache).toBe(1);
    expect(sdk.calls.getCustomerInfo).toBe(2);
    // Offline after the invalidation: nothing to serve, still unavailable, never the stale answer.
    served = Promise.reject(new Error('offline'));
    await expect(source.verify(LEA)).resolves.toEqual(UNAVAILABLE);
    // The store answers again: a fresh answer, whatever it says.
    served = Promise.resolve(customerInfo({ plus: plusEntitlement({ isActive: false }) }));
    await expect(source.verify(LEA)).resolves.toEqual({ kind: 'verified', status: { kind: 'expired' } });
    served = Promise.resolve(customerInfo());
    await expect(source.verify(LEA)).resolves.toEqual(ACTIVE_MONTHLY);
  });

  it('refetches once per verification when the refetched answer is fresh', async () => {
    const answers = [
      customerInfo({ requestDate: new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS - 1) }),
      customerInfo({ plus: plusEntitlement({ isActive: false }) }),
    ];
    const { sdk, source } = harness({ getCustomerInfo: () => Promise.resolve(answers.shift() ?? customerInfo()) });
    await expect(source.verify(LEA)).resolves.toEqual({ kind: 'verified', status: { kind: 'expired' } });
    expect(sdk.calls.invalidateCustomerInfoCache).toBe(1);
    expect(sdk.calls.getCustomerInfo).toBe(2);
  });

  it('does not refetch a fresh cached answer', async () => {
    const { sdk, source } = harness();
    await source.verify(LEA);
    await source.verify(LEA);
    expect(sdk.calls.invalidateCustomerInfoCache).toBe(0);
    expect(sdk.calls.getCustomerInfo).toBe(2);
  });
});

describe('createRevenueCatSubscriptionSource — serialization', () => {
  it('runs a verification queued during a switch after the switch, for the identity it was requested for', async () => {
    let completeSwitch: ((result: LogInResult) => void) | undefined;
    const { sdk, source } = harness({
      logIn: (appUserID) =>
        appUserID === NOA
          ? new Promise<LogInResult>((resolve) => {
              completeSwitch = resolve;
            })
          : Promise.resolve({ customerInfo: customerInfo({ originalAppUserId: appUserID }), created: false }),
    });
    await source.verify(LEA);
    const noa = source.verify(NOA);
    const lea = source.verify(LEA);
    await flush();
    expect(sdk.calls.logIn).toEqual([NOA]);
    completeSwitch?.({ customerInfo: customerInfo({ plus: null, originalAppUserId: NOA }), created: true });
    await expect(noa).resolves.toEqual(NEVER);
    await expect(lea).resolves.toEqual(ACTIVE_MONTHLY);
    expect(sdk.calls.logIn).toEqual([NOA, LEA]);
    expect(sdk.appUserId()).toBe(LEA);
  });

  it('serializes concurrent verifications of the same user with one configure', async () => {
    const { sdk, source } = harness();
    const results = await Promise.all([source.verify(LEA), source.verify(LEA), source.verify(LEA)]);
    expect(results).toEqual([ACTIVE_MONTHLY, ACTIVE_MONTHLY, ACTIVE_MONTHLY]);
    expect(sdk.calls.configure).toHaveLength(1);
  });
});

describe('createRevenueCatSubscriptionSource — pushes', () => {
  it('installs one SDK listener with the first subscriber and removes it with the last', () => {
    const { sdk, source } = harness();
    const first = source.onVerificationChange!(LEA, () => undefined);
    const second = source.onVerificationChange!(LEA, () => undefined);
    const third = source.onVerificationChange!(NOA, () => undefined);
    expect(sdk.listenerCount()).toBe(1);
    first();
    second();
    expect(sdk.listenerCount()).toBe(1);
    third();
    expect(sdk.listenerCount()).toBe(0);
    const again = source.onVerificationChange!(LEA, () => undefined);
    expect(sdk.listenerCount()).toBe(1);
    again();
    expect(sdk.listenerCount()).toBe(0);
  });

  it('delivers a push to the identified account as a fresh re-read, never as the pushed payload', async () => {
    const { sdk, source } = harness();
    await source.verify(LEA);
    const received: SubscriptionVerification[] = [];
    const unsubscribe = source.onVerificationChange!(LEA, (verification) => received.push(verification));
    sdk.setCustomerInfo(LEA, customerInfo({ plus: plusEntitlement({ willRenew: false, unsubscribeDetectedAt: NOW.toISOString() }) }));
    sdk.emit(customerInfo({ plus: null, originalAppUserId: NOA }));
    await flush();
    expect(received).toEqual([{ kind: 'verified', status: { kind: 'cancelled-active', plan: 'monthly', expiresAt: NEXT_MONTH } }]);
    unsubscribe();
  });

  it('delivers nothing before an identity exists, nothing to another account, and nothing after unsubscribing', async () => {
    const { sdk, source } = harness();
    const received: string[] = [];
    const unsubscribeLea = source.onVerificationChange!(LEA, (verification) => received.push(`lea:${verification.kind}`));
    const unsubscribeNoa = source.onVerificationChange!(NOA, (verification) => received.push(`noa:${verification.kind}`));
    sdk.emit(customerInfo());
    await flush();
    expect(received).toEqual([]);
    await source.verify(LEA);
    sdk.emit(customerInfo());
    await flush();
    expect(received).toEqual(['lea:verified']);
    unsubscribeLea();
    sdk.emit(customerInfo());
    await flush();
    expect(received).toEqual(['lea:verified']);
    unsubscribeNoa();
  });

  it('drops a push that arrives during a switch: the next account never receives the answer of the previous one', async () => {
    let completeSwitch: ((result: LogInResult) => void) | undefined;
    const { sdk, source } = harness({
      logIn: () =>
        new Promise<LogInResult>((resolve) => {
          completeSwitch = resolve;
        }),
    });
    await source.verify(LEA);
    const received: string[] = [];
    const unsubscribe = source.onVerificationChange!(NOA, (verification) => received.push(`noa:${verification.kind}`));
    const switching = source.verify(NOA);
    await flush();
    sdk.emit(customerInfo());
    await flush();
    completeSwitch?.({ customerInfo: customerInfo({ plus: null, originalAppUserId: NOA }), created: true });
    await switching;
    await flush();
    expect(received).toEqual([]);
    unsubscribe();
  });

  it('delivers a push captured before a queued switch to the account it was captured for, never to the next one', async () => {
    const { sdk, source } = harness();
    await source.verify(LEA);
    const received: string[] = [];
    const unsubscribeLea = source.onVerificationChange!(LEA, (verification) => received.push(`lea:${verification.kind}`));
    const unsubscribeNoa = source.onVerificationChange!(NOA, (verification) => received.push(`noa:${verification.kind}`));
    sdk.emit(customerInfo());
    await source.verify(NOA);
    await flush();
    expect(received).toEqual(['lea:verified']);
    unsubscribeLea();
    unsubscribeNoa();
  });

  it('does not push a stale re-read', async () => {
    const { sdk, source } = harness();
    await source.verify(LEA);
    const received: SubscriptionVerification[] = [];
    const unsubscribe = source.onVerificationChange!(LEA, (verification) => received.push(verification));
    sdk.setCustomerInfo(LEA, customerInfo({ requestDate: new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS - 1) }));
    sdk.emit(customerInfo());
    await flush();
    expect(received).toEqual([]);
    unsubscribe();
  });

  it('ignores a push whose re-read fails', async () => {
    const { sdk, source } = harness();
    await source.verify(LEA);
    const received: SubscriptionVerification[] = [];
    const unsubscribe = source.onVerificationChange!(LEA, (verification) => received.push(verification));
    sdk.setCustomerInfo(LEA, undefined);
    sdk.emit(customerInfo());
    await flush();
    expect(received).toEqual([]);
    unsubscribe();
  });
});

describe('createRevenueCatSubscriptionSource — offerings (Phase 6.2)', () => {
  const STORE_UNAVAILABLE = { status: 'unavailable', reason: 'store-unavailable' } as const;

  function offeringHarness(options: FakeRevenueCatSdkOptions = {}) {
    const { sdk, source } = harness(options);
    sdk.setOfferings(LEA, appStoreOfferings);
    sdk.setIntroEligibility(LEA, appStoreEligibility(ELIGIBLE));
    sdk.setOfferings(NOA, testStoreOfferings);
    return { sdk, source };
  }

  it('configures the SDK once, with the user id, and maps the current offering of that user with its trial eligibility', async () => {
    const { sdk, source } = offeringHarness();
    const result = await source.loadOffering!(LEA);
    expect(result.status).toBe('available');
    expect(result.status === 'available' && result.plans.map((plan) => [plan.plan, plan.price.formatted, plan.freeTrial?.eligibility])).toEqual([
      ['annual', '99,00 €', 'eligible'],
      ['monthly', '9,99 €', 'eligible'],
    ]);
    expect(sdk.calls.configure).toEqual([{ apiKey: API_KEY, appUserID: LEA }]);
    expect(sdk.calls.getOfferings).toBe(1);
    expect(sdk.calls.checkTrialOrIntroductoryPriceEligibility).toEqual([
      [appStoreOfferings.current!.annual!.product.identifier, appStoreOfferings.current!.monthly!.product.identifier],
    ]);
  });

  it('never configures twice: a verification then an offering, or the reverse, share the one identity', async () => {
    const { sdk, source } = offeringHarness();
    await source.verify(LEA);
    await source.loadOffering!(LEA);
    await source.verify(LEA);
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.logIn).toEqual([]);
  });

  it('switches to another account with logIn and answers that account’s offering only', async () => {
    const { sdk, source } = offeringHarness();
    await source.loadOffering!(LEA);
    const result = await source.loadOffering!(NOA);
    expect(result.status === 'available' && result.plans.map((plan) => plan.price.formatted)).toEqual(['$49.99', '$4.99']);
    expect(sdk.calls.logIn).toEqual([NOA]);
    expect(sdk.calls.configure).toHaveLength(1);
  });

  it('serializes a switch and the offering requests: an offering requested for A before the switch to B is A’s', async () => {
    const { sdk, source } = offeringHarness();
    await source.loadOffering!(LEA);
    const lea = source.loadOffering!(LEA);
    const noa = source.loadOffering!(NOA);
    const leaAgain = source.loadOffering!(LEA);
    const [first, second, third] = await Promise.all([lea, noa, leaAgain]);
    expect(first.status === 'available' && first.plans[0]!.price.currencyCode).toBe('EUR');
    expect(second.status === 'available' && second.plans[0]!.price.currencyCode).toBe('USD');
    expect(third.status === 'available' && third.plans[0]!.price.currencyCode).toBe('EUR');
    expect(sdk.calls.logIn).toEqual([NOA, LEA]);
  });

  it('answers store-unavailable — and reads nothing — when the switch to the new account fails', async () => {
    const { sdk, source } = offeringHarness({ logIn: () => Promise.reject(new Error('offline')) });
    await source.loadOffering!(LEA);
    const reads = sdk.calls.getOfferings;
    await expect(source.loadOffering!(NOA)).resolves.toEqual(STORE_UNAVAILABLE);
    expect(sdk.calls.getOfferings).toBe(reads);
  });

  it('answers store-unavailable when the SDK does not hold the requested identity', async () => {
    const sdk = createFakeRevenueCatSdk({ configure: () => undefined });
    sdk.setOfferings(LEA, appStoreOfferings);
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
    await expect(source.loadOffering!(LEA)).resolves.toMatchObject({ status: 'available' });
    sdk.configure({ apiKey: API_KEY, appUserID: NOA });
    await expect(source.loadOffering!(LEA)).resolves.toEqual(STORE_UNAVAILABLE);
  });

  it('answers store-unavailable without crashing when the native module is absent', async () => {
    const { sdk, source } = offeringHarness({
      configure: () => {
        throw new Error('react-native-purchases: native module not available');
      },
    });
    await expect(source.loadOffering!(LEA)).resolves.toEqual(STORE_UNAVAILABLE);
    expect(sdk.calls.getOfferings).toBe(0);
  });

  it('answers store-unavailable when the SDK rejects the offerings request', async () => {
    const { sdk, source } = offeringHarness();
    sdk.setOfferings(LEA, undefined);
    await expect(source.loadOffering!(LEA)).resolves.toEqual(STORE_UNAVAILABLE);
  });

  it('hands over an empty offering when the dashboard has no current offering or no valid package', async () => {
    const { sdk, source } = offeringHarness();
    sdk.setOfferings(LEA, offerings(null));
    await expect(source.loadOffering!(LEA)).resolves.toEqual({ status: 'available', plans: [] });
    sdk.setOfferings(LEA, offerings(offering({ monthly: null, annual: null })));
    await expect(source.loadOffering!(LEA)).resolves.toEqual({ status: 'available', plans: [] });
    expect(sdk.calls.checkTrialOrIntroductoryPriceEligibility).toEqual([]);
  });

  it('a failed eligibility check leaves the trials unknown and keeps the offering', async () => {
    const { sdk, source } = offeringHarness();
    sdk.setIntroEligibility(LEA, undefined);
    const result = await source.loadOffering!(LEA);
    expect(result.status === 'available' && result.plans.map((plan) => plan.freeTrial?.eligibility)).toEqual(['unknown', 'unknown']);
  });

  it('reports an ineligible account as such, and skips the check when no product has a free trial', async () => {
    const { sdk, source } = offeringHarness();
    sdk.setIntroEligibility(LEA, appStoreEligibility(INELIGIBLE));
    const result = await source.loadOffering!(LEA);
    expect(result.status === 'available' && result.plans.map((plan) => plan.freeTrial?.eligibility)).toEqual(['ineligible', 'ineligible']);

    const noTrial = await source.loadOffering!(NOA);
    expect(noTrial.status === 'available' && noTrial.plans.every((plan) => plan.freeTrial === undefined)).toBe(true);
    expect(sdk.calls.checkTrialOrIntroductoryPriceEligibility).toHaveLength(1);
  });

  it('checks the eligibility of the products that carry a free trial only', async () => {
    const { sdk, source } = offeringHarness();
    const withoutTrial = storeProduct({ identifier: 'plain.monthly', subscriptionPeriod: 'P1M' });
    sdk.setOfferings(LEA, offerings(offering({ monthly: rcPackage('monthly', withoutTrial) })));
    await source.loadOffering!(LEA);
    expect(sdk.calls.checkTrialOrIntroductoryPriceEligibility).toEqual([[appStoreOfferings.current!.annual!.product.identifier]]);
  });

  it('returns an opaque reference with every available offering, a new one per load, none when unavailable', async () => {
    const { sdk, source } = offeringHarness();
    const first = await source.loadOffering!(LEA);
    const second = await source.loadOffering!(LEA);
    expect(first.status === 'available' && typeof first.reference).toBe('string');
    expect(second.status === 'available' && second.reference).not.toEqual(first.status === 'available' && first.reference);
    sdk.setOfferings(LEA, undefined);
    expect(await source.loadOffering!(LEA)).toEqual(STORE_UNAVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// Transactions (Phase 6.3): the ORIGINAL package of the latest loaded
// offering, for the identified account, on the serial chain; the SDK's
// rejections classified; a completed transaction answers the verification
// of the CustomerInfo the store returned; nothing granted here.
// ---------------------------------------------------------------------------

const UNAVAILABLE_OFFERING = { status: 'unavailable', reason: 'store-unavailable' } as const;

const purchased = (info: CustomerInfo, pkg: PurchasesPackage): MakePurchaseResult =>
  makePurchaseResult(info, pkg.product.identifier, NOW);

function storeHarness(options: FakeRevenueCatSdkOptions = {}) {
  const { sdk, source } = harness(options);
  sdk.setOfferings(LEA, appStoreOfferings);
  sdk.setIntroEligibility(LEA, appStoreEligibility(ELIGIBLE));
  sdk.setOfferings(NOA, testStoreOfferings);
  return { sdk, source };
}

async function transactionHarness(options: FakeRevenueCatSdkOptions = {}) {
  const { sdk, source } = storeHarness(options);
  const loaded = await source.loadOffering!(LEA);
  const reference = loaded.status === 'available' ? loaded.reference! : '';
  return { sdk, source, reference };
}

describe('createRevenueCatSubscriptionSource — purchase', () => {
  it('buys the very package object of the loaded offering for the chosen plan — annual and monthly', async () => {
    const { sdk, source, reference } = await transactionHarness();
    sdk.scriptPurchase(LEA, (pkg) => Promise.resolve(purchased(customerInfo({ originalAppUserId: LEA }), pkg)));

    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'completed', verification: ACTIVE_MONTHLY });
    await expect(source.purchase!(LEA, { reference, plan: 'monthly' })).resolves.toMatchObject({ kind: 'completed' });
    expect(sdk.calls.purchasePackage).toHaveLength(2);
    expect(sdk.calls.purchasePackage[0]!.pkg).toBe(appStoreOfferings.current!.annual);
    expect(sdk.calls.purchasePackage[1]!.pkg).toBe(appStoreOfferings.current!.monthly);
    expect(sdk.calls.purchasePackage.every((call) => call.appUserId === LEA)).toBe(true);
  });

  it('answers the verification mapped from the CustomerInfo the store returned with the purchase', async () => {
    const { sdk, source, reference } = await transactionHarness();
    sdk.scriptPurchase(LEA, (pkg) =>
      Promise.resolve(purchased(customerInfo({ plus: plusEntitlement({ periodType: 'TRIAL' }), originalAppUserId: LEA }), pkg)),
    );
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({
      kind: 'completed',
      verification: { kind: 'verified', status: { kind: 'trial', plan: 'monthly', expiresAt: NEXT_MONTH } },
    });
  });

  it('completes with an unavailable verification when the returned CustomerInfo confirms nothing: never a fabricated entitlement', async () => {
    const { sdk, source, reference } = await transactionHarness();
    const stale = new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS - 1);
    sdk.scriptPurchase(LEA, (pkg) => Promise.resolve(purchased(customerInfo({ requestDate: stale, originalAppUserId: LEA }), pkg)));
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'completed', verification: UNAVAILABLE });

    sdk.scriptPurchase(LEA, (pkg) => Promise.resolve(purchased(customerInfo({ plus: null, originalAppUserId: LEA }), pkg)));
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'completed', verification: NEVER });
  });

  it('refuses a reference that is not the latest loaded offering of that account, and buys nothing else instead', async () => {
    const { sdk, source, reference } = await transactionHarness();
    sdk.scriptPurchase(LEA, (pkg) => Promise.resolve(purchased(customerInfo({ originalAppUserId: LEA }), pkg)));

    await expect(source.purchase!(LEA, { reference: 'offering-999', plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'stale-offering' });
    await expect(source.purchase!(LEA, { reference: '', plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'stale-offering' });
    // Loaded again since: the previous reference is gone.
    await source.loadOffering!(LEA);
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'stale-offering' });
    // A failed load since: nothing shown, nothing to buy.
    const latest = await source.loadOffering!(LEA);
    sdk.setOfferings(LEA, undefined);
    await source.loadOffering!(LEA);
    await expect(source.purchase!(LEA, { reference: latest.status === 'available' ? latest.reference! : '', plan: 'annual' })).resolves.toEqual({
      kind: 'failed',
      reason: 'stale-offering',
    });
    expect(sdk.calls.purchasePackage).toEqual([]);
  });

  it('refuses a plan the loaded offering does not sell, and a reference of another account', async () => {
    const sdk = createFakeRevenueCatSdk();
    sdk.setCustomerInfo(LEA, customerInfo({ originalAppUserId: LEA }));
    sdk.setCustomerInfo(NOA, customerInfo({ plus: null, originalAppUserId: NOA }));
    sdk.setOfferings(LEA, offerings(offering({ monthly: null })));
    sdk.setOfferings(NOA, testStoreOfferings);
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
    const lea = await source.loadOffering!(LEA);
    const leaReference = lea.status === 'available' ? lea.reference! : '';
    await expect(source.purchase!(LEA, { reference: leaReference, plan: 'monthly' })).resolves.toEqual({ kind: 'failed', reason: 'stale-offering' });
    const noa = await source.loadOffering!(NOA);
    const noaReference = noa.status === 'available' ? noa.reference! : '';
    await expect(source.purchase!(LEA, { reference: noaReference, plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'stale-offering' });
    expect(sdk.calls.purchasePackage).toEqual([]);
  });

  it.each([
    [PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR, { kind: 'cancelled' }],
    [PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR, { kind: 'pending' }],
    [PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR, { kind: 'failed', reason: 'store-problem' }],
    [PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR, { kind: 'failed', reason: 'product-unavailable' }],
    [PURCHASES_ERROR_CODE.NETWORK_ERROR, { kind: 'failed', reason: 'network' }],
    [PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR, { kind: 'failed', reason: 'already-owned' }],
    [PURCHASES_ERROR_CODE.UNKNOWN_ERROR, { kind: 'failed', reason: 'unexpected' }],
  ])('classifies the SDK rejection %s as %o', async (code, outcome) => {
    const { sdk, source, reference } = await transactionHarness();
    sdk.scriptPurchase(LEA, () => Promise.reject(purchasesError(code)));
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual(outcome);
  });

  it('an unexpected SDK response (not an error shape) is a failure, never a crash', async () => {
    const { sdk, source, reference } = await transactionHarness();
    sdk.scriptPurchase(LEA, () => Promise.reject('something'));
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'unexpected' });
    sdk.scriptPurchase(LEA, () => Promise.resolve({ productIdentifier: 'p', customerInfo: {} as CustomerInfo, transaction: {} as never }));
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'completed', verification: UNAVAILABLE });
  });

  it('answers sdk-unavailable when the native module is absent', async () => {
    const sdk = createFakeRevenueCatSdk({
      configure: () => {
        throw new Error('react-native-purchases: native module not available');
      },
    });
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
    await expect(source.loadOffering!(LEA)).resolves.toEqual(UNAVAILABLE_OFFERING);
    await expect(source.purchase!(LEA, { reference: 'offering-1', plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'sdk-unavailable' });
    await expect(source.restore!(LEA)).resolves.toEqual({ kind: 'failed', reason: 'sdk-unavailable' });
    expect(sdk.calls.purchasePackage).toEqual([]);
    expect(sdk.calls.restorePurchases).toEqual([]);
  });

  it('buys nothing when the SDK does not hold the requested account (identity-mismatch), then re-identifies with logIn', async () => {
    const sdk = createFakeRevenueCatSdk({ configure: () => undefined });
    sdk.setCustomerInfo(LEA, customerInfo({ originalAppUserId: LEA }));
    sdk.setOfferings(LEA, appStoreOfferings);
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, store: 'test-store', clock: () => NOW });
    const loaded = await source.loadOffering!(LEA);
    const reference = loaded.status === 'available' ? loaded.reference! : '';
    // The native SDK drifts to another identity behind the source's back.
    sdk.configure({ apiKey: API_KEY, appUserID: NOA });
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toEqual({ kind: 'failed', reason: 'identity-mismatch' });
    expect(sdk.calls.purchasePackage).toEqual([]);
    expect(sdk.calls.logIn).toEqual([]);
    // The source is identified as nobody now: the next operation switches back explicitly before acting.
    await expect(source.restore!(LEA)).resolves.toEqual({ kind: 'completed', verification: ACTIVE_MONTHLY });
    expect(sdk.calls.logIn).toEqual([LEA]);
    expect(sdk.calls.restorePurchases).toEqual([LEA]);
  });

  it('switches back to the requested account before buying, with logIn, never a second configure', async () => {
    const { sdk, source, reference } = await transactionHarness();
    sdk.scriptPurchase(LEA, (pkg) => Promise.resolve(purchased(customerInfo({ originalAppUserId: LEA }), pkg)));
    await source.verify(NOA);
    expect(sdk.appUserId()).toBe(NOA);
    await expect(source.purchase!(LEA, { reference, plan: 'annual' })).resolves.toMatchObject({ kind: 'completed' });
    expect(sdk.calls.configure).toHaveLength(1);
    expect(sdk.calls.logIn).toEqual([NOA, LEA]);
    expect(sdk.calls.purchasePackage[0]!.appUserId).toBe(LEA);
  });

  it('serializes: an account switch requested during the purchase sheet waits for the transaction', async () => {
    const { sdk, source, reference } = await transactionHarness();
    let finish: ((result: MakePurchaseResult) => void) | undefined;
    sdk.scriptPurchase(
      LEA,
      (pkg) =>
        new Promise((resolve) => {
          finish = (result) => resolve(result ?? purchased(customerInfo({ originalAppUserId: LEA }), pkg));
        }),
    );
    const purchase = source.purchase!(LEA, { reference, plan: 'annual' });
    await flush();
    const switched = source.verify(NOA);
    await flush();
    expect(sdk.calls.logIn).toEqual([]);
    expect(sdk.appUserId()).toBe(LEA);
    finish!(undefined as never);
    await expect(purchase).resolves.toEqual({ kind: 'completed', verification: ACTIVE_MONTHLY });
    await expect(switched).resolves.toEqual(NEVER);
    expect(sdk.calls.logIn).toEqual([NOA]);
  });

  it('the SDK update event after a purchase re-reads the identified account on the chain, once, with the one listener', async () => {
    const { sdk, source, reference } = await transactionHarness();
    const received: SubscriptionVerification[] = [];
    source.onVerificationChange!(LEA, (verification) => received.push(verification));
    await source.verify(LEA);
    sdk.scriptPurchase(LEA, (pkg) => {
      const info = customerInfo({ plus: plusEntitlement({ periodType: 'TRIAL' }), originalAppUserId: LEA });
      sdk.setCustomerInfo(LEA, info);
      sdk.emit(info);
      return Promise.resolve(purchased(info, pkg));
    });
    await source.purchase!(LEA, { reference, plan: 'annual' });
    await flush();
    expect(received).toEqual([{ kind: 'verified', status: { kind: 'trial', plan: 'monthly', expiresAt: NEXT_MONTH } }]);
    expect(sdk.listenerCount()).toBe(1);
  });
});

describe('createRevenueCatSubscriptionSource — restore', () => {
  it('asks the store for the identified account and answers the verification of what it returned', async () => {
    const { sdk, source } = await transactionHarness();
    await expect(source.restore!(LEA)).resolves.toEqual({ kind: 'completed', verification: ACTIVE_MONTHLY });
    expect(sdk.calls.restorePurchases).toEqual([LEA]);
  });

  it('an account with nothing to restore completes with the confirmed absence — not an error', async () => {
    const { sdk, source } = await transactionHarness();
    sdk.setCustomerInfo(LEA, customerInfo({ plus: null, originalAppUserId: LEA }));
    await expect(source.restore!(LEA)).resolves.toEqual({ kind: 'completed', verification: NEVER });
  });

  it.each([
    [PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR, { kind: 'cancelled' }],
    [PURCHASES_ERROR_CODE.NETWORK_ERROR, { kind: 'failed', reason: 'network' }],
    [PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR, { kind: 'failed', reason: 'store-problem' }],
    [PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR, { kind: 'failed', reason: 'linked-to-another-account' }],
    [PURCHASES_ERROR_CODE.UNSUPPORTED_ERROR, { kind: 'failed', reason: 'unexpected' }],
    [PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR, { kind: 'failed', reason: 'store-problem' }],
  ])('classifies the SDK rejection %s as %o', async (code, outcome) => {
    const { source } = await transactionHarness({ restorePurchases: () => Promise.reject(purchasesError(code)) });
    await expect(source.restore!(LEA)).resolves.toEqual(outcome);
  });

  it('restores for the requested account only, after switching to it; never automatically', async () => {
    const { sdk, source } = await transactionHarness();
    await source.verify(NOA);
    expect(sdk.calls.restorePurchases).toEqual([]);
    await expect(source.restore!(LEA)).resolves.toEqual({ kind: 'completed', verification: ACTIVE_MONTHLY });
    expect(sdk.calls.restorePurchases).toEqual([LEA]);
    expect(sdk.calls.logIn).toEqual([NOA, LEA]);
  });
});
