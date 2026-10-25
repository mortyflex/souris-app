// The lifecycle rules of the mirror, one event at a time, against what the
// mirror already knows. A row is ONE granting product: every expectation is a
// documented RevenueCat semantic — a cancellation keeps the access, a billing
// issue keeps it through the store's grace, a product change waits for the
// renewal, only an expiration ends a product, a promotional revocation ends
// every grant at once — and no event ever touches another product's row.

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS, isEntitledAt, type EntitlementSnapshot } from '../entitlement-snapshot';
import type { MirrorRead, SnapshotWrite } from '../mirror';
import { projectRevenueCatEvent, type EventContext } from '../project-event';
import { parseRevenueCatWebhookBody, type RevenueCatEvent } from '../revenuecat-event';
import { APP_ID, DAY, lifecycleEvent, MONTH, resetEventSequence, T0, USER_A, USER_B } from '../testing/event-fixtures';

const MONTHLY = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.MONTHLY;
const ANNUAL = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.ANNUAL;
const PROMO_LIFETIME = 'rc_promo_plus_lifetime';
const PROMO_MONTHLY = 'rc_promo_plus_monthly';

function parse(body: Record<string, unknown>): RevenueCatEvent {
  const result = parseRevenueCatWebhookBody(body);
  if (!result.ok) throw new Error(result.reason);
  return result.event;
}

function read(userId: string | null, snapshots: readonly EntitlementSnapshot[] = []): MirrorRead {
  return { userId, businessId: userId === null ? null : 'biz-1', matchedAppUserId: userId, snapshots };
}

const NOBODY: MirrorRead = { userId: null, businessId: null, matchedAppUserId: null, snapshots: [] };

/** A promotional grant body: production, store and period PROMOTIONAL, no app id, no store transaction. */
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

/** Applies an event over the rows the mirror holds and returns its writes (APPLIED expected). */
function applyAll(body: Record<string, unknown>, rows: readonly EntitlementSnapshot[] = [], context: Partial<EventContext> = {}): readonly SnapshotWrite[] {
  const decision = projectRevenueCatEvent(parse(body), { subject: read(USER_A, rows), ...context });
  if (decision.outcome !== 'APPLIED') throw new Error(`expected APPLIED, got ${decision.outcome}: ${decision.detail}`);
  for (const write of decision.writes) expect(write.userId).toBe(USER_A);
  return decision.writes;
}

/** Applies an event that must rewrite exactly ONE row — the event's product — and returns that row. */
function apply(body: Record<string, unknown>, rows: readonly EntitlementSnapshot[] = [], context: Partial<EventContext> = {}): EntitlementSnapshot {
  const productId = (body.event as Record<string, unknown>).product_id as string;
  const writes = applyAll(body, rows, context);
  expect(writes).toHaveLength(1);
  expect(writes[0].productId).toBe(productId);
  expect(writes[0].expectedLatestEventId).toBe(rows.find((row) => row.productId === productId)?.latestEventId ?? null);
  return writes[0].snapshot;
}

/** The rows after `writes` replaced the rows of their products. */
function merge(rows: readonly EntitlementSnapshot[], writes: readonly SnapshotWrite[]): EntitlementSnapshot[] {
  const next = new Map(rows.map((row) => [row.productId, row]));
  for (const write of writes) next.set(write.productId, write.snapshot);
  return [...next.values()];
}

beforeEach(() => resetEventSequence());

describe('purchases and renewals', () => {
  it('INITIAL_PURCHASE on an empty mirror: ACTIVE, renewing, entitled until the expiration', () => {
    const body = lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' });
    const decision = projectRevenueCatEvent(parse(body), { subject: read(USER_A) });
    expect(decision).toMatchObject({ outcome: 'APPLIED', detail: null, userId: USER_A, reconcile: [USER_A] });
    expect(decision.writes[0]).toMatchObject({ userId: USER_A, environment: 'PRODUCTION', productId: MONTHLY, expectedLatestEventId: null });
    expect(decision.writes[0].snapshot).toEqual({
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
      originalTransactionId: 'tx-original',
      latestTransactionId: 'tx-1',
      latestEventId: 'evt-1',
      latestEventType: 'INITIAL_PURCHASE',
      latestEventAtMs: T0,
      source: 'WEBHOOK',
      verifiedAtMs: T0,
    });
  });

  it('RENEWAL extends the access and names the previous event of ITS product as its guard', () => {
    const first = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const renewed = apply(lifecycleEvent('RENEWAL', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, purchased_at_ms: T0 + MONTH, expiration_at_ms: T0 + 2 * MONTH, renewal_number: 2 }), [first]);
    expect(renewed).toMatchObject({ status: 'ACTIVE', entitledUntilMs: T0 + 2 * MONTH, latestEventId: 'evt-2', originalTransactionId: 'tx-original', willRenew: true });
    expect(isEntitledAt(renewed, T0 + MONTH + DAY)).toBe(true);
  });

  it('the annual product reads plan ANNUAL; a Test Store or unknown product reads UNKNOWN and still grants its row', () => {
    expect(apply(lifecycleEvent('INITIAL_PURCHASE', { product_id: ANNUAL, expiration_at_ms: T0 + 365 * DAY })).plan).toBe('ANNUAL');
    const testStore = apply(lifecycleEvent('INITIAL_PURCHASE', { product_id: 'plus_monthly_test', store: 'TEST_STORE', environment: 'SANDBOX' }));
    expect(testStore).toMatchObject({ plan: 'UNKNOWN', status: 'ACTIVE', store: 'TEST_STORE' });
  });

  it('a late purchase event for a period already over writes nothing in force', () => {
    const late = apply(lifecycleEvent('INITIAL_PURCHASE', { event_timestamp_ms: T0 + 2 * MONTH, purchased_at_ms: T0, expiration_at_ms: T0 + MONTH }));
    expect(late.status).toBe('EXPIRED');
    expect(isEntitledAt(late, T0 + 2 * MONTH)).toBe(false);
  });

  it('NON_RENEWING_PURCHASE with an expiration is ACTIVE and does not renew', () => {
    expect(apply(lifecycleEvent('NON_RENEWING_PURCHASE', { period_type: 'NORMAL' }))).toMatchObject({ status: 'ACTIVE', willRenew: false, entitledUntilMs: T0 + MONTH });
  });

  it('a store purchase without an expiration is no evidence of an indefinite grant: IGNORED', () => {
    const decision = projectRevenueCatEvent(parse(lifecycleEvent('NON_RENEWING_PURCHASE', { expiration_at_ms: null })), { subject: read(USER_A) });
    expect(decision).toMatchObject({ outcome: 'IGNORED', detail: 'store purchase without an expiration', userId: USER_A, writes: [], reconcile: [] });
  });

  it('an event without a product cannot be placed: IGNORED', () => {
    expect(projectRevenueCatEvent(parse(lifecycleEvent('INITIAL_PURCHASE', { product_id: undefined })), { subject: read(USER_A) })).toMatchObject({ outcome: 'IGNORED', detail: 'event without product', writes: [] });
  });
});

describe('trial', () => {
  it('a TRIAL period activates as TRIAL and converts to ACTIVE on the first renewal', () => {
    const trial = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1', period_type: 'TRIAL', price: 0, expiration_at_ms: T0 + 14 * DAY }));
    expect(trial).toMatchObject({ status: 'TRIAL', willRenew: true, entitledUntilMs: T0 + 14 * DAY });
    const converted = apply(
      lifecycleEvent('RENEWAL', { id: 'evt-2', event_timestamp_ms: T0 + 14 * DAY, period_type: 'NORMAL', is_trial_conversion: true, purchased_at_ms: T0 + 14 * DAY, expiration_at_ms: T0 + 14 * DAY + MONTH }),
      [trial],
    );
    expect(converted).toMatchObject({ status: 'ACTIVE', periodType: 'NORMAL', entitledUntilMs: T0 + 14 * DAY + MONTH });
  });

  it('a cancelled trial keeps its access until its end: CANCELLED_ACTIVE, then EXPIRED by the expiration event', () => {
    const trial = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1', period_type: 'TRIAL', expiration_at_ms: T0 + 14 * DAY }));
    const cancelled = apply(lifecycleEvent('CANCELLATION', { id: 'evt-2', event_timestamp_ms: T0 + 3 * DAY, period_type: 'TRIAL', expiration_at_ms: T0 + 14 * DAY, cancel_reason: 'UNSUBSCRIBE' }), [trial]);
    expect(cancelled).toMatchObject({ status: 'CANCELLED_ACTIVE', entitledUntilMs: T0 + 14 * DAY });
    const expired = apply(lifecycleEvent('EXPIRATION', { id: 'evt-3', event_timestamp_ms: T0 + 14 * DAY, period_type: 'TRIAL', expiration_at_ms: T0 + 14 * DAY, expiration_reason: 'UNSUBSCRIBE' }), [cancelled]);
    expect(expired.status).toBe('EXPIRED');
  });
});

describe('paid cancellation is not expiration; promotional cancellation is a revocation', () => {
  it('CANCELLATION of a paid product keeps the access until the known expiration, without renewal', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const cancelled = apply(lifecycleEvent('CANCELLATION', { id: 'evt-2', event_timestamp_ms: T0 + 5 * DAY, cancel_reason: 'UNSUBSCRIBE' }), [active]);
    expect(cancelled).toMatchObject({
      status: 'CANCELLED_ACTIVE',
      willRenew: false,
      unsubscribeDetectedAtMs: T0 + 5 * DAY,
      expiresAtMs: T0 + MONTH,
      entitledUntilMs: T0 + MONTH,
      latestEventId: 'evt-2',
    });
    expect(isEntitledAt(cancelled, T0 + 10 * DAY)).toBe(true);
    expect(isEntitledAt(cancelled, T0 + MONTH)).toBe(false);
  });

  it('CANCELLATION of a promotional grant ends it at once, whatever expiration it carried', () => {
    const grant = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-g', expiration_at_ms: T0 + MONTH }));
    expect(grant).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: T0 + MONTH });
    const writes = applyAll(grantEvent(PROMO_MONTHLY, { id: 'evt-revoke', type: 'CANCELLATION', event_timestamp_ms: T0 + 5 * DAY, expiration_at_ms: T0 + MONTH, cancel_reason: 'DEVELOPER_INITIATED' }), [grant]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ productId: PROMO_MONTHLY, expectedLatestEventId: 'evt-g' });
    expect(writes[0].snapshot).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 5 * DAY, willRenew: false, latestEventId: 'evt-revoke', latestEventType: 'CANCELLATION' });
    expect(isEntitledAt(writes[0].snapshot, T0 + 5 * DAY)).toBe(false);
  });

  it('UNCANCELLATION restores the renewal of a paid product', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const cancelled = apply(lifecycleEvent('CANCELLATION', { id: 'evt-2', event_timestamp_ms: T0 + 5 * DAY }), [active]);
    const restored = apply(lifecycleEvent('UNCANCELLATION', { id: 'evt-3', event_timestamp_ms: T0 + 6 * DAY }), [cancelled]);
    expect(restored).toMatchObject({ status: 'ACTIVE', willRenew: true, unsubscribeDetectedAtMs: null, entitledUntilMs: T0 + MONTH });
  });

  it('a paid CANCELLATION whose period is already over reads EXPIRED', () => {
    expect(apply(lifecycleEvent('CANCELLATION', { event_timestamp_ms: T0 + MONTH + DAY, cancel_reason: 'BILLING_ERROR' })).status).toBe('EXPIRED');
  });
});

describe('billing issues', () => {
  it('BILLING_ISSUE with a store grace keeps the access until the later of expiration and grace end', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const grace = T0 + MONTH + 16 * DAY;
    const retrying = apply(lifecycleEvent('BILLING_ISSUE', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, grace_period_expiration_at_ms: grace }), [active]);
    expect(retrying).toMatchObject({ status: 'BILLING_RETRY', billingIssueDetectedAtMs: T0 + MONTH, gracePeriodExpiresAtMs: grace, expiresAtMs: T0 + MONTH, entitledUntilMs: grace, willRenew: true });
    expect(isEntitledAt(retrying, T0 + MONTH + 10 * DAY)).toBe(true);
    expect(isEntitledAt(retrying, grace)).toBe(false);
  });

  it('BILLING_ISSUE without grace after the expiration grants nothing: EXPIRED until a renewal says otherwise', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const failed = apply(lifecycleEvent('BILLING_ISSUE', { id: 'evt-2', event_timestamp_ms: T0 + MONTH + 3600_000, grace_period_expiration_at_ms: null }), [active]);
    expect(failed).toMatchObject({ status: 'EXPIRED', billingIssueDetectedAtMs: T0 + MONTH + 3600_000, entitledUntilMs: T0 + MONTH });
  });

  it('a RENEWAL after the retry clears the billing trouble', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const retrying = apply(lifecycleEvent('BILLING_ISSUE', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, grace_period_expiration_at_ms: T0 + MONTH + 16 * DAY }), [active]);
    const renewed = apply(lifecycleEvent('RENEWAL', { id: 'evt-3', event_timestamp_ms: T0 + MONTH + 2 * DAY, purchased_at_ms: T0 + MONTH, expiration_at_ms: T0 + 2 * MONTH }), [retrying]);
    expect(renewed).toMatchObject({ status: 'ACTIVE', billingIssueDetectedAtMs: null, gracePeriodExpiresAtMs: null, entitledUntilMs: T0 + 2 * MONTH });
  });

  it('the EXPIRATION that ends a failed retry is applied, not mistaken for an earlier period', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const retrying = apply(lifecycleEvent('BILLING_ISSUE', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, grace_period_expiration_at_ms: T0 + MONTH + 16 * DAY }), [active]);
    const expired = apply(lifecycleEvent('EXPIRATION', { id: 'evt-3', event_timestamp_ms: T0 + MONTH + 16 * DAY, expiration_at_ms: T0 + MONTH, expiration_reason: 'BILLING_ERROR' }), [retrying]);
    expect(expired).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + MONTH });
  });
});

describe('product change and extension', () => {
  it('PRODUCT_CHANGE announces the next product; the current period and access stay; the renewal lands on the new product row', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const changed = apply(lifecycleEvent('PRODUCT_CHANGE', { id: 'evt-2', event_timestamp_ms: T0 + 10 * DAY, new_product_id: ANNUAL }), [active]);
    expect(changed).toMatchObject({ status: 'ACTIVE', productId: MONTHLY, plan: 'MONTHLY', pendingProductId: ANNUAL, entitledUntilMs: T0 + MONTH });
    const renewed = apply(
      lifecycleEvent('RENEWAL', { id: 'evt-3', event_timestamp_ms: T0 + MONTH, product_id: ANNUAL, purchased_at_ms: T0 + MONTH, expiration_at_ms: T0 + MONTH + 365 * DAY }),
      [changed],
    );
    expect(renewed).toMatchObject({ productId: ANNUAL, plan: 'ANNUAL', pendingProductId: null, entitledUntilMs: T0 + MONTH + 365 * DAY });
  });

  it('SUBSCRIPTION_EXTENDED moves the end and clears a billing retry', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const retrying = apply(lifecycleEvent('BILLING_ISSUE', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, grace_period_expiration_at_ms: T0 + MONTH + 16 * DAY }), [active]);
    const extended = apply(lifecycleEvent('SUBSCRIPTION_EXTENDED', { id: 'evt-3', event_timestamp_ms: T0 + MONTH + DAY, expiration_at_ms: T0 + 2 * MONTH }), [retrying]);
    expect(extended).toMatchObject({ status: 'ACTIVE', billingIssueDetectedAtMs: null, gracePeriodExpiresAtMs: null, entitledUntilMs: T0 + 2 * MONTH });
  });
});

describe('expiration and reactivation', () => {
  it('EXPIRATION ends the access at the expiration; a later INITIAL_PURCHASE reactivates the product', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const expired = apply(lifecycleEvent('EXPIRATION', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, expiration_reason: 'UNSUBSCRIBE' }), [active]);
    expect(expired).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + MONTH, willRenew: false, latestEventId: 'evt-2' });
    const again = apply(
      lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-3', event_timestamp_ms: T0 + 3 * MONTH, purchased_at_ms: T0 + 3 * MONTH, expiration_at_ms: T0 + 4 * MONTH, transaction_id: 'tx-9', original_transaction_id: 'tx-9' }),
      [expired],
    );
    expect(again).toMatchObject({ status: 'ACTIVE', entitledUntilMs: T0 + 4 * MONTH, originalTransactionId: 'tx-9', latestEventId: 'evt-3' });
  });

  it('EXPIRATION without an expiration instant ends at the event instant', () => {
    expect(apply(lifecycleEvent('EXPIRATION', { event_timestamp_ms: T0 + 5 * DAY, expiration_at_ms: null }))).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 5 * DAY });
  });
});

describe('complimentary (promotional) access', () => {
  it('a PROMOTIONAL NON_RENEWING_PURCHASE without expiration is COMPLIMENTARY with no end — never a store purchase', () => {
    const complimentary = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo' }));
    expect(complimentary).toMatchObject({ status: 'COMPLIMENTARY', plan: 'UNKNOWN', store: 'PROMOTIONAL', productId: PROMO_LIFETIME, entitledUntilMs: null, expiresAtMs: null, willRenew: false });
    expect(isEntitledAt(complimentary, T0 + 50 * 365 * DAY)).toBe(true);
  });

  it('a PROMOTIONAL grant with an end is COMPLIMENTARY until that end', () => {
    expect(apply(grantEvent(PROMO_MONTHLY, { expiration_at_ms: T0 + MONTH }))).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: T0 + MONTH });
  });

  it('a dated grant reaching its end (EXPIRATION, PROMOTIONAL) ends its own row', () => {
    const grant = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-g', expiration_at_ms: T0 + MONTH }));
    const ended = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-end', type: 'EXPIRATION', event_timestamp_ms: T0 + MONTH, expiration_at_ms: T0 + MONTH }), [grant]);
    expect(ended).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + MONTH });
  });
});

describe('several sources of the same entitlement', () => {
  it('scenario 1: a lifetime grant, then a paid Apple subscription that expires — the grant row is never touched', () => {
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo' }));
    const paid = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1', event_timestamp_ms: T0 + DAY, purchased_at_ms: T0 + DAY, expiration_at_ms: T0 + DAY + MONTH }), [grant]);
    expect(paid).toMatchObject({ productId: MONTHLY, status: 'ACTIVE' });
    const rows = merge([grant], [{ userId: USER_A, environment: 'PRODUCTION', productId: MONTHLY, expectedLatestEventId: null, snapshot: paid }]);
    const writes = applyAll(lifecycleEvent('EXPIRATION', { id: 'evt-exp', event_timestamp_ms: T0 + DAY + MONTH, expiration_at_ms: T0 + DAY + MONTH }), rows);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ productId: MONTHLY, expectedLatestEventId: 'evt-1' });
    expect(writes[0].snapshot.status).toBe('EXPIRED');
    const after = merge(rows, writes);
    expect(after.find((row) => row.productId === PROMO_LIFETIME)).toEqual(grant);
    expect(after.some((row) => isEntitledAt(row, T0 + 10 * MONTH))).toBe(true);
  });

  it('scenario 2: a paid subscriber receives a grant that is later revoked — the paid row is never touched', () => {
    const paid = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo', event_timestamp_ms: T0 + DAY }), [paid]);
    const rows = [paid, grant];
    const writes = applyAll(grantEvent(PROMO_LIFETIME, { id: 'evt-revoke', type: 'CANCELLATION', event_timestamp_ms: T0 + 2 * DAY }), rows);
    expect(writes.map((write) => write.productId)).toEqual([PROMO_LIFETIME]);
    expect(writes[0].snapshot).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 2 * DAY });
    const after = merge(rows, writes);
    expect(after.find((row) => row.productId === MONTHLY)).toEqual(paid);
    expect(after.some((row) => isEntitledAt(row, T0 + 10 * DAY))).toBe(true);
  });

  it('scenario 3: an expired Sandbox trial is written in the SANDBOX environment; the production grant is not its subject', () => {
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo' }));
    // The handler reads the SANDBOX mirror for a SANDBOX event: the production rows are not even passed in.
    const sandboxTrial = parse(lifecycleEvent('EXPIRATION', { id: 'evt-sb', environment: 'SANDBOX', store: 'TEST_STORE', product_id: 'plus_monthly_test', period_type: 'TRIAL', event_timestamp_ms: T0 + DAY, expiration_at_ms: T0 + DAY }));
    const decision = projectRevenueCatEvent(sandboxTrial, { subject: read(USER_A, []) });
    expect(decision.writes).toHaveLength(1);
    expect(decision.writes[0]).toMatchObject({ environment: 'SANDBOX', productId: 'plus_monthly_test' });
    expect(decision.writes[0].snapshot.status).toBe('EXPIRED');
    expect(grant.status).toBe('COMPLIMENTARY');
  });

  it('scenario 4: two grants of different durations — the earlier one expiring never touches the later or lifetime one', () => {
    const monthly = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-m', expiration_at_ms: T0 + MONTH }));
    const lifetime = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-l', event_timestamp_ms: T0 + DAY }), [monthly]);
    const writes = applyAll(grantEvent(PROMO_MONTHLY, { id: 'evt-end', type: 'EXPIRATION', event_timestamp_ms: T0 + MONTH, expiration_at_ms: T0 + MONTH }), [monthly, lifetime]);
    expect(writes.map((write) => write.productId)).toEqual([PROMO_MONTHLY]);
    const after = merge([monthly, lifetime], writes);
    expect(after.find((row) => row.productId === PROMO_LIFETIME)).toEqual(lifetime);
    expect(after.some((row) => isEntitledAt(row, T0 + 2 * MONTH))).toBe(true);
  });

  it('scenario 5: two grants of the SAME product — the row keeps the later end, and the earlier grant reaching its end is STALE', () => {
    const first = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-g1', expiration_at_ms: T0 + 30 * DAY }));
    const second = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-g2', event_timestamp_ms: T0 + 10 * DAY, expiration_at_ms: T0 + 40 * DAY }), [first]);
    expect(second).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: T0 + 40 * DAY, expiresAtMs: T0 + 40 * DAY });
    // RevenueCat requires a later end for a further grant; a delivery that says otherwise never shortens the row.
    const shorter = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-g3', event_timestamp_ms: T0 + 11 * DAY, expiration_at_ms: T0 + 35 * DAY }), [second]);
    expect(shorter.entitledUntilMs).toBe(T0 + 40 * DAY);
    const stale = projectRevenueCatEvent(parse(grantEvent(PROMO_MONTHLY, { id: 'evt-end1', type: 'EXPIRATION', event_timestamp_ms: T0 + 30 * DAY, expiration_at_ms: T0 + 30 * DAY })), { subject: read(USER_A, [second]) });
    expect(stale).toMatchObject({ outcome: 'STALE', writes: [] });
    const ended = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-end2', type: 'EXPIRATION', event_timestamp_ms: T0 + 40 * DAY, expiration_at_ms: T0 + 40 * DAY }), [second]);
    expect(ended.status).toBe('EXPIRED');
  });

  it('a lifetime grant joined by a dated grant of the same product keeps no end', () => {
    const lifetime = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-l' }));
    const again = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-l2', event_timestamp_ms: T0 + DAY, expiration_at_ms: T0 + MONTH }), [lifetime]);
    expect(again.entitledUntilMs).toBeNull();
  });

  it('scenario 12: revoking promotional access ends EVERY promotional row at once and leaves paid rows alone', () => {
    const paid = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const monthly = apply(grantEvent(PROMO_MONTHLY, { id: 'evt-m', event_timestamp_ms: T0 + DAY, expiration_at_ms: T0 + MONTH }), [paid]);
    const lifetime = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-l', event_timestamp_ms: T0 + 2 * DAY }), [paid, monthly]);
    const decision = projectRevenueCatEvent(parse(grantEvent(PROMO_LIFETIME, { id: 'evt-revoke', type: 'CANCELLATION', event_timestamp_ms: T0 + 3 * DAY })), { subject: read(USER_A, [paid, monthly, lifetime]) });
    expect(decision).toMatchObject({ outcome: 'APPLIED', detail: 'promotional grants revoked', reconcile: [USER_A] });
    expect(decision.writes.map((write) => write.productId).sort()).toEqual([PROMO_LIFETIME, PROMO_MONTHLY]);
    for (const write of decision.writes) expect(write.snapshot).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 3 * DAY, latestEventId: 'evt-revoke' });
    expect(decision.writes.find((write) => write.productId === PROMO_MONTHLY)?.expectedLatestEventId).toBe('evt-m');
    const after = merge([paid, monthly, lifetime], decision.writes);
    expect(after.find((row) => row.productId === MONTHLY)).toEqual(paid);
  });

  it('revoking a grant that was never mirrored records an EXPIRED row for it', () => {
    const decision = projectRevenueCatEvent(parse(grantEvent(PROMO_LIFETIME, { id: 'evt-revoke', type: 'CANCELLATION', event_timestamp_ms: T0 + 3 * DAY })), { subject: read(USER_A, []) });
    expect(decision.writes).toHaveLength(1);
    expect(decision.writes[0]).toMatchObject({ productId: PROMO_LIFETIME, expectedLatestEventId: null });
    expect(decision.writes[0].snapshot).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 3 * DAY });
  });
});

describe('duplicate, delayed and out-of-order deliveries', () => {
  it('an event older than the latest applied one OF ITS PRODUCT is STALE: a delayed CANCELLATION never undoes a renewal', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const renewed = apply(lifecycleEvent('RENEWAL', { id: 'evt-2', event_timestamp_ms: T0 + MONTH, expiration_at_ms: T0 + 2 * MONTH }), [active]);
    const delayed = projectRevenueCatEvent(parse(lifecycleEvent('CANCELLATION', { id: 'evt-late', event_timestamp_ms: T0 + 10 * DAY })), { subject: read(USER_A, [renewed]) });
    expect(delayed).toMatchObject({ outcome: 'STALE', detail: 'older than the latest applied event', userId: USER_A, writes: [], reconcile: [USER_A] });
  });

  it('a newer event about ANOTHER product is not stale: the guard is per product', () => {
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo', event_timestamp_ms: T0 + MONTH }));
    const paidLate = projectRevenueCatEvent(parse(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1', event_timestamp_ms: T0 + DAY, purchased_at_ms: T0 + DAY, expiration_at_ms: T0 + DAY + MONTH })), { subject: read(USER_A, [grant]) });
    expect(paidLate.outcome).toBe('APPLIED');
    expect(paidLate.writes[0]).toMatchObject({ productId: MONTHLY, expectedLatestEventId: null });
  });

  it('scenario 7: an EXPIRATION of an earlier period never overrides a later known renewal, even when it arrives later', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const renewed = apply(lifecycleEvent('RENEWAL', { id: 'evt-2', event_timestamp_ms: T0 + MONTH - 3600_000, expiration_at_ms: T0 + 2 * MONTH }), [active]);
    const stale = projectRevenueCatEvent(
      parse(lifecycleEvent('EXPIRATION', { id: 'evt-3', event_timestamp_ms: T0 + MONTH + 3600_000, expiration_at_ms: T0 + MONTH })),
      { subject: read(USER_A, [renewed]) },
    );
    expect(stale).toMatchObject({ outcome: 'STALE', detail: 'expiration of an earlier period; a later renewal is known', writes: [] });
  });

  it('two events at the same instant apply in arrival order', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    expect(apply(lifecycleEvent('CANCELLATION', { id: 'evt-2', event_timestamp_ms: T0 }), [active]).status).toBe('CANCELLED_ACTIVE');
  });

  it('a row written by the reconciliation alone (no event instant) accepts the next event', () => {
    const reconciled: EntitlementSnapshot = { ...apply(lifecycleEvent('INITIAL_PURCHASE')), latestEventId: null, latestEventType: null, latestEventAtMs: null, source: 'RECONCILIATION' };
    const decision = projectRevenueCatEvent(parse(lifecycleEvent('RENEWAL', { event_timestamp_ms: T0 + MONTH })), { subject: read(USER_A, [reconciled]) });
    expect(decision.outcome).toBe('APPLIED');
    expect(decision.writes[0].expectedLatestEventId).toBeNull();
  });

  it('a delayed revocation older than a later grant of the same product does not end it', () => {
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-l', event_timestamp_ms: T0 + 2 * DAY }));
    const decision = projectRevenueCatEvent(parse(grantEvent(PROMO_LIFETIME, { id: 'evt-old-revoke', type: 'CANCELLATION', event_timestamp_ms: T0 + DAY })), { subject: read(USER_A, [grant]) });
    expect(decision).toMatchObject({ outcome: 'STALE', writes: [] });
  });
});

describe('transfer between accounts', () => {
  const transfer = (overrides: Record<string, unknown> = {}) =>
    parse(
      lifecycleEvent('TRANSFER', {
        id: 'evt-transfer',
        event_timestamp_ms: T0 + 10 * DAY,
        app_user_id: undefined,
        original_app_user_id: undefined,
        aliases: undefined,
        product_id: undefined,
        entitlement_ids: undefined,
        period_type: undefined,
        purchased_at_ms: undefined,
        expiration_at_ms: undefined,
        transaction_id: undefined,
        original_transaction_id: undefined,
        transferred_from: [USER_A],
        transferred_to: [USER_B],
        ...overrides,
      }),
    );

  it('the transferred-from user loses the mirrored store purchase at once; the receiver gets nothing invented and is reconciled', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const decision = projectRevenueCatEvent(transfer(), { transferredFrom: [read(USER_A, [active])], transferredTo: [read(USER_B)] });
    expect(decision).toMatchObject({ outcome: 'APPLIED', userId: USER_A, reconcile: [USER_A, USER_B] });
    expect(decision.writes).toHaveLength(1);
    expect(decision.writes[0]).toMatchObject({ userId: USER_A, environment: 'PRODUCTION', productId: MONTHLY, expectedLatestEventId: 'evt-1' });
    expect(decision.writes[0].snapshot).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + 10 * DAY, willRenew: false, latestEventId: 'evt-transfer', latestEventType: 'TRANSFER' });
  });

  it('scenario 13: a transfer of the paid subscription leaves an independent promotional grant with the account', () => {
    const paid = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo', event_timestamp_ms: T0 + DAY }), [paid]);
    const decision = projectRevenueCatEvent(transfer(), { transferredFrom: [read(USER_A, [paid, grant])], transferredTo: [read(USER_B)] });
    expect(decision.writes.map((write) => write.productId)).toEqual([MONTHLY]);
    const after = merge([paid, grant], decision.writes);
    expect(after.find((row) => row.productId === PROMO_LIFETIME)).toEqual(grant);
    expect(after.some((row) => isEntitledAt(row, T0 + 10 * MONTH))).toBe(true);
  });

  it('with nothing mirrored to revoke, the transfer is recorded and both sides are reconciled', () => {
    const grant = apply(grantEvent(PROMO_LIFETIME, { id: 'evt-promo' }));
    const decision = projectRevenueCatEvent(transfer(), { transferredFrom: [read(USER_A, [grant])], transferredTo: [read(USER_B)] });
    expect(decision).toMatchObject({ outcome: 'IGNORED', writes: [], reconcile: [USER_A, USER_B] });
    expect(decision.detail).toMatch(/no mirrored store purchase to revoke/);
  });

  it('a transfer without environment cannot be placed: recorded, left to the reconciliation', () => {
    const active = apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' }));
    const decision = projectRevenueCatEvent(transfer({ environment: undefined }), { transferredFrom: [read(USER_A, [active])], transferredTo: [NOBODY] });
    expect(decision).toMatchObject({ outcome: 'IGNORED', writes: [], reconcile: [USER_A, USER_B] });
    expect(decision.detail).toMatch(/without environment/);
  });

  it('an already expired or newer row is left alone', () => {
    const expired = { ...apply(lifecycleEvent('INITIAL_PURCHASE', { id: 'evt-1' })), status: 'EXPIRED' as const };
    expect(projectRevenueCatEvent(transfer(), { transferredFrom: [read(USER_A, [expired])], transferredTo: [read(USER_B)] }).writes).toEqual([]);
    const newer = apply(lifecycleEvent('RENEWAL', { id: 'evt-2', event_timestamp_ms: T0 + MONTH }));
    expect(projectRevenueCatEvent(transfer(), { transferredFrom: [read(USER_A, [newer])], transferredTo: [] }).writes).toEqual([]);
  });
});

describe('unknown mappings and unsupported events', () => {
  it('no matching Supabase user: UNMATCHED, nothing written, nothing reconciled', () => {
    const anonymous = parse(lifecycleEvent('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:abc', original_app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc'] }));
    expect(projectRevenueCatEvent(anonymous, { subject: NOBODY })).toEqual({ outcome: 'UNMATCHED', detail: 'no App User ID is an existing Supabase user', userId: null, writes: [], reconcile: [] });
    expect(projectRevenueCatEvent(anonymous, {})).toMatchObject({ outcome: 'UNMATCHED' });
  });

  it('an event type this phase does not interpret is UNSUPPORTED, attributed to the user when known', () => {
    expect(projectRevenueCatEvent(parse(lifecycleEvent('SUBSCRIPTION_PAUSED')), { subject: read(USER_A) })).toMatchObject({ outcome: 'UNSUPPORTED', userId: USER_A, writes: [], reconcile: [] });
    expect(projectRevenueCatEvent(parse(lifecycleEvent('REFUND_REVERSED')), { subject: NOBODY })).toMatchObject({ outcome: 'UNSUPPORTED', userId: null });
  });

  it('the dashboard TEST event is IGNORED', () => {
    expect(projectRevenueCatEvent(parse(lifecycleEvent('TEST')), { subject: read(USER_A) })).toMatchObject({ outcome: 'IGNORED', detail: 'dashboard test event', writes: [] });
  });

  it('an event from another RevenueCat app is IGNORED when a filter is configured; an event without app_id passes', () => {
    const event = parse(lifecycleEvent('INITIAL_PURCHASE'));
    expect(projectRevenueCatEvent(event, { subject: read(USER_A), allowedAppIds: ['other-app'] })).toMatchObject({ outcome: 'IGNORED', detail: 'app_id is not an allowed RevenueCat app' });
    expect(projectRevenueCatEvent(event, { subject: read(USER_A), allowedAppIds: [APP_ID] }).outcome).toBe('APPLIED');
    expect(projectRevenueCatEvent(event, { subject: read(USER_A), allowedAppIds: [] }).outcome).toBe('APPLIED');
    expect(projectRevenueCatEvent(parse(grantEvent(PROMO_LIFETIME)), { subject: read(USER_A), allowedAppIds: ['other-app'] }).outcome).toBe('APPLIED');
  });

  it('a product not mapped to the plus entitlement is IGNORED', () => {
    expect(projectRevenueCatEvent(parse(lifecycleEvent('INITIAL_PURCHASE', { entitlement_ids: ['other'] })), { subject: read(USER_A) })).toMatchObject({ outcome: 'IGNORED', detail: 'product not mapped to the plus entitlement' });
    expect(projectRevenueCatEvent(parse(lifecycleEvent('INITIAL_PURCHASE', { entitlement_ids: null })), { subject: read(USER_A) })).toMatchObject({ outcome: 'IGNORED' });
  });

  it('a lifecycle event without environment is IGNORED: the mirror is per environment', () => {
    expect(projectRevenueCatEvent(parse(lifecycleEvent('INITIAL_PURCHASE', { environment: undefined })), { subject: read(USER_A) })).toMatchObject({ outcome: 'IGNORED', detail: 'event without environment', userId: USER_A });
  });
});
