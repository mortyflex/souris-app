// The pass: the request contract (safe defaults, exact vocabulary), the
// single-user and batched backfill, dry-run, partial failures settled one by
// one, early stops, bounded requests with spacing, continuation and leases.

import { USER_A, USER_B } from '../../../revenuecat-webhook/core/testing/event-fixtures';
import { FakeSubscriptionMirror } from '../../../revenuecat-webhook/core/testing/fake-mirror';
import type { AccountToReconcile } from '../account-reconciliation';
import {
  DEFAULT_BATCH_LIMIT,
  describePassForLog,
  MAX_BATCH_LIMIT,
  parseRunRequest,
  runReconciliationPass,
  sanitizeFailure,
  type RunRequest,
} from '../run';
import { FakeReconciliationControl } from '../testing/fake-control';
import { FakeSubscriberStateApi, MONTHLY, PROMO_LIFETIME, promotional, REQUEST_DATE, subscriberBody, subscription, summaryOf } from '../testing/subscriber-fixtures';

const USER_C = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const USER_D = '8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a';
const NOW = REQUEST_DATE + 1000;

function request(overrides: Partial<RunRequest> = {}): RunRequest {
  return { kind: 'BACKFILL', mode: 'APPLY', scope: { source: 'businesses' }, limit: DEFAULT_BATCH_LIMIT, after: null, minAgeSeconds: 0, ...overrides };
}

function harness() {
  const mirror = new FakeSubscriptionMirror();
  const api = new FakeSubscriberStateApi();
  const control = new FakeReconciliationControl();
  control.nowMs = NOW;
  const waits: number[] = [];
  const access = { hasPlusAccess: async (userId: string) => mirror.hasPlusAccess(userId, NOW) };
  const addAccount = (userId: string, extra: Partial<AccountToReconcile> = {}) => {
    mirror.addUser({ id: userId, businessId: `biz-${userId.slice(0, 4)}` });
    control.addAccount({ userId, businessId: `biz-${userId.slice(0, 4)}`, appUserIds: [userId], mirrorRows: 0, plusAccess: false, ...extra });
  };
  const run = (overrides: Partial<RunRequest> = {}) =>
    runReconciliationPass(request(overrides), { control, api, mirror, access, sleep: async (ms) => void waits.push(ms), spacingMs: 1000, now: () => NOW });
  return { mirror, api, control, waits, addAccount, run };
}

const active = (userId: string) => ({ kind: 'found' as const, body: subscriberBody(userId, { [MONTHLY]: subscription() }, { summary: summaryOf(MONTHLY) }) });

describe('parseRunRequest — safe defaults, exact vocabulary', () => {
  it('no body is a DRY_RUN SWEEP of the mirrored accounts', () => {
    for (const body of [undefined, null, {}]) {
      expect(parseRunRequest(body)).toEqual({ ok: true, request: { kind: 'SWEEP', mode: 'DRY_RUN', scope: { source: 'mirrored' }, limit: DEFAULT_BATCH_LIMIT, after: null, minAgeSeconds: 0 } });
    }
  });

  it('an explicit user list is a BACKFILL by default; writing takes an explicit APPLY', () => {
    expect(parseRunRequest({ users: [` ${USER_A} `] })).toEqual({ ok: true, request: { kind: 'BACKFILL', mode: 'DRY_RUN', scope: { users: [USER_A] }, limit: DEFAULT_BATCH_LIMIT, after: null, minAgeSeconds: 0 } });
    expect(parseRunRequest({ users: [USER_A, USER_B], mode: 'APPLY', limit: 2 })).toMatchObject({ ok: true, request: { mode: 'APPLY', limit: 2 } });
    expect(parseRunRequest({ source: 'businesses', kind: 'BACKFILL', mode: 'APPLY', limit: 25, after: USER_A, minAgeSeconds: 3600 })).toEqual({
      ok: true,
      request: { kind: 'BACKFILL', mode: 'APPLY', scope: { source: 'businesses' }, limit: 25, after: USER_A, minAgeSeconds: 3600 },
    });
  });

  it('refuses everything outside the vocabulary — an unknown key included, so a misspelt mode never silently dry-runs or writes', () => {
    const refusals: [unknown, string][] = [
      ['nope', 'body must be a JSON object'],
      [[], 'body must be a JSON object'],
      [{ mode: 'apply' }, 'mode must be DRY_RUN or APPLY'],
      [{ Mode: 'APPLY' }, 'unknown key: Mode'],
      [{ dryRun: false }, 'unknown key: dryRun'],
      [{ users: [] }, 'users must be a non-empty array'],
      [{ users: 'x' }, 'users must be a non-empty array'],
      [{ users: [''] }, 'users must hold non-empty strings'],
      [{ users: [1] }, 'users must hold non-empty strings'],
      [{ users: Array.from({ length: 51 }, () => USER_A) }, 'users holds more than 50 entries'],
      [{ users: [USER_A], source: 'mirrored' }, 'users and source are exclusive'],
      [{ source: 'everyone' }, 'source must be mirrored or businesses'],
      [{ kind: 'sweep' }, 'kind must be SWEEP or BACKFILL'],
      [{ kind: 'SWEEP', users: [USER_A] }, 'a SWEEP takes a source, not a user list'],
      [{ limit: 0 }, `limit must be an integer between 1 and ${MAX_BATCH_LIMIT}`],
      [{ limit: 51 }, `limit must be an integer between 1 and ${MAX_BATCH_LIMIT}`],
      [{ limit: '10' }, `limit must be an integer between 1 and ${MAX_BATCH_LIMIT}`],
      [{ after: 'not-a-uuid', kind: 'BACKFILL' }, 'after must be a user id'],
      [{ after: USER_A }, 'a SWEEP takes no cursor'],
      [{ minAgeSeconds: -1 }, 'minAgeSeconds must be an integer between 0 and 30 days'],
      [{ minAgeSeconds: 1.5 }, 'minAgeSeconds must be an integer between 0 and 30 days'],
    ];
    for (const [body, reason] of refusals) expect(parseRunRequest(body)).toEqual({ ok: false, reason });
  });
});

describe('runReconciliationPass', () => {
  it('scenario 20: a single-user backfill reconciles that account only, settles it, closes the run', async () => {
    const h = harness();
    h.addAccount(USER_A);
    h.addAccount(USER_B);
    h.api.script(USER_A, active(USER_A));
    const summary = await h.run({ scope: { users: [USER_A] } });
    expect(summary).toMatchObject({ runId: 'run-1', kind: 'BACKFILL', mode: 'APPLY', status: 'COMPLETED', stoppedBy: null, selected: 1, processed: 1, counts: { APPLIED: 1 }, requests: 1, unknownUsers: [], nextCursor: null });
    expect(summary.accounts.map((account) => [account.userId, account.outcome, account.accessAfter])).toEqual([[USER_A, 'APPLIED', true]]);
    expect(h.api.calls).toEqual([USER_A]);
    expect(h.mirror.snapshots(USER_B, 'PRODUCTION')).toEqual([]);
    expect(h.control.runs[0]).toMatchObject({ status: 'COMPLETED', counts: { APPLIED: 1 }, report: [{ userId: USER_A, outcome: 'APPLIED' }] });
    expect(h.control.state(USER_A)).toMatchObject({ leaseRunId: null, lastOutcome: 'APPLIED', consecutiveFailures: 0 });
    expect(h.waits).toEqual([]);
  });

  it('scenario 20: an unknown user in the list is reported, never invented, and does not stop the known ones', async () => {
    const h = harness();
    h.addAccount(USER_A);
    h.api.script(USER_A, active(USER_A));
    const summary = await h.run({ scope: { users: [USER_A, '99999999-9999-4999-8999-999999999999', 'not-even-a-uuid'] } });
    expect(summary).toMatchObject({ status: 'COMPLETED', processed: 1, unknownUsers: ['99999999-9999-4999-8999-999999999999', 'not-even-a-uuid'] });
    expect(h.mirror.snapshots(USER_A, 'PRODUCTION')).toHaveLength(1);
  });

  it('scenario 21: a batch with partial failures settles every account on its own and completes', async () => {
    const h = harness();
    for (const user of [USER_A, USER_B, USER_C, USER_D]) h.addAccount(user);
    h.api.script(USER_A, active(USER_A));
    h.api.script(USER_B, { kind: 'failure', failure: 'unavailable', status: 503, attempts: 3 });
    h.api.script(USER_C, { kind: 'created' });
    h.api.script(USER_D, { kind: 'found', body: { nonsense: true } });
    const summary = await h.run();
    expect(summary).toMatchObject({ status: 'COMPLETED', processed: 4, counts: { APPLIED: 1, FAILED: 2, NO_SUBSCRIBER: 1 }, requests: 6 });
    // Processed in user-id order, one after the other.
    expect(summary.accounts.map((account) => [account.userId, account.outcome])).toEqual(
      (
        [
          [USER_A, 'APPLIED'],
          [USER_B, 'FAILED'],
          [USER_C, 'NO_SUBSCRIBER'],
          [USER_D, 'FAILED'],
        ] as [string, string][]
      ).sort((a, b) => a[0].localeCompare(b[0])),
    );
    expect(h.control.state(USER_B)).toMatchObject({ lastOutcome: 'FAILED', consecutiveFailures: 1, leaseRunId: null });
    expect(h.control.state(USER_B).nextAttemptAtMs).toBeGreaterThan(NOW);
    expect(h.control.state(USER_C)).toMatchObject({ lastOutcome: 'NO_SUBSCRIBER', consecutiveFailures: 0, nextAttemptAtMs: null });
    expect(h.mirror.snapshots(USER_B, 'PRODUCTION')).toEqual([]);
    expect(h.mirror.snapshots(USER_D, 'PRODUCTION')).toEqual([]);
    expect(h.waits).toEqual([1000, 1000, 1000]);
  });

  it('scenario 22: a dry run makes the same requests, writes nothing, leases nothing, and still records the run', async () => {
    const h = harness();
    h.addAccount(USER_A);
    h.addAccount(USER_B);
    h.api.script(USER_A, active(USER_A));
    h.api.script(USER_B, { kind: 'found', body: subscriberBody(USER_B, { [PROMO_LIFETIME]: promotional() }) });
    const summary = await h.run({ mode: 'DRY_RUN' });
    expect(summary).toMatchObject({ mode: 'DRY_RUN', status: 'COMPLETED', processed: 2, counts: { APPLIED: 2 }, requests: 2 });
    expect(summary.accounts.every((account) => account.changes.every((change) => change.result === 'would-apply') && account.accessAfter === null)).toBe(true);
    expect(h.mirror.reconciliations).toEqual([]);
    expect(h.mirror.snapshots(USER_A, 'PRODUCTION')).toEqual([]);
    expect(h.control.states.size).toBe(0);
    expect(h.control.runs[0]).toMatchObject({ status: 'COMPLETED', counts: { APPLIED: 2 } });
  });

  it('scenario 23: the backfill is repeatable and resumable — a second pass continues after the cursor; a re-run of the same batch confirms', async () => {
    const h = harness();
    for (const user of [USER_A, USER_B, USER_C, USER_D]) {
      h.addAccount(user);
      h.api.script(user, active(user));
    }
    const sorted = [USER_A, USER_B, USER_C, USER_D].sort();
    const first = await h.run({ limit: 2 });
    expect(first).toMatchObject({ status: 'COMPLETED', processed: 2, eligible: 4, nextCursor: sorted[1] });
    expect(first.accounts.map((account) => account.userId)).toEqual(sorted.slice(0, 2));
    const second = await h.run({ limit: 2, after: first.nextCursor });
    expect(second).toMatchObject({ status: 'COMPLETED', processed: 2, nextCursor: null });
    expect(second.accounts.map((account) => account.userId)).toEqual(sorted.slice(2));
    // Repeating the first batch from the start is safe: already reconciled accounts read CONFIRMED and nothing changes.
    const before = sorted.map((user) => h.mirror.snapshots(user, 'PRODUCTION'));
    const again = await h.run({ limit: 2 });
    expect(again).toMatchObject({ counts: { CONFIRMED: 2 } });
    expect(sorted.map((user) => h.mirror.snapshots(user, 'PRODUCTION'))).toEqual(before);
    // With a minimum age, recently reconciled accounts are skipped instead.
    const skipped = await h.run({ limit: 2, minAgeSeconds: 3600 });
    expect(skipped).toMatchObject({ processed: 0, skipped: { recent: 4 }, eligible: 0 });
  });

  it('scenario 24: API usage is bounded — one request per account at most the client’s attempts, spaced, never more than the batch', async () => {
    const h = harness();
    const users = Array.from({ length: 7 }, (_, i) => `${i}0000000-0000-4000-8000-00000000000${i}`);
    for (const user of users) {
      h.addAccount(user);
      h.api.script(user, active(user));
    }
    const summary = await h.run({ limit: 5 });
    expect(summary.processed).toBe(5);
    expect(h.api.calls).toHaveLength(5);
    expect(h.waits).toEqual([1000, 1000, 1000, 1000]);
    expect(summary.requests).toBe(5);
  });

  it('a rate limit that survived the client’s retries stops the pass: the account is FAILED, the rest untouched and unleased, STOPPED reported', async () => {
    const h = harness();
    for (const user of [USER_A, USER_B, USER_C]) h.addAccount(user);
    h.api.script(USER_A, active(USER_A));
    h.api.script(USER_B, { kind: 'failure', failure: 'rate_limited', status: 429, attempts: 3 });
    h.api.script(USER_C, active(USER_C));
    const sorted = [USER_A, USER_B, USER_C].sort();
    const summary = await h.run();
    const stopIndex = sorted.indexOf(USER_B);
    expect(summary).toMatchObject({ status: 'STOPPED', processed: stopIndex + 1, nextCursor: null });
    expect(summary.stoppedBy).toContain('rate-limited');
    expect(h.api.calls).toEqual(sorted.slice(0, stopIndex + 1));
    for (const user of sorted.slice(stopIndex + 1)) expect(h.control.state(user).leaseRunId).toBeNull();
    expect(h.control.runs[0]).toMatchObject({ status: 'STOPPED' });
    expect(h.control.runs[0].lastError).toContain('rate-limited');
  });

  it('an unauthorized key stops the pass at once — a configuration problem, not a reason to burn through the batch', async () => {
    const h = harness();
    for (const user of [USER_A, USER_B]) {
      h.addAccount(user);
      h.api.script(user, { kind: 'failure', failure: 'unauthorized', status: 401, attempts: 1 });
    }
    const summary = await h.run();
    expect(summary).toMatchObject({ status: 'STOPPED', processed: 1, requests: 1 });
    expect(summary.stoppedBy).toContain('unauthorized');
    expect(h.api.calls).toHaveLength(1);
  });

  it('a database refusal to record an outcome fails the pass, closes the run as FAILED with a bounded message, and reports what was processed', async () => {
    const h = harness();
    for (const user of [USER_A, USER_B]) {
      h.addAccount(user);
      h.api.script(user, active(user));
    }
    h.control.failNextSettle = new Error('subscription reconciliation: subscription_reconciliation_settle failed: connection lost sk_LEAKED123');
    const summary = await h.run();
    expect(summary).toMatchObject({ status: 'FAILED', processed: 1, nextCursor: null });
    expect(summary.stoppedBy).toContain('subscription_reconciliation_settle failed');
    expect(summary.stoppedBy).not.toContain('sk_LEAKED123');
    expect(h.control.runs[0].status).toBe('FAILED');
  });

  it('a claim failure propagates: nothing processed, no run to close', async () => {
    const h = harness();
    h.control.claim = async () => {
      throw new Error('subscription reconciliation: subscription_reconciliation_claim failed: 42501');
    };
    await expect(h.run()).rejects.toThrow('subscription_reconciliation_claim failed');
    expect(h.api.calls).toEqual([]);
  });

  it('a SWEEP selects the mirrored accounts only, skips leased and backed-off ones, and carries no cursor', async () => {
    const h = harness();
    h.addAccount(USER_A, { mirrorRows: 1 });
    h.addAccount(USER_B, { mirrorRows: 1 });
    h.addAccount(USER_C, { mirrorRows: 0 });
    h.control.state(USER_A).leaseRunId = 'another-pass';
    h.api.script(USER_B, active(USER_B));
    const summary = await h.run({ kind: 'SWEEP', scope: { source: 'mirrored' } });
    expect(summary).toMatchObject({ kind: 'SWEEP', processed: 1, skipped: { leased: 1, recent: 0, backoff: 0 }, eligible: 1, nextCursor: null });
    expect(h.api.calls).toEqual([USER_B]);
  });

  it('the log line carries counts and vocabularies only — never a user id, a product or a key', () => {
    const line = describePassForLog({
      runId: 'run-1',
      kind: 'BACKFILL',
      mode: 'APPLY',
      status: 'COMPLETED',
      stoppedBy: null,
      selected: 1,
      processed: 1,
      counts: { APPLIED: 1 },
      requests: 1,
      accounts: [{ userId: USER_A, outcome: 'APPLIED', detail: null, requests: 1, accessBefore: false, accessAfter: true, changes: [], unlisted: [], failure: null }],
      unknownUsers: [USER_B],
      skipped: { leased: 0, recent: 0, backoff: 0 },
      eligible: 1,
      nextCursor: USER_A,
    });
    const text = JSON.stringify(line);
    expect(text).not.toContain(USER_A);
    expect(text).not.toContain(USER_B);
    expect(text).not.toContain(MONTHLY);
    expect(line).toMatchObject({ unknownUsers: 1, hasNextCursor: true, counts: { APPLIED: 1 } });
    expect(sanitizeFailure(new Error('Bearer sk_ABC123 leaked'))).toBe('Bearer … leaked');
    expect(sanitizeFailure(new Error('key sk_ABC123 leaked'))).toBe('key sk_… leaked');
    expect(sanitizeFailure('nope')).toBe('pass failed');
  });
});
