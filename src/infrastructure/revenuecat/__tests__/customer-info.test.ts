// BeautIzzy — CustomerInfo mapping: only the `plus` entitlement grants, each
// store state reaches its domain status, history separates expired from
// never, nothing is invented, and a stale or malformed answer is unavailable.

import type { CustomerInfo } from 'react-native-purchases';

import type { SubscriptionStatus, SubscriptionVerification } from '@/domain/access';

import {
  APP_STORE_PLUS_PRODUCT_IDENTIFIERS,
  CUSTOMER_INFO_FRESHNESS_MS,
  isCustomerInfoFresh,
  mapCustomerInfoToVerification,
  parseStoreInstant,
  planFromProductIdentifier,
} from '../customer-info';
import { customerInfo, LAST_MONTH, NEXT_MONTH, NOW, plusEntitlement } from '../testing/customer-info-fixtures';

const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };
const verified = (status: SubscriptionStatus): SubscriptionVerification => ({ kind: 'verified', status });

const map = (info: CustomerInfo, now = NOW) => mapCustomerInfoToVerification(info, now);

describe('mapCustomerInfoToVerification', () => {
  it('maps an active renewing App Store subscription, with its plan from the exact product identifier', () => {
    expect(map(customerInfo())).toEqual(verified({ kind: 'active', plan: 'monthly', expiresAt: NEXT_MONTH }));
    expect(map(customerInfo({ plus: plusEntitlement({ productIdentifier: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.annual }) }))).toEqual(
      verified({ kind: 'active', plan: 'annual', expiresAt: NEXT_MONTH }),
    );
  });

  it('never guesses a plan from an ambiguous identifier: a Test Store product is `unknown`', () => {
    expect(map(customerInfo({ plus: plusEntitlement({ productIdentifier: 'plus_monthly_test', store: 'TEST_STORE' }) }))).toEqual(
      verified({ kind: 'active', plan: 'unknown', expiresAt: NEXT_MONTH }),
    );
    expect(planFromProductIdentifier('com.mortyflex.sourisapp.plus.monthly.v2')).toBe('unknown');
    expect(planFromProductIdentifier('monthly')).toBe('unknown');
    expect(planFromProductIdentifier(null)).toBe('unknown');
  });

  it('maps a free trial that will convert', () => {
    expect(map(customerInfo({ plus: plusEntitlement({ periodType: 'TRIAL' }) }))).toEqual(
      verified({ kind: 'trial', plan: 'monthly', expiresAt: NEXT_MONTH }),
    );
  });

  it('keeps a cancelled subscription active until its end, never expired — and a cancelled trial will not convert', () => {
    const cancelled = plusEntitlement({ willRenew: false, unsubscribeDetectedAt: LAST_MONTH.toISOString() });
    expect(map(customerInfo({ plus: cancelled }))).toEqual(verified({ kind: 'cancelled-active', plan: 'monthly', expiresAt: NEXT_MONTH }));
    expect(map(customerInfo({ plus: plusEntitlement({ ...cancelled, periodType: 'TRIAL' }) }))).toEqual(
      verified({ kind: 'cancelled-active', plan: 'monthly', expiresAt: NEXT_MONTH }),
    );
    // No renewal for any other reason (a prepaid period) reads the same: no grace will follow.
    expect(map(customerInfo({ plus: plusEntitlement({ willRenew: false, periodType: 'PREPAID' }) }))).toEqual(
      verified({ kind: 'cancelled-active', plan: 'monthly', expiresAt: NEXT_MONTH }),
    );
  });

  it('keeps a subscription in billing retry active, with the expiration the store extends it to', () => {
    const retrying = plusEntitlement({ willRenew: false, billingIssueDetectedAt: LAST_MONTH.toISOString() });
    expect(map(customerInfo({ plus: retrying }))).toEqual(verified({ kind: 'active', plan: 'monthly', expiresAt: NEXT_MONTH }));
  });

  it('maps a promotional grant to complimentary, indefinite only with no expiration', () => {
    const promotional = plusEntitlement({ store: 'PROMOTIONAL', productIdentifier: 'rc_promo_plus_lifetime', willRenew: false });
    expect(map(customerInfo({ plus: promotional }))).toEqual(verified({ kind: 'complimentary', expiresAt: NEXT_MONTH }));
    expect(map(customerInfo({ plus: plusEntitlement({ ...promotional, expirationDate: null, expirationDateMillis: null }) }))).toEqual(
      verified({ kind: 'complimentary' }),
    );
  });

  it('does not read a missing expiration on a non-promotional record as a complimentary grant', () => {
    expect(map(customerInfo({ plus: plusEntitlement({ expirationDate: null, expirationDateMillis: null }) }))).toEqual(UNAVAILABLE);
  });

  it('maps an inactive record to expired', () => {
    const inactive = plusEntitlement({ isActive: false, willRenew: false, expirationDate: LAST_MONTH.toISOString() });
    expect(map(customerInfo({ plus: inactive }))).toEqual(verified({ kind: 'expired' }));
  });

  it('distinguishes never subscribed from expired through the purchase history when no record exists', () => {
    expect(map(customerInfo({ plus: null }))).toEqual(verified({ kind: 'never' }));
    expect(map(customerInfo({ plus: null, allPurchasedProductIdentifiers: ['com.other.app.sticker'] }))).toEqual(verified({ kind: 'never' }));
    expect(
      map(customerInfo({ plus: null, allPurchasedProductIdentifiers: [APP_STORE_PLUS_PRODUCT_IDENTIFIERS.annual] })),
    ).toEqual(verified({ kind: 'expired' }));
  });

  it('fails closed when a Plus product is active but the entitlement is missing', () => {
    expect(
      map(
        customerInfo({
          plus: null,
          allPurchasedProductIdentifiers: [APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly],
          activeSubscriptions: [APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly],
        }),
      ),
    ).toEqual(UNAVAILABLE);
  });

  it('ignores an unrelated active entitlement', () => {
    const other = plusEntitlement({ identifier: 'premium_stickers', productIdentifier: 'com.other.app.stickers' });
    expect(map(customerInfo({ plus: null, otherEntitlements: { premium_stickers: other } }))).toEqual(verified({ kind: 'never' }));
    const expiredPlus = plusEntitlement({ isActive: false, expirationDate: LAST_MONTH.toISOString() });
    expect(map(customerInfo({ plus: expiredPlus, otherEntitlements: { premium_stickers: other } }))).toEqual(verified({ kind: 'expired' }));
  });

  it('never reports an entitlement already past its end as active: its renewal is unverified', () => {
    const lapsed = plusEntitlement({ expirationDate: NOW.toISOString(), expirationDateMillis: NOW.getTime() });
    expect(map(customerInfo({ plus: lapsed }))).toEqual(UNAVAILABLE);
    const fresh = customerInfo({ requestDate: new Date(NEXT_MONTH.getTime() - 1000) });
    expect(map(fresh, new Date(NEXT_MONTH.getTime() + 1000))).toEqual(UNAVAILABLE);
  });

  it('treats a stale answer as unavailable, never as a fresh revocation or renewal', () => {
    const stale = new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS - 1);
    expect(map(customerInfo({ requestDate: stale }))).toEqual(UNAVAILABLE);
    expect(map(customerInfo({ plus: plusEntitlement({ isActive: false }), requestDate: stale }))).toEqual(UNAVAILABLE);
    expect(map(customerInfo({ plus: null, requestDate: stale }))).toEqual(UNAVAILABLE);
    const edge = new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS);
    expect(map(customerInfo({ requestDate: edge })).kind).toBe('verified');
  });

  it('treats a verification the SDK reports as failed as unavailable', () => {
    const failed = plusEntitlement({ verification: 'FAILED' as ReturnType<typeof plusEntitlement>['verification'] });
    expect(map(customerInfo({ plus: failed }))).toEqual(UNAVAILABLE);
  });

  it('answers unavailable for a malformed or ambiguous CustomerInfo', () => {
    const base = customerInfo();
    const malformed: readonly unknown[] = [
      undefined,
      null,
      {},
      { ...base, requestDate: 'not-a-date' },
      { ...base, requestDate: undefined },
      { ...base, entitlements: undefined },
      { ...base, entitlements: { all: null } },
      { ...base, entitlements: { all: { plus: 'active' } } },
      { ...base, entitlements: { all: { plus: { ...plusEntitlement(), isActive: 'yes' } } } },
      { ...base, entitlements: { all: { plus: { ...plusEntitlement(), expirationDate: 'soon' } } } },
    ];
    for (const info of malformed) {
      expect(map(info as CustomerInfo)).toEqual(UNAVAILABLE);
    }
  });

  it('rejects an invalid current instant', () => {
    expect(() => map(customerInfo(), new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('isCustomerInfoFresh', () => {
  it('accepts an answer within the freshness window, in either direction', () => {
    expect(isCustomerInfoFresh(customerInfo({ requestDate: NOW }), NOW)).toBe(true);
    expect(isCustomerInfoFresh(customerInfo({ requestDate: new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS) }), NOW)).toBe(true);
    expect(isCustomerInfoFresh(customerInfo({ requestDate: new Date(NOW.getTime() + CUSTOMER_INFO_FRESHNESS_MS) }), NOW)).toBe(true);
  });

  it('rejects an older answer, one dated too far in the future, or one without a request date', () => {
    expect(isCustomerInfoFresh(customerInfo({ requestDate: new Date(NOW.getTime() - CUSTOMER_INFO_FRESHNESS_MS - 1) }), NOW)).toBe(false);
    expect(isCustomerInfoFresh(customerInfo({ requestDate: new Date(NOW.getTime() + CUSTOMER_INFO_FRESHNESS_MS + 1) }), NOW)).toBe(false);
    expect(isCustomerInfoFresh({ ...customerInfo(), requestDate: '' } as CustomerInfo, NOW)).toBe(false);
  });
});

describe('parseStoreInstant', () => {
  it('parses ISO 8601 instants only', () => {
    expect(parseStoreInstant('2026-10-21T10:00:00Z')).toEqual(NOW);
    expect(parseStoreInstant('2026-10-21T10:00:00.000Z')).toEqual(NOW);
    expect(parseStoreInstant('')).toBeUndefined();
    expect(parseStoreInstant('yesterday')).toBeUndefined();
    expect(parseStoreInstant(NOW.getTime())).toBeUndefined();
    expect(parseStoreInstant(null)).toBeUndefined();
  });
});
