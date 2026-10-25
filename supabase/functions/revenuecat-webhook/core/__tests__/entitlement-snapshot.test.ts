import {
  APP_STORE_PLUS_PRODUCT_IDENTIFIERS,
  isEntitledAt,
  isPlusPromotionalProduct,
  planFromProductIdentifier,
  snapshotFromJson,
  snapshotToJson,
  type EntitlementSnapshot,
} from '../entitlement-snapshot';
import { MONTH, T0, USER_A } from '../testing/event-fixtures';

const snapshot: EntitlementSnapshot = {
  status: 'ACTIVE',
  plan: 'MONTHLY',
  productId: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY,
  pendingProductId: null,
  store: 'APP_STORE',
  periodType: 'NORMAL',
  appUserId: USER_A,
  originalAppUserId: USER_A,
  purchasedAtMs: T0,
  expiresAtMs: T0 + MONTH,
  gracePeriodExpiresAtMs: null,
  entitledUntilMs: T0 + MONTH,
  willRenew: true,
  unsubscribeDetectedAtMs: null,
  billingIssueDetectedAtMs: null,
  originalTransactionId: 'tx-original',
  latestTransactionId: 'tx-1',
  latestEventId: 'evt-1',
  latestEventType: 'INITIAL_PURCHASE',
  latestEventAtMs: T0,
  source: 'WEBHOOK',
  verifiedAtMs: T0,
};

describe('entitlement snapshot', () => {
  it('round-trips through the SQL exchange shape (snake_case, _ms instants)', () => {
    const json = snapshotToJson(snapshot);
    expect(json).toMatchObject({ status: 'ACTIVE', product_id: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY, expires_at_ms: T0 + MONTH, will_renew: true, verified_at_ms: T0 });
    expect(snapshotFromJson(json)).toEqual(snapshot);
  });

  it('reads the SQL answer with nulls and rejects a malformed one', () => {
    const complimentary = snapshotFromJson({ ...snapshotToJson(snapshot), status: 'COMPLIMENTARY', plan: 'UNKNOWN', expires_at_ms: null, entitled_until_ms: null, latest_event_id: null });
    expect(complimentary).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: null, latestEventId: null });
    expect(snapshotFromJson(null)).toBeUndefined();
    expect(snapshotFromJson({ ...snapshotToJson(snapshot), status: 'PAUSED' })).toBeUndefined();
    expect(snapshotFromJson({ ...snapshotToJson(snapshot), verified_at_ms: 'yesterday' })).toBeUndefined();
    expect(snapshotFromJson({ ...snapshotToJson(snapshot), app_user_id: '' })).toBeUndefined();
    expect(snapshotFromJson({ ...snapshotToJson(snapshot), product_id: null })).toBeUndefined();
    expect(snapshotFromJson({ ...snapshotToJson(snapshot), source: 'MANUAL' })).toBeUndefined();
  });

  it('decides entitlement at an instant: not EXPIRED, end exclusive, no end for a lifetime grant', () => {
    expect(isEntitledAt(snapshot, T0)).toBe(true);
    expect(isEntitledAt(snapshot, T0 + MONTH - 1)).toBe(true);
    expect(isEntitledAt(snapshot, T0 + MONTH)).toBe(false);
    expect(isEntitledAt({ ...snapshot, status: 'EXPIRED', entitledUntilMs: T0 + MONTH }, T0)).toBe(false);
    expect(isEntitledAt({ ...snapshot, status: 'COMPLIMENTARY', entitledUntilMs: null }, T0 + 100 * 365 * 24 * 3600 * 1000)).toBe(true);
    expect(isEntitledAt({ ...snapshot, status: 'CANCELLED_ACTIVE' }, T0 + 1)).toBe(true);
    expect(isEntitledAt({ ...snapshot, status: 'BILLING_RETRY', entitledUntilMs: T0 + MONTH + 16 * 24 * 3600 * 1000 }, T0 + MONTH + 1)).toBe(true);
  });

  it('establishes the plan from an EXACT App Store product identifier only', () => {
    expect(planFromProductIdentifier(APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY)).toBe('MONTHLY');
    expect(planFromProductIdentifier(APP_STORE_PLUS_PRODUCT_IDENTIFIERS.ANNUAL)).toBe('ANNUAL');
    expect(planFromProductIdentifier('com.mortyflex.sourisapp.plus.monthly.v2')).toBe('UNKNOWN');
    expect(planFromProductIdentifier('rc_promo_plus_lifetime')).toBe('UNKNOWN');
    expect(planFromProductIdentifier('test_store_monthly')).toBe('UNKNOWN');
    expect(planFromProductIdentifier(null)).toBe('UNKNOWN');
  });
});

describe('promotional products of the plus entitlement', () => {
  it('recognises RevenueCat promotional products of `plus` by the entitlement id inside the product id', () => {
    for (const productId of ['rc_promo_plus_lifetime', 'rc_promo_plus_monthly', 'rc_promo_plus_yearly', 'rc_promo_plus_three_month', 'rc_promo_plus_custom']) {
      expect({ productId, plus: isPlusPromotionalProduct(productId) }).toEqual({ productId, plus: true });
    }
    for (const productId of ['rc_promo_pro_lifetime', 'rc_promo_other_monthly', 'rc_promo_plus', 'com.mortyflex.sourisapp.plus.monthly', 'RC_PROMO_PLUS_LIFETIME', '', null]) {
      expect({ productId, plus: isPlusPromotionalProduct(productId) }).toEqual({ productId, plus: false });
    }
  });
});
