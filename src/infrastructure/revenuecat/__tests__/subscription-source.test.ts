// BeautIzzy — the RevenueCat source: one configure with the Supabase user id,
// identity switches with logIn and never an anonymous identity, no answer
// for a user the SDK does not hold, serialized transitions, pushes delivered
// to the identified account only, and every failure as `unavailable`.

import type { SubscriptionVerification } from '@/domain/access';

import { CUSTOMER_INFO_FRESHNESS_MS } from '../customer-info';
import type { CustomerInfo, LogInResult } from '../sdk';
import { createRevenueCatSubscriptionSource } from '../subscription-source';
import { customerInfo, NEXT_MONTH, NOW, plusEntitlement } from '../testing/customer-info-fixtures';
import { createFakeRevenueCatSdk, type FakeRevenueCatSdkOptions } from '../testing/fake-revenuecat-sdk';

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
  const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, clock });
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
    const source = createRevenueCatSubscriptionSource({ sdk, apiKey: API_KEY, clock: () => NOW });
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
