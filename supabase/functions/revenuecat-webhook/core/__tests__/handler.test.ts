// The webhook end to end against the in-memory mirror: authentication,
// malformed bodies, the atomic write, idempotence, environment separation,
// failures that must be retried, several sources of one entitlement, and what
// the answers and logs may contain.

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS } from '../entitlement-snapshot';
import { handleRevenueCatWebhook, MAX_BODY_BYTES, type WebhookLogEntry } from '../handler';
import type { ReconciliationOutcome, SubscriberReconciler } from '../reconciliation';
import { FakeSubscriptionMirror } from '../testing/fake-mirror';
import { DAY, lifecycleEvent, MONTH, resetEventSequence, T0, USER_A, USER_B } from '../testing/event-fixtures';
import { webCryptoHmacSha256Hex } from '../webhook-auth';

const AUTHORIZATION = 'Bearer 0123456789abcdef0123456789abcdef';
const SIGNING_SECRET = 'whsec_0123456789';
const MONTHLY = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY;
const PROMO_LIFETIME = 'rc_promo_plus_lifetime';
const TEST_PRODUCT = 'plus_monthly_test';

function post(body: unknown, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('https://example.test/functions/v1/revenuecat-webhook', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: AUTHORIZATION, ...headers },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

function grantEvent(productId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return lifecycleEvent('NON_RENEWING_PURCHASE', {
    app_id: undefined,
    store: 'PROMOTIONAL',
    period_type: 'PROMOTIONAL',
    product_id: productId,
    expiration_at_ms: null,
    price: null,
    currency: null,
    transaction_id: undefined,
    original_transaction_id: undefined,
    ...overrides,
  });
}

function createHarness(options: { reconciler?: SubscriberReconciler; signingSecret?: string } = {}) {
  const mirror = new FakeSubscriptionMirror();
  mirror.addUser({ id: USER_A, businessId: 'biz-a' });
  const logs: WebhookLogEntry[] = [];
  const handle = (request: Request) =>
    handleRevenueCatWebhook(request, {
      authorization: AUTHORIZATION,
      signingSecret: options.signingSecret,
      mirror,
      reconciler: options.reconciler,
      now: () => T0,
      log: (entry) => logs.push(entry),
    });
  return { mirror, logs, handle };
}

function fakeReconciler(outcome: ReconciliationOutcome = { status: 'applied', applied: [`PRODUCTION:${MONTHLY}`], stale: [] }) {
  const calls: (readonly string[])[] = [];
  const reconciler: SubscriberReconciler = {
    async reconcile(appUserIds) {
      calls.push(appUserIds);
      return outcome;
    },
  };
  return { reconciler, calls };
}

beforeEach(() => resetEventSequence());

describe('revenuecat webhook handler — refusals', () => {
  it('refuses anything but POST', async () => {
    const { handle, mirror } = createHarness();
    expect((await handle(post(undefined, {}, 'GET'))).status).toBe(405);
    expect(mirror.events).toHaveLength(0);
  });

  it('refuses a missing or wrong Authorization value before reading the body', async () => {
    const { handle, mirror } = createHarness();
    const missing = new Request('https://example.test/x', { method: 'POST', body: JSON.stringify(lifecycleEvent('INITIAL_PURCHASE')) });
    expect((await handle(missing)).status).toBe(401);
    expect((await handle(post(lifecycleEvent('INITIAL_PURCHASE'), { Authorization: 'Bearer 0123456789abcdef0123456789abcdeX' }))).status).toBe(401);
    expect((await handle(post(lifecycleEvent('INITIAL_PURCHASE'), { Authorization: AUTHORIZATION.slice(0, -1) }))).status).toBe(401);
    expect(mirror.events).toHaveLength(0);
    expect(mirror.rows.size).toBe(0);
  });

  it('with a signing secret, refuses a missing, malformed or wrong signature and accepts a valid one', async () => {
    const { handle, mirror } = createHarness({ signingSecret: SIGNING_SECRET });
    const body = JSON.stringify(lifecycleEvent('INITIAL_PURCHASE'));
    expect(await (await handle(post(body))).json()).toEqual({ ok: false, error: 'signature missing' });
    expect(await (await handle(post(body, { 'X-RevenueCat-Webhook-Signature': 'nonsense' }))).json()).toEqual({ ok: false, error: 'signature malformed' });
    const t = Math.floor(T0 / 1000);
    const wrong = `t=${t},v1=${await webCryptoHmacSha256Hex('another', `${t}.${body}`)}`;
    expect(await (await handle(post(body, { 'X-RevenueCat-Webhook-Signature': wrong }))).json()).toEqual({ ok: false, error: 'signature mismatch' });
    expect(mirror.events).toHaveLength(0);
    const valid = `t=${t},v1=${await webCryptoHmacSha256Hex(SIGNING_SECRET, `${t}.${body}`)}`;
    expect((await handle(post(body, { 'X-RevenueCat-Webhook-Signature': valid }))).status).toBe(200);
    expect(mirror.events).toHaveLength(1);
  });

  it('refuses a body that is not JSON, a malformed event, and an oversized body — recording nothing', async () => {
    const { handle, mirror } = createHarness();
    expect(await (await handle(post('{not json'))).json()).toEqual({ ok: false, error: 'body is not JSON' });
    expect(await (await handle(post({ api_version: '1.0' }))).json()).toEqual({ ok: false, error: 'event is not a JSON object' });
    expect((await handle(post(lifecycleEvent('INITIAL_PURCHASE', { environment: 'STAGING' })))).status).toBe(400);
    const huge = post(`{"event":{"type":"TEST","id":"1","event_timestamp_ms":1,"pad":"${'x'.repeat(MAX_BODY_BYTES)}"}}`);
    expect((await handle(huge)).status).toBe(413);
    expect(mirror.events).toHaveLength(0);
  });
});

describe('revenuecat webhook handler — the mirror', () => {
  it('records and applies a purchase: history row, PRODUCTION row of the product, reconciliation not configured', async () => {
    const { handle, mirror, logs } = createHarness();
    const response = await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, eventId: 'evt-1', type: 'INITIAL_PURCHASE', environment: 'PRODUCTION', outcome: 'APPLIED', applied: 1, reconciliation: 'not-configured' });
    expect(mirror.events).toHaveLength(1);
    expect(mirror.events[0]).toMatchObject({ eventId: 'evt-1', outcome: 'APPLIED', userId: USER_A, environment: 'PRODUCTION', productId: MONTHLY });
    expect(mirror.events[0].payload).not.toHaveProperty('subscriber_attributes');
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'ACTIVE', entitledUntilMs: T0 + MONTH, latestEventId: 'evt-1' });
    expect(mirror.snapshots(USER_A, 'SANDBOX')).toEqual([]);
    expect(mirror.hasPlusAccess(USER_A, T0 + DAY)).toBe(true);
    expect(logs).toEqual([{ eventId: 'evt-1', type: 'INITIAL_PURCHASE', environment: 'PRODUCTION', outcome: 'APPLIED', applied: 1, reconciliation: 'not-configured' }]);
  });

  it('a duplicate delivery (same event id) changes nothing and skips the reconciliation', async () => {
    const { reconciler, calls } = fakeReconciler();
    const { handle, mirror } = createHarness({ reconciler });
    const body = lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' });
    await handle(post(body));
    const before = mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY);
    const again = await handle(post(body));
    expect(await again.json()).toMatchObject({ ok: true, outcome: 'DUPLICATE', applied: 0, reconciliation: 'skipped' });
    expect(mirror.events).toHaveLength(1);
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(before);
    expect(calls).toHaveLength(1);
  });

  it('a SANDBOX event never touches a PRODUCTION row, and a SANDBOX row never grants production access', async () => {
    const { handle, mirror } = createHarness();
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-prod' })));
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-sandbox', environment: 'SANDBOX', store: 'TEST_STORE', product_id: TEST_PRODUCT, expiration_at_ms: T0 + 5 * 60_000 })));
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'ACTIVE', plan: 'MONTHLY', latestEventId: 'evt-prod' });
    expect(mirror.snapshot(USER_A, 'SANDBOX', TEST_PRODUCT)).toMatchObject({ status: 'ACTIVE', plan: 'UNKNOWN', latestEventId: 'evt-sandbox' });
    await handle(post(lifecycleEvent('EXPIRATION', { id: 'evt-sandbox-end', environment: 'SANDBOX', store: 'TEST_STORE', product_id: TEST_PRODUCT, event_timestamp_ms: T0 + 5 * 60_000, expiration_at_ms: T0 + 5 * 60_000 })));
    expect(mirror.snapshot(USER_A, 'SANDBOX', TEST_PRODUCT)?.status).toBe('EXPIRED');
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.status).toBe('ACTIVE');
    // Production isolation: once the paid row ends, an active Sandbox row grants nothing.
    await handle(post(lifecycleEvent('EXPIRATION', { id: 'evt-prod-end', event_timestamp_ms: T0 + MONTH, expiration_at_ms: T0 + MONTH })));
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-sandbox-2', environment: 'SANDBOX', store: 'TEST_STORE', product_id: TEST_PRODUCT, event_timestamp_ms: T0 + MONTH, expiration_at_ms: T0 + 2 * MONTH })));
    expect(mirror.snapshot(USER_A, 'SANDBOX', TEST_PRODUCT)?.status).toBe('ACTIVE');
    expect(mirror.hasPlusAccess(USER_A, T0 + MONTH + DAY)).toBe(false);
  });

  it('scenario 1 end to end: a lifetime grant survives the purchase and the expiration of an Apple subscription', async () => {
    const { handle, mirror } = createHarness();
    await handle(post(grantEvent(PROMO_LIFETIME, { id: 'evt-promo' })));
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1', event_timestamp_ms: T0 + DAY, purchased_at_ms: T0 + DAY, expiration_at_ms: T0 + DAY + MONTH })));
    expect(mirror.snapshots(USER_A, 'PRODUCTION').map((row) => row.productId)).toEqual([MONTHLY, PROMO_LIFETIME]);
    await handle(post(lifecycleEvent('EXPIRATION', { id: 'evt-exp', event_timestamp_ms: T0 + DAY + MONTH, expiration_at_ms: T0 + DAY + MONTH })));
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.status).toBe('EXPIRED');
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: null, latestEventId: 'evt-promo' });
    expect(mirror.hasPlusAccess(USER_A, T0 + 10 * MONTH)).toBe(true);
  });

  it('scenario 2 end to end: revoking a grant leaves a valid paid subscription in force', async () => {
    const { handle, mirror } = createHarness();
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    await handle(post(grantEvent(PROMO_LIFETIME, { id: 'evt-promo', event_timestamp_ms: T0 + DAY })));
    await handle(post(grantEvent(PROMO_LIFETIME, { id: 'evt-revoke', type: 'CANCELLATION', event_timestamp_ms: T0 + 2 * DAY })));
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 2 * DAY });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'ACTIVE', latestEventId: 'evt-1' });
    expect(mirror.hasPlusAccess(USER_A, T0 + 10 * DAY)).toBe(true);
    expect(mirror.hasPlusAccess(USER_A, T0 + MONTH)).toBe(false);
  });

  it('scenario 3 end to end: an expired Sandbox trial beside an active production grant', async () => {
    const { handle, mirror } = createHarness();
    await handle(post(grantEvent(PROMO_LIFETIME, { id: 'evt-promo' })));
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-trial', environment: 'SANDBOX', store: 'TEST_STORE', product_id: TEST_PRODUCT, period_type: 'TRIAL', expiration_at_ms: T0 + 5 * 60_000 })));
    await handle(post(lifecycleEvent('EXPIRATION', { id: 'evt-trial-end', environment: 'SANDBOX', store: 'TEST_STORE', product_id: TEST_PRODUCT, period_type: 'TRIAL', event_timestamp_ms: T0 + 5 * 60_000, expiration_at_ms: T0 + 5 * 60_000 })));
    expect(mirror.snapshot(USER_A, 'SANDBOX', TEST_PRODUCT)?.status).toBe('EXPIRED');
    expect(mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)?.status).toBe('COMPLIMENTARY');
    expect(mirror.hasPlusAccess(USER_A, T0 + DAY)).toBe(true);
  });

  it('an unknown subscriber is recorded UNMATCHED without any row', async () => {
    const { handle, mirror } = createHarness();
    const response = await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-x', app_user_id: USER_B, original_app_user_id: USER_B, aliases: [USER_B] })));
    expect(await response.json()).toMatchObject({ outcome: 'UNMATCHED', applied: 0 });
    expect(mirror.events[0]).toMatchObject({ outcome: 'UNMATCHED', userId: null, appUserId: USER_B });
    expect(mirror.rows.size).toBe(0);
  });

  it('an existing customer whose history predates the webhook: the first event seen is applied against an empty mirror', async () => {
    const { handle, mirror } = createHarness();
    const response = await handle(post(lifecycleEvent('RENEWAL', { id: 'evt-r', event_timestamp_ms: T0 + 3 * MONTH, purchased_at_ms: T0 + 3 * MONTH, expiration_at_ms: T0 + 4 * MONTH, renewal_number: 4 })));
    expect(await response.json()).toMatchObject({ outcome: 'APPLIED', applied: 1 });
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'ACTIVE', entitledUntilMs: T0 + 4 * MONTH });
  });

  it('a database failure answers 500 and records nothing, so RevenueCat retries the delivery in full', async () => {
    const { handle, mirror } = createHarness();
    mirror.failNextApply = new Error('subscriptions: subscription_apply_revenuecat_event failed: connection reset');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ ok: false, error: 'mirror write failed' });
      expect(mirror.events).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).not.toContain(USER_A);
    } finally {
      errorSpy.mockRestore();
    }
    const retry = await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    expect(await retry.json()).toMatchObject({ outcome: 'APPLIED', applied: 1 });
  });

  it('a concurrent delivery that moved the row makes the guard fail: 500, nothing recorded', async () => {
    const { handle, mirror } = createHarness();
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    const original = mirror.readMirror.bind(mirror);
    mirror.readMirror = async (ids, environment) => {
      const read = await original(ids, environment);
      mirror.setSnapshot(USER_A, 'PRODUCTION', { ...read.snapshots[0], latestEventId: 'evt-concurrent' });
      return read;
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await handle(post(lifecycleEvent('RENEWAL', { id: 'evt-2', event_timestamp_ms: T0 + MONTH })))).status).toBe(500);
    } finally {
      errorSpy.mockRestore();
    }
    expect(mirror.events.map((event) => event.eventId)).toEqual(['evt-1']);
  });
});

describe('revenuecat webhook handler — reconciliation', () => {
  it('reconciles the subject after an applied event, and reports the outcome', async () => {
    const { reconciler, calls } = fakeReconciler();
    const { handle } = createHarness({ reconciler });
    const response = await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    expect(await response.json()).toMatchObject({ outcome: 'APPLIED', reconciliation: 'applied' });
    expect(calls).toEqual([[USER_A]]);
  });

  it('a reconciliation failure never fails the delivery', async () => {
    const { reconciler } = fakeReconciler({ status: 'failed', reason: 'revenuecat api answered 503' });
    const { handle, mirror } = createHarness({ reconciler });
    const response = await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'APPLIED', reconciliation: 'failed' });
    expect(mirror.events).toHaveLength(1);
  });

  it('reconciles both sides of a transfer, and nothing for an unmatched or unsupported event', async () => {
    const { reconciler, calls } = fakeReconciler();
    const { handle, mirror } = createHarness({ reconciler });
    mirror.addUser({ id: USER_B });
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })));
    await handle(post(lifecycleEvent('TRANSFER', { id: 'evt-t', event_timestamp_ms: T0 + 60_000, transferred_from: [USER_A], transferred_to: [USER_B], product_id: undefined, entitlement_ids: undefined, expiration_at_ms: undefined })));
    expect(mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.status).toBe('EXPIRED');
    expect(mirror.snapshots(USER_B, 'PRODUCTION')).toEqual([]);
    await handle(post(lifecycleEvent('SUBSCRIPTION_PAUSED', { id: 'evt-p' })));
    await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-u', app_user_id: '$RCAnonymousID:x', original_app_user_id: '$RCAnonymousID:x', aliases: [] })));
    expect(calls).toEqual([[USER_A], [USER_A, USER_B]]);
  });

  it('answers and logs never carry an App User ID, a transaction or a price', async () => {
    const { reconciler } = fakeReconciler();
    const { handle, logs } = createHarness({ reconciler });
    const text = await (await handle(post(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })))).text();
    for (const forbidden of [USER_A, 'tx-original', '12.99']) {
      expect(text).not.toContain(forbidden);
      expect(JSON.stringify(logs)).not.toContain(forbidden);
    }
  });
});
