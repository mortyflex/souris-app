// The RevenueCat REST API reconciliation: the pure per-product subscriber
// mapping, the API client's request and privacy, and the reconciler's
// conservative per-row writes.

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS, type EntitlementSnapshot } from '../entitlement-snapshot';
import {
  createRevenueCatSubscriberApi,
  createSubscriberReconciler,
  isPlusSource,
  mapSubscriberResponse,
  REVENUECAT_API_BASE_URL,
  type SubscriberApi,
} from '../reconciliation';
import { FakeSubscriptionMirror } from '../testing/fake-mirror';
import { DAY, MONTH, T0, USER_A } from '../testing/event-fixtures';

const REQUEST_DATE = T0 + 10 * DAY;
const iso = (ms: number) => new Date(ms).toISOString();
const MONTHLY = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY;
const ANNUAL = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.ANNUAL;
const PROMO_LIFETIME = 'rc_promo_plus_lifetime';
const PROMO_MONTHLY = 'rc_promo_plus_monthly';
const TEST_PRODUCT = 'plus_monthly_test';

function subscriber(
  summary: Record<string, unknown> | undefined,
  subscriptions: Record<string, Record<string, unknown>>,
  requestDateMs = REQUEST_DATE,
): Record<string, unknown> {
  return {
    request_date: iso(requestDateMs),
    request_date_ms: requestDateMs,
    subscriber: {
      original_app_user_id: USER_A,
      first_seen: iso(T0),
      entitlements: summary === undefined ? {} : { plus: summary },
      subscriptions,
      non_subscriptions: {},
    },
  };
}

const subscription = (overrides: Record<string, unknown> = {}) => ({
  expires_date: iso(T0 + MONTH),
  purchase_date: iso(T0),
  original_purchase_date: iso(T0),
  ownership_type: 'PURCHASED',
  period_type: 'normal',
  store: 'app_store',
  is_sandbox: false,
  unsubscribe_detected_at: null,
  billing_issues_detected_at: null,
  grace_period_expires_date: null,
  refunded_at: null,
  store_transaction_id: '700000123',
  ...overrides,
});

const promotional = (overrides: Record<string, unknown> = {}) =>
  subscription({ expires_date: null, store: 'promotional', ownership_type: 'FAMILY_SHARED', store_transaction_id: 'abc123', period_type: 'promotional', ...overrides });

const summaryOf = (productId: string, expiresDate: string | null = iso(T0 + MONTH)) => ({
  expires_date: expiresDate,
  grace_period_expires_date: null,
  product_identifier: productId,
  purchase_date: iso(T0),
});

function sourceOf(mapped: ReturnType<typeof mapSubscriberResponse>, productId: string) {
  return mapped?.sources.find((source) => source.snapshot.productId === productId);
}

describe('mapSubscriberResponse — one source per product', () => {
  it('maps an active App Store subscription to an ACTIVE PRODUCTION source with upper-cased vocabularies', () => {
    const mapped = mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription() }), USER_A);
    expect(mapped?.requestDateMs).toBe(REQUEST_DATE);
    expect(mapped?.sources).toHaveLength(1);
    expect(mapped?.sources[0].environment).toBe('PRODUCTION');
    expect(mapped?.sources[0].snapshot).toEqual({
      status: 'ACTIVE',
      plan: 'MONTHLY',
      productId: MONTHLY,
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
      originalTransactionId: null,
      latestTransactionId: '700000123',
      latestEventId: null,
      latestEventType: null,
      latestEventAtMs: null,
      source: 'RECONCILIATION',
      verifiedAtMs: REQUEST_DATE,
    });
  });

  it('scenario 8: concurrent paid and promotional sources are BOTH mapped, each in its own row', () => {
    const mapped = mapSubscriberResponse(subscriber(summaryOf(PROMO_LIFETIME, null), { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() }), USER_A);
    expect(mapped?.sources.map((source) => source.snapshot.productId).sort()).toEqual([MONTHLY, PROMO_LIFETIME]);
    expect(sourceOf(mapped, MONTHLY)?.snapshot).toMatchObject({ status: 'ACTIVE', entitledUntilMs: T0 + MONTH });
    expect(sourceOf(mapped, PROMO_LIFETIME)?.snapshot).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: null, store: 'PROMOTIONAL', plan: 'UNKNOWN', willRenew: false });
  });

  it('scenario 9: the entitlement summary naming only one product changes nothing — the subscriptions are the sources', () => {
    const paidOnly = mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() }), USER_A);
    const promoOnly = mapSubscriberResponse(subscriber(summaryOf(PROMO_LIFETIME, null), { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() }), USER_A);
    const noSummary = mapSubscriberResponse(subscriber(undefined, { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() }), USER_A);
    for (const mapped of [paidOnly, promoOnly, noSummary]) {
      expect(mapped?.sources.map((source) => source.snapshot.productId).sort()).toEqual([MONTHLY, PROMO_LIFETIME]);
    }
  });

  it('is_sandbox decides the environment of EACH product independently', () => {
    const mapped = mapSubscriberResponse(
      subscriber(summaryOf(TEST_PRODUCT), { [TEST_PRODUCT]: subscription({ is_sandbox: true, store: 'test_store' }), [PROMO_LIFETIME]: promotional() }),
      USER_A,
    );
    expect(sourceOf(mapped, TEST_PRODUCT)?.environment).toBe('SANDBOX');
    expect(sourceOf(mapped, PROMO_LIFETIME)?.environment).toBe('PRODUCTION');
  });

  it('a product grants Plus when it is an App Store product, a promotional product of `plus`, or the product the summary names', () => {
    expect(isPlusSource(MONTHLY, null)).toBe(true);
    expect(isPlusSource(ANNUAL, null)).toBe(true);
    expect(isPlusSource(PROMO_LIFETIME, null)).toBe(true);
    expect(isPlusSource(PROMO_MONTHLY, null)).toBe(true);
    expect(isPlusSource(TEST_PRODUCT, TEST_PRODUCT)).toBe(true);
    expect(isPlusSource(TEST_PRODUCT, null)).toBe(false);
    expect(isPlusSource('rc_promo_other_lifetime', null)).toBe(false);
    expect(isPlusSource('unrelated_product', MONTHLY)).toBe(false);
  });

  it('ignores products of another entitlement, promotional included, and unknown products the summary does not name', () => {
    const mapped = mapSubscriberResponse(
      subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription(), rc_promo_other_lifetime: promotional(), unrelated_product: subscription(), [TEST_PRODUCT]: subscription({ is_sandbox: true }) }),
      USER_A,
    );
    expect(mapped?.sources.map((source) => source.snapshot.productId)).toEqual([MONTHLY]);
  });

  it('reads trial, cancellation, billing retry and refund from the subscription fields', () => {
    expect(sourceOf(mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription({ period_type: 'trial' }) }), USER_A), MONTHLY)?.snapshot).toMatchObject({ status: 'TRIAL' });
    expect(sourceOf(mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription({ unsubscribe_detected_at: iso(T0 + DAY) }) }), USER_A), MONTHLY)?.snapshot).toMatchObject({
      status: 'CANCELLED_ACTIVE',
      willRenew: false,
      unsubscribeDetectedAtMs: T0 + DAY,
    });
    const grace = T0 + MONTH + 16 * DAY;
    expect(
      sourceOf(
        mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription({ billing_issues_detected_at: iso(T0 + MONTH), grace_period_expires_date: iso(grace) }) }, T0 + MONTH + DAY), USER_A),
        MONTHLY,
      )?.snapshot,
    ).toMatchObject({ status: 'BILLING_RETRY', gracePeriodExpiresAtMs: grace, entitledUntilMs: grace, billingIssueDetectedAtMs: T0 + MONTH });
    expect(sourceOf(mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription({ refunded_at: iso(T0 + 2 * DAY) }) }), USER_A), MONTHLY)?.snapshot).toMatchObject({
      status: 'EXPIRED',
      entitledUntilMs: T0 + 2 * DAY,
      willRenew: false,
    });
  });

  it('a source already past its end reads EXPIRED', () => {
    expect(sourceOf(mapSubscriberResponse(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription() }, T0 + MONTH), USER_A), MONTHLY)?.snapshot).toMatchObject({ status: 'EXPIRED', willRenew: false, entitledUntilMs: T0 + MONTH });
    expect(sourceOf(mapSubscriberResponse(subscriber(undefined, { [PROMO_MONTHLY]: promotional({ expires_date: iso(T0 + MONTH) }) }, T0 + MONTH), USER_A), PROMO_MONTHLY)?.snapshot).toMatchObject({ status: 'EXPIRED' });
  });

  it('a promotional grant without expiration is COMPLIMENTARY with no end; a dated one until its end', () => {
    const mapped = mapSubscriberResponse(subscriber(undefined, { [PROMO_LIFETIME]: promotional(), [PROMO_MONTHLY]: promotional({ expires_date: iso(T0 + MONTH) }) }), USER_A);
    expect(sourceOf(mapped, PROMO_LIFETIME)?.snapshot).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: null });
    expect(sourceOf(mapped, PROMO_MONTHLY)?.snapshot).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: T0 + MONTH });
  });

  it('a store subscription without expiration is no evidence: skipped', () => {
    expect(mapSubscriberResponse(subscriber(summaryOf(MONTHLY, null), { [MONTHLY]: subscription({ expires_date: null }) }), USER_A)?.sources).toEqual([]);
  });

  it('falls back to request_date when request_date_ms is absent, and rejects a malformed answer', () => {
    const body = subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription() });
    delete body.request_date_ms;
    expect(mapSubscriberResponse(body, USER_A)?.requestDateMs).toBe(REQUEST_DATE);
    expect(mapSubscriberResponse({ request_date_ms: REQUEST_DATE }, USER_A)).toBeUndefined();
    expect(mapSubscriberResponse({ subscriber: {} }, USER_A)).toBeUndefined();
    expect(mapSubscriberResponse(null, USER_A)).toBeUndefined();
  });
});

describe('RevenueCat subscriber API client', () => {
  const API_KEY = 'sk_TESTKEYVALUE';

  function createFetchMock(response: Response | Error) {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      if (response instanceof Error) throw response;
      return response;
    }) as typeof fetch;
    return { fetchFn, requests };
  }

  it('GETs /subscribers/{app_user_id} with the Bearer key, encoding the id', async () => {
    const { fetchFn, requests } = createFetchMock(new Response(JSON.stringify({ request_date_ms: 1 }), { status: 200 }));
    const api = createRevenueCatSubscriberApi({ apiKey: API_KEY, fetchFn });
    await expect(api.fetchSubscriber('$RCAnonymousID:a/b')).resolves.toEqual({ request_date_ms: 1 });
    expect(requests[0].url).toBe(`${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent('$RCAnonymousID:a/b')}`);
    expect(requests[0].init.method).toBe('GET');
    expect(new Headers(requests[0].init.headers).get('Authorization')).toBe(`Bearer ${API_KEY}`);
  });

  it('rejects a non-2xx answer with the status only: never the key, never the body', async () => {
    const { fetchFn } = createFetchMock(new Response(JSON.stringify({ message: 'secret details about the account' }), { status: 429 }));
    const api = createRevenueCatSubscriberApi({ apiKey: API_KEY, fetchFn });
    await expect(api.fetchSubscriber(USER_A)).rejects.toThrow('revenuecat api answered 429');
    try {
      await api.fetchSubscriber(USER_A);
    } catch (error) {
      expect((error as Error).message).not.toContain(API_KEY);
      expect((error as Error).message).not.toContain('secret details');
    }
  });
});

describe('subscriber reconciler — conservative, per row', () => {
  function api(answer: unknown | Error): SubscriberApi {
    return {
      async fetchSubscriber() {
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
  }

  const paidRow: EntitlementSnapshot = {
    status: 'ACTIVE',
    plan: 'MONTHLY',
    productId: MONTHLY,
    pendingProductId: ANNUAL,
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

  const grantRow: EntitlementSnapshot = {
    ...paidRow,
    status: 'COMPLIMENTARY',
    plan: 'UNKNOWN',
    productId: PROMO_LIFETIME,
    pendingProductId: null,
    store: 'PROMOTIONAL',
    periodType: 'PROMOTIONAL',
    expiresAtMs: null,
    entitledUntilMs: null,
    willRenew: false,
    originalTransactionId: null,
    latestTransactionId: null,
    latestEventId: 'evt-promo',
    latestEventType: 'NON_RENEWING_PURCHASE',
  };

  function mirrorWith(...rows: EntitlementSnapshot[]) {
    const mirror = new FakeSubscriptionMirror();
    mirror.addUser({ id: USER_A });
    for (const row of rows) mirror.setSnapshot(USER_A, 'PRODUCTION', row);
    return mirror;
  }

  it('writes each source in its own row, keeping the webhook facts the API lacks (original transaction, pending product, latest event)', async () => {
    const mirror = mirrorWith(paidRow);
    const reconciler = createSubscriberReconciler({
      api: api(subscriber(summaryOf(MONTHLY, iso(T0 + 2 * MONTH)), { [MONTHLY]: subscription({ expires_date: iso(T0 + 2 * MONTH) }) })),
      mirror,
    });
    await expect(reconciler.reconcile([USER_A])).resolves.toEqual({ status: 'applied', applied: [`PRODUCTION:${MONTHLY}`], stale: [] });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({
      status: 'ACTIVE',
      entitledUntilMs: T0 + 2 * MONTH,
      originalTransactionId: 'tx-original',
      pendingProductId: ANNUAL,
      latestEventId: 'evt-1',
      source: 'RECONCILIATION',
      verifiedAtMs: REQUEST_DATE,
    });
    expect(mirror.snapshots(USER_A, 'SANDBOX')).toEqual([]);
  });

  it('scenario 8: concurrent paid and promotional sources become two rows, and effective access is their OR', async () => {
    const mirror = mirrorWith();
    const reconciler = createSubscriberReconciler({ api: api(subscriber(summaryOf(PROMO_LIFETIME, null), { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() })), mirror });
    const outcome = await reconciler.reconcile([USER_A]);
    expect(outcome.status).toBe('applied');
    expect(mirror.snapshots(USER_A, 'PRODUCTION').map((row) => [row.productId, row.status])).toEqual([[MONTHLY, 'ACTIVE'], [PROMO_LIFETIME, 'COMPLIMENTARY']]);
    expect(mirror.hasPlusAccess(USER_A, T0 + 10 * MONTH)).toBe(true);
  });

  it('scenario 9: a summary naming only the Sandbox product never lapses the production grant', async () => {
    const mirror = mirrorWith(grantRow);
    const reconciler = createSubscriberReconciler({
      api: api(subscriber(summaryOf(TEST_PRODUCT), { [TEST_PRODUCT]: subscription({ is_sandbox: true, store: 'test_store' }), [PROMO_LIFETIME]: promotional() })),
      mirror,
    });
    await expect(reconciler.reconcile([USER_A])).resolves.toEqual({ status: 'applied', applied: [`SANDBOX:${TEST_PRODUCT}`, `PRODUCTION:${PROMO_LIFETIME}`], stale: [] });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: null, latestEventId: 'evt-promo' });
    expect(mirror.snapshot(USER_A, 'SANDBOX', TEST_PRODUCT)).toMatchObject({ status: 'ACTIVE' });
    expect(mirror.hasPlusAccess(USER_A, T0 + 10 * MONTH)).toBe(true);
  });

  it('a row the answer does not describe is left exactly as it is: an absence is never an expiration', async () => {
    const mirror = mirrorWith(paidRow, grantRow);
    const reconciler = createSubscriberReconciler({ api: api(subscriber(undefined, {})), mirror });
    await expect(reconciler.reconcile([USER_A])).resolves.toEqual({ status: 'nothing' });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(paidRow);
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toEqual(grantRow);
  });

  it('a confirmed end the answer carries IS applied: an expired subscription and a refund end their rows', async () => {
    const mirror = mirrorWith(paidRow, grantRow);
    const reconciler = createSubscriberReconciler({
      api: api(subscriber(summaryOf(PROMO_LIFETIME, null), { [MONTHLY]: subscription({ refunded_at: iso(T0 + 2 * DAY) }), [PROMO_LIFETIME]: promotional() })),
      mirror,
    });
    await reconciler.reconcile([USER_A]);
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 2 * DAY });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)?.status).toBe('COMPLIMENTARY');
  });

  it('a row confirmed later than the answer stays: STALE for that row only', async () => {
    const mirror = mirrorWith({ ...paidRow, verifiedAtMs: REQUEST_DATE + DAY }, grantRow);
    const reconciler = createSubscriberReconciler({ api: api(subscriber(summaryOf(MONTHLY), { [MONTHLY]: subscription({ expires_date: iso(T0 + 2 * MONTH) }), [PROMO_LIFETIME]: promotional() })), mirror });
    await expect(reconciler.reconcile([USER_A])).resolves.toEqual({ status: 'applied', applied: [`PRODUCTION:${PROMO_LIFETIME}`], stale: [`PRODUCTION:${MONTHLY}`] });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.entitledUntilMs).toBe(T0 + MONTH);
  });

  it('scenario 10: a failed, malformed or unmatched reconciliation writes nothing and never throws', async () => {
    const mirror = mirrorWith(paidRow, grantRow);
    await expect(createSubscriberReconciler({ api: api(new Error('revenuecat api answered 503')), mirror }).reconcile([USER_A])).resolves.toEqual({ status: 'failed', reason: 'revenuecat api answered 503' });
    await expect(createSubscriberReconciler({ api: api({ nonsense: true }), mirror }).reconcile([USER_A])).resolves.toEqual({ status: 'failed', reason: 'malformed subscriber answer' });
    await expect(createSubscriberReconciler({ api: api(subscriber(undefined, {})), mirror }).reconcile(['$RCAnonymousID:x'])).resolves.toEqual({ status: 'unmatched' });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(paidRow);
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toEqual(grantRow);
    expect(mirror.reconciliations).toEqual([]);
  });
});
