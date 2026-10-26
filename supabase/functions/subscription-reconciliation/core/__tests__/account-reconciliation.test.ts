// One account against RevenueCat: every subscription state the mirror knows,
// the three non-evidence answers, the "confirmed later" guard, the
// conservative absence rule, account isolation, and DRY_RUN writing nothing.

import type { EntitlementSnapshot, SubscriptionEnvironment } from '../../../revenuecat-webhook/core/entitlement-snapshot';
import { USER_A, USER_B } from '../../../revenuecat-webhook/core/testing/event-fixtures';
import { FakeSubscriptionMirror } from '../../../revenuecat-webhook/core/testing/fake-mirror';
import { differsMaterially, reconcileAccount, type AccountToReconcile, type ReconciliationMode } from '../account-reconciliation';
import {
  ANNUAL,
  DAY,
  FakeSubscriberStateApi,
  iso,
  MONTH,
  MONTHLY,
  PROMO_LIFETIME,
  PROMO_MONTHLY,
  promotional,
  REQUEST_DATE,
  subscriberBody,
  subscription,
  summaryOf,
  T0,
  TEST_PRODUCT,
} from '../testing/subscriber-fixtures';

const NOW = REQUEST_DATE + 1000;

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

interface World {
  readonly mirror: FakeSubscriptionMirror;
  readonly api: FakeSubscriberStateApi;
  reconcile(userId?: string, mode?: ReconciliationMode): ReturnType<typeof reconcileAccount>;
}

function world(rows: { environment?: SubscriptionEnvironment; row: EntitlementSnapshot }[] = []): World {
  const mirror = new FakeSubscriptionMirror();
  mirror.addUser({ id: USER_A, businessId: 'biz-a' });
  mirror.addUser({ id: USER_B, businessId: 'biz-b' });
  for (const { environment = 'PRODUCTION', row } of rows) mirror.setSnapshot(USER_A, environment, row);
  const api = new FakeSubscriberStateApi();
  const access = { hasPlusAccess: async (userId: string) => mirror.hasPlusAccess(userId, NOW) };
  const account = (userId: string): AccountToReconcile => ({
    userId,
    businessId: `biz-${userId === USER_A ? 'a' : 'b'}`,
    appUserIds: [userId],
    mirrorRows: mirror.snapshots(userId, 'PRODUCTION').length + mirror.snapshots(userId, 'SANDBOX').length,
    plusAccess: mirror.hasPlusAccess(userId, NOW),
  });
  return {
    mirror,
    api,
    reconcile: (userId = USER_A, mode: ReconciliationMode = 'APPLY') => reconcileAccount(account(userId), { api, mirror, access, mode, now: () => NOW }),
  };
}

const found = (body: unknown) => ({ kind: 'found' as const, body });

describe('reconcileAccount — subscription states (APPLY)', () => {
  it('scenario 1: an active subscription becomes an ACTIVE row; access after is THE rule’s answer', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY) })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'APPLIED', detail: null, requests: 1, accessBefore: false, accessAfter: true, unlisted: [], failure: null });
    expect(report.changes).toEqual([
      { environment: 'PRODUCTION', productId: MONTHLY, before: null, after: { status: 'ACTIVE', entitledUntilMs: T0 + MONTH }, result: 'applied' },
    ]);
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'ACTIVE', store: 'APP_STORE', plan: 'MONTHLY', source: 'RECONCILIATION', verifiedAtMs: REQUEST_DATE });
    expect(w.api.calls).toEqual([USER_A]);
  });

  it('scenario 2: a trial becomes a TRIAL row granting access until its end', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ period_type: 'trial', expires_date: iso(T0 + 14 * DAY) }) }, { summary: summaryOf(MONTHLY, iso(T0 + 14 * DAY)) })));
    const report = await w.reconcile();
    expect(report.outcome).toBe('APPLIED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'TRIAL', periodType: 'TRIAL', entitledUntilMs: T0 + 14 * DAY, willRenew: true });
    expect(report.accessAfter).toBe(true);
  });

  it('scenario 3: a cancelled subscription inside its period is CANCELLED_ACTIVE, renewal off, access kept until its end', async () => {
    const w = world([{ row: paidRow }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ unsubscribe_detected_at: iso(T0 + 5 * DAY) }) }, { summary: summaryOf(MONTHLY) })));
    const report = await w.reconcile();
    expect(report.outcome).toBe('APPLIED');
    expect(report.changes[0]).toMatchObject({ before: { status: 'ACTIVE' }, after: { status: 'CANCELLED_ACTIVE', entitledUntilMs: T0 + MONTH }, result: 'applied' });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'CANCELLED_ACTIVE', willRenew: false, unsubscribeDetectedAtMs: T0 + 5 * DAY, originalTransactionId: 'tx-original', pendingProductId: ANNUAL });
    expect(report.accessAfter).toBe(true);
  });

  it('scenario 4: a subscription whose end is behind the request date is EXPIRED — a confirmed end, access lost', async () => {
    const w = world([{ row: paidRow }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY), requestDateMs: T0 + MONTH + DAY })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'APPLIED', accessBefore: true, accessAfter: false });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'EXPIRED', entitledUntilMs: T0 + MONTH, willRenew: false });
  });

  it('scenario 5: a renewal after a previously expired row restores ACTIVE with the new end', async () => {
    const w = world([{ row: { ...paidRow, status: 'EXPIRED', willRenew: false, verifiedAtMs: T0 + MONTH } }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ expires_date: iso(T0 + 2 * MONTH) }) }, { summary: summaryOf(MONTHLY, iso(T0 + 2 * MONTH)), requestDateMs: T0 + MONTH + DAY })));
    const report = await w.reconcile();
    expect(report.outcome).toBe('APPLIED');
    expect(report.changes[0]).toMatchObject({ before: { status: 'EXPIRED' }, after: { status: 'ACTIVE', entitledUntilMs: T0 + 2 * MONTH } });
    expect(report.accessAfter).toBe(true);
  });

  it('scenario 6: a billing issue with a store grace is BILLING_RETRY until the confirmed grace end', async () => {
    const grace = T0 + MONTH + 16 * DAY;
    const w = world([{ row: paidRow }]);
    w.api.script(
      USER_A,
      found(subscriberBody(USER_A, { [MONTHLY]: subscription({ billing_issues_detected_at: iso(T0 + MONTH), grace_period_expires_date: iso(grace) }) }, { summary: summaryOf(MONTHLY), requestDateMs: T0 + MONTH + DAY })),
    );
    const report = await w.reconcile();
    expect(report.outcome).toBe('APPLIED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'BILLING_RETRY', gracePeriodExpiresAtMs: grace, entitledUntilMs: grace, billingIssueDetectedAtMs: T0 + MONTH });
  });

  it('scenario 7: a complimentary grant with an expiration is COMPLIMENTARY until that end', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [PROMO_MONTHLY]: promotional({ expires_date: iso(T0 + MONTH) }) })));
    const report = await w.reconcile();
    expect(report.outcome).toBe('APPLIED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_MONTHLY)).toMatchObject({ status: 'COMPLIMENTARY', store: 'PROMOTIONAL', entitledUntilMs: T0 + MONTH, willRenew: false, plan: 'UNKNOWN' });
    expect(report.accessAfter).toBe(true);
  });

  it('scenario 8: an indefinite complimentary grant has NO end — none is invented — and grants indefinitely', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [PROMO_LIFETIME]: promotional() }, { summary: summaryOf(PROMO_LIFETIME, null) })));
    const report = await w.reconcile();
    expect(report.changes[0].after).toEqual({ status: 'COMPLIMENTARY', entitledUntilMs: null });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toMatchObject({ status: 'COMPLIMENTARY', entitledUntilMs: null, expiresAtMs: null });
    expect(w.mirror.hasPlusAccess(USER_A, NOW + 20 * 365 * DAY)).toBe(true);
  });

  it('scenario 9: a Sandbox-only subscriber gets a SANDBOX row and no production access', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ is_sandbox: true }) }, { summary: summaryOf(MONTHLY) })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'APPLIED', accessAfter: false });
    expect(report.changes[0]).toMatchObject({ environment: 'SANDBOX', productId: MONTHLY, after: { status: 'ACTIVE' } });
    expect(w.mirror.snapshots(USER_A, 'PRODUCTION')).toEqual([]);
    expect(w.mirror.snapshot(USER_A, 'SANDBOX', MONTHLY)).toMatchObject({ status: 'ACTIVE' });
  });

  it('scenario 10: a Test Store subscription is mirrored in SANDBOX and grants nothing; even labelled production, its store grants nothing', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [TEST_PRODUCT]: subscription({ is_sandbox: true, store: 'test_store' }) }, { summary: summaryOf(TEST_PRODUCT) })));
    expect(await w.reconcile()).toMatchObject({ outcome: 'APPLIED', accessAfter: false });
    expect(w.mirror.snapshot(USER_A, 'SANDBOX', TEST_PRODUCT)).toMatchObject({ status: 'ACTIVE', store: 'TEST_STORE' });

    const labelled = world();
    labelled.api.script(USER_A, found(subscriberBody(USER_A, { [TEST_PRODUCT]: subscription({ is_sandbox: false, store: 'test_store' }) }, { summary: summaryOf(TEST_PRODUCT) })));
    expect(await labelled.reconcile()).toMatchObject({ outcome: 'APPLIED', accessAfter: false });
    expect(labelled.mirror.snapshot(USER_A, 'PRODUCTION', TEST_PRODUCT)).toMatchObject({ store: 'TEST_STORE' });
  });

  it('scenario 11: a product of another entitlement, a promotional grant of another entitlement, an unknown product: no source — NO_SOURCES, nothing written', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { rc_promo_other_lifetime: promotional(), unrelated_product: subscription() }, { summary: undefined })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'NO_SOURCES', detail: 'the customer grants nothing', changes: [], accessAfter: null });
    expect(w.mirror.reconciliations).toEqual([]);
    expect(w.mirror.snapshots(USER_A, 'PRODUCTION')).toEqual([]);
  });

  it('two concurrent sources are two rows; the paid one expiring leaves the lifetime grant in force', async () => {
    const w = world([{ row: paidRow }, { row: grantRow }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() }, { summary: summaryOf(PROMO_LIFETIME, null), requestDateMs: T0 + MONTH + DAY })));
    const report = await w.reconcile();
    expect(report.outcome).toBe('APPLIED');
    expect(report.changes.map((change) => [change.productId, change.result])).toEqual([
      [MONTHLY, 'applied'],
      [PROMO_LIFETIME, 'confirmed'],
    ]);
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.status).toBe('EXPIRED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toMatchObject({ status: 'COMPLIMENTARY', latestEventId: 'evt-promo' });
    expect(report.accessAfter).toBe(true);
  });
});

describe('reconcileAccount — answers that are not evidence', () => {
  it('scenario 12: a missing RevenueCat subscriber (created by the read) is NO_SUBSCRIBER with an empty mirror; nothing invented', async () => {
    const w = world();
    w.api.script(USER_A, { kind: 'created' });
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'NO_SUBSCRIBER', requests: 1, changes: [], unlisted: [], accessAfter: null, failure: null });
    expect(report.detail).toContain('no RevenueCat customer');
    expect(w.mirror.reconciliations).toEqual([]);
  });

  it('scenario 12: a missing subscriber beside a mirrored source IN FORCE is INVESTIGATE — the row is never expired', async () => {
    const w = world([{ row: grantRow }]);
    w.api.script(USER_A, { kind: 'created' });
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'INVESTIGATE', unlisted: [`PRODUCTION:${PROMO_LIFETIME}`], changes: [] });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toEqual(grantRow);
    expect(w.mirror.reconciliations).toEqual([]);
  });

  it('a missing subscriber beside an already EXPIRED row is NO_SUBSCRIBER (nothing in force to investigate)', async () => {
    const w = world([{ row: { ...paidRow, status: 'EXPIRED', willRenew: false } }]);
    w.api.script(USER_A, { kind: 'created' });
    expect((await w.reconcile()).outcome).toBe('NO_SUBSCRIBER');
  });

  it('an existing customer listing no source beside a mirrored source in force is INVESTIGATE; beside nothing in force it is NO_SOURCES', async () => {
    const w = world([{ row: paidRow }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, {})));
    expect(await w.reconcile()).toMatchObject({ outcome: 'INVESTIGATE', unlisted: [`PRODUCTION:${MONTHLY}`] });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(paidRow);

    const lapsed = world([{ row: { ...paidRow, entitledUntilMs: REQUEST_DATE - DAY } }]);
    lapsed.api.script(USER_A, found(subscriberBody(USER_A, {})));
    expect((await lapsed.reconcile()).outcome).toBe('NO_SOURCES');
  });

  it('the conservative absence rule: a mirrored source in force the answer does not list is left exactly as it is, the described one applied, the account INVESTIGATE', async () => {
    const w = world([{ row: paidRow }, { row: grantRow }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ expires_date: iso(T0 + 2 * MONTH) }) }, { summary: summaryOf(MONTHLY, iso(T0 + 2 * MONTH)) })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'INVESTIGATE', unlisted: [`PRODUCTION:${PROMO_LIFETIME}`] });
    expect(report.changes).toEqual([{ environment: 'PRODUCTION', productId: MONTHLY, before: { status: 'ACTIVE', entitledUntilMs: T0 + MONTH }, after: { status: 'ACTIVE', entitledUntilMs: T0 + 2 * MONTH }, result: 'applied' }]);
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.entitledUntilMs).toBe(T0 + 2 * MONTH);
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toEqual(grantRow);
  });

  it('a Sandbox row in force the answer does not list is reported too (never expired)', async () => {
    const w = world([{ environment: 'SANDBOX', row: { ...paidRow, verifiedAtMs: T0 } }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [PROMO_LIFETIME]: promotional() })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'INVESTIGATE', unlisted: [`SANDBOX:${MONTHLY}`] });
    expect(w.mirror.snapshot(USER_A, 'SANDBOX', MONTHLY)?.status).toBe('ACTIVE');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)?.status).toBe('COMPLIMENTARY');
  });

  it('scenario 13: a malformed API answer is FAILED (malformed), nothing written, access untouched', async () => {
    const w = world([{ row: paidRow }]);
    w.api.script(USER_A, found({ nonsense: true }));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'FAILED', detail: 'malformed subscriber answer', failure: 'malformed', requests: 1, changes: [], accessAfter: null });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(paidRow);
    expect(w.mirror.reconciliations).toEqual([]);
  });

  it('scenario 15: HTTP errors, network failures and rate limits are FAILED with their class and attempts — never an expiration', async () => {
    for (const [failure, status, attempts] of [
      ['rate_limited', 429, 3],
      ['unavailable', 503, 3],
      ['network', null, 3],
      ['timeout', null, 2],
      ['unauthorized', 401, 1],
      ['rejected', 404, 1],
    ] as const) {
      const w = world([{ row: paidRow }, { row: grantRow }]);
      w.api.script(USER_A, { kind: 'failure', failure, status, attempts });
      const report = await w.reconcile();
      expect(report).toMatchObject({ outcome: 'FAILED', failure, requests: attempts, changes: [], accessBefore: true, accessAfter: null });
      expect(report.detail).toBe(status === null ? `revenuecat api ${failure}` : `revenuecat api ${failure} (${status})`);
      expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(paidRow);
      expect(w.mirror.snapshot(USER_A, 'PRODUCTION', PROMO_LIFETIME)).toEqual(grantRow);
      expect(w.mirror.reconciliations).toEqual([]);
    }
    const w = world([{ row: paidRow }]);
    w.api.script(USER_A, { kind: 'throw', error: new Error('something else') });
    expect(await w.reconcile()).toMatchObject({ outcome: 'FAILED', failure: 'network', detail: 'revenuecat request failed' });
  });

  it('a mirror read failure or write failure is FAILED (mirror), with what was written before it reported', async () => {
    const w = world([{ row: paidRow }]);
    const readMirror = w.mirror.readMirror.bind(w.mirror);
    w.mirror.readMirror = async () => {
      throw new Error('subscriptions: subscription_read_mirror failed: boom');
    };
    expect(await w.reconcile()).toMatchObject({ outcome: 'FAILED', failure: 'mirror', detail: 'mirror read failed', requests: 0 });
    expect(w.api.calls).toEqual([]);

    w.mirror.readMirror = readMirror;
    w.mirror.applyReconciliation = async () => {
      throw new Error('subscriptions: subscription_apply_reconciliation failed: boom');
    };
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY) })));
    expect(await w.reconcile()).toMatchObject({ outcome: 'FAILED', failure: 'mirror', detail: 'mirror write failed', requests: 1, changes: [] });
  });
});

describe('reconcileAccount — ordering, idempotence, isolation', () => {
  it('scenarios 16/17: a row confirmed LATER than the answer (a webhook landed in between) is STALE and untouched; the other rows apply', async () => {
    const w = world([{ row: { ...paidRow, verifiedAtMs: REQUEST_DATE + DAY, entitledUntilMs: T0 + 3 * MONTH, expiresAtMs: T0 + 3 * MONTH } }, { row: grantRow }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ expires_date: iso(T0 + 2 * MONTH) }), [PROMO_LIFETIME]: promotional() }, { summary: summaryOf(MONTHLY, iso(T0 + 2 * MONTH)) })));
    const report = await w.reconcile();
    expect(report.changes.map((change) => [change.productId, change.result])).toEqual([
      [MONTHLY, 'stale'],
      [PROMO_LIFETIME, 'confirmed'],
    ]);
    expect(report.outcome).toBe('CONFIRMED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.entitledUntilMs).toBe(T0 + 3 * MONTH);

    const allStale = world([{ row: { ...paidRow, verifiedAtMs: REQUEST_DATE + DAY } }]);
    allStale.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY) })));
    expect(await allStale.reconcile()).toMatchObject({ outcome: 'STALE', detail: 'every described row was confirmed later' });
    expect(allStale.mirror.reconciliations).toEqual([]);
  });

  it('scenario 16: a webhook EXPIRATION older than the answer loses to the answer that lists the renewed subscription', async () => {
    const w = world([{ row: { ...paidRow, status: 'EXPIRED', willRenew: false, verifiedAtMs: REQUEST_DATE - DAY, latestEventId: 'evt-exp', latestEventType: 'EXPIRATION' } }]);
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription({ expires_date: iso(T0 + 2 * MONTH) }) }, { summary: summaryOf(MONTHLY, iso(T0 + 2 * MONTH)) })));
    expect((await w.reconcile()).outcome).toBe('APPLIED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toMatchObject({ status: 'ACTIVE', latestEventId: 'evt-exp', source: 'RECONCILIATION' });
  });

  it('scenario 18: a duplicate reconciliation of the same answer is CONFIRMED — the rows read the same, only re-verified', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription(), [PROMO_LIFETIME]: promotional() }, { summary: summaryOf(MONTHLY) })));
    expect((await w.reconcile()).outcome).toBe('APPLIED');
    const afterFirst = w.mirror.snapshots(USER_A, 'PRODUCTION');
    const second = await w.reconcile();
    expect(second.outcome).toBe('CONFIRMED');
    expect(second.changes.every((change) => change.result === 'confirmed')).toBe(true);
    expect(w.mirror.snapshots(USER_A, 'PRODUCTION')).toEqual(afterFirst);
    expect(w.mirror.hasPlusAccess(USER_A, NOW)).toBe(true);
  });

  it('scenario 19: reconciling one account never reads, writes or reports another account’s rows', async () => {
    const w = world([{ row: paidRow }]);
    w.mirror.setSnapshot(USER_B, 'PRODUCTION', { ...grantRow, appUserId: USER_B, originalAppUserId: USER_B });
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY), requestDateMs: T0 + MONTH + DAY })));
    const report = await w.reconcile(USER_A);
    expect(report.userId).toBe(USER_A);
    expect(report.changes.map((change) => change.productId)).toEqual([MONTHLY]);
    expect(w.mirror.snapshot(USER_B, 'PRODUCTION', PROMO_LIFETIME)).toMatchObject({ status: 'COMPLIMENTARY', appUserId: USER_B });
    expect(w.mirror.hasPlusAccess(USER_B, NOW)).toBe(true);
    expect(w.mirror.hasPlusAccess(USER_A, NOW)).toBe(false);
    expect(w.api.calls).toEqual([USER_A]);
  });

  it('scenario 19: a subscriber whose original App User ID is ANOTHER account (alias / transfer across accounts) is INVESTIGATE for both, nothing applied', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY), originalAppUserId: USER_B })));
    const report = await w.reconcile();
    expect(report).toMatchObject({ outcome: 'INVESTIGATE', changes: [], requests: 1 });
    expect(report.detail).toContain('another account');
    expect(w.mirror.reconciliations).toEqual([]);
    expect(w.mirror.snapshots(USER_B, 'PRODUCTION')).toEqual([]);
  });

  it('an original App User ID that is not a Supabase user (an anonymous RevenueCat id) is just an attribute: applied normally', async () => {
    const w = world();
    w.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY), originalAppUserId: '$RCAnonymousID:abc' })));
    expect((await w.reconcile()).outcome).toBe('APPLIED');
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)?.originalAppUserId).toBe('$RCAnonymousID:abc');
  });

  it('an account whose ids match nobody, or another user, is INVESTIGATE before any request', async () => {
    const w = world();
    const access = { hasPlusAccess: async () => false };
    const unknown = await reconcileAccount({ userId: '99999999-9999-4999-8999-999999999999', businessId: null, appUserIds: ['99999999-9999-4999-8999-999999999999'], mirrorRows: 0, plusAccess: false }, { api: w.api, mirror: w.mirror, access, mode: 'APPLY', now: () => NOW });
    expect(unknown).toMatchObject({ outcome: 'INVESTIGATE', requests: 0 });
    const other = await reconcileAccount({ userId: USER_A, businessId: null, appUserIds: [USER_B], mirrorRows: 0, plusAccess: false }, { api: w.api, mirror: w.mirror, access, mode: 'APPLY', now: () => NOW });
    expect(other).toMatchObject({ outcome: 'INVESTIGATE', detail: 'the App User IDs match another account', requests: 0 });
    expect(w.api.calls).toEqual([]);
  });
});

describe('reconcileAccount — DRY_RUN', () => {
  it('scenario 22: computes exactly what APPLY would write — and writes nothing, asks access after nothing', async () => {
    const w = world([{ row: paidRow }, { row: grantRow }]);
    const body = subscriberBody(USER_A, { [MONTHLY]: subscription({ unsubscribe_detected_at: iso(T0 + 5 * DAY) }), [PROMO_LIFETIME]: promotional() }, { summary: summaryOf(MONTHLY) });
    w.api.script(USER_A, found(body));
    const dry = await w.reconcile(USER_A, 'DRY_RUN');
    expect(dry).toMatchObject({ outcome: 'APPLIED', accessBefore: true, accessAfter: null, requests: 1 });
    expect(dry.changes.map((change) => [change.productId, change.result])).toEqual([
      [MONTHLY, 'would-apply'],
      [PROMO_LIFETIME, 'would-confirm'],
    ]);
    expect(dry.changes[0]).toMatchObject({ before: { status: 'ACTIVE' }, after: { status: 'CANCELLED_ACTIVE', entitledUntilMs: T0 + MONTH } });
    expect(w.mirror.snapshot(USER_A, 'PRODUCTION', MONTHLY)).toEqual(paidRow);
    expect(w.mirror.reconciliations).toEqual([]);

    const applied = await w.reconcile(USER_A, 'APPLY');
    const asApplied = { 'would-apply': 'applied', 'would-confirm': 'confirmed', 'would-be-stale': 'stale' } as const;
    expect(applied.changes.map((change) => [change.productId, change.result, change.after])).toEqual(
      dry.changes.map((change) => [change.productId, asApplied[change.result as keyof typeof asApplied], change.after]),
    );
  });

  it('scenario 22: a dry run reports would-be-stale rows, missing subscribers and failures the same way, writing nothing', async () => {
    const stale = world([{ row: { ...paidRow, verifiedAtMs: REQUEST_DATE + DAY } }]);
    stale.api.script(USER_A, found(subscriberBody(USER_A, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY) })));
    expect(await stale.reconcile(USER_A, 'DRY_RUN')).toMatchObject({ outcome: 'STALE' });
    expect((await stale.reconcile(USER_A, 'DRY_RUN')).changes[0].result).toBe('would-be-stale');

    const missing = world();
    missing.api.script(USER_A, { kind: 'created' });
    expect((await missing.reconcile(USER_A, 'DRY_RUN')).outcome).toBe('NO_SUBSCRIBER');

    const failing = world([{ row: paidRow }]);
    failing.api.script(USER_A, { kind: 'failure', failure: 'unavailable', status: 503, attempts: 3 });
    expect(await failing.reconcile(USER_A, 'DRY_RUN')).toMatchObject({ outcome: 'FAILED', requests: 3 });
    expect(failing.mirror.reconciliations).toEqual([]);
  });
});

describe('differsMaterially', () => {
  it('ignores the verification instant and the webhook facts; reads every state field', () => {
    expect(differsMaterially(null, paidRow)).toBe(true);
    expect(differsMaterially(paidRow, { ...paidRow, verifiedAtMs: paidRow.verifiedAtMs + DAY, source: 'RECONCILIATION', latestTransactionId: 'other' })).toBe(false);
    for (const change of [
      { status: 'EXPIRED' as const },
      { entitledUntilMs: T0 + 2 * MONTH },
      { expiresAtMs: T0 + 2 * MONTH },
      { gracePeriodExpiresAtMs: T0 + 2 * MONTH },
      { willRenew: false },
      { store: 'PLAY_STORE' },
      { periodType: 'TRIAL' },
      { plan: 'ANNUAL' as const },
      { unsubscribeDetectedAtMs: T0 },
      { billingIssueDetectedAtMs: T0 },
    ]) {
      expect(differsMaterially(paidRow, { ...paidRow, ...change })).toBe(true);
    }
  });
});
